import 'server-only';
import { prisma } from '@/server/db';
import type { SessionUser } from '@/server/auth/session';

/** Primeiro dia do mês, N meses atrás. */
function mesesAtras(n: number): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - n, 1);
}

function chaveMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function rotuloMes(chave: string): string {
  const [ano, mes] = chave.split('-');
  return `${NOMES_MES[Number(mes) - 1]}/${ano.slice(2)}`;
}

/** Série dos últimos 12 meses: entradas de caixa contra saídas. */
export async function getCashFlowSeries(user: SessionUser) {
  const desde = mesesAtras(11);

  const [recebimentos, pagamentos] = await Promise.all([
    prisma.receipt.findMany({
      where: { companyId: user.companyId, reversedAt: null, receivedAt: { gte: desde } },
      select: { receivedAt: true, amount: true },
    }),
    prisma.payable.findMany({
      where: { companyId: user.companyId, deletedAt: null, status: 'PAGO', paidAt: { gte: desde } },
      select: { paidAt: true, paidAmount: true, amount: true },
    }),
  ]);

  const meses = new Map<string, { entrada: number; saida: number }>();
  for (let i = 11; i >= 0; i--) meses.set(chaveMes(mesesAtras(i)), { entrada: 0, saida: 0 });

  for (const r of recebimentos) {
    const k = chaveMes(r.receivedAt);
    const m = meses.get(k);
    if (m) m.entrada += Number(r.amount);
  }
  for (const p of pagamentos) {
    if (!p.paidAt) continue;
    const k = chaveMes(p.paidAt);
    const m = meses.get(k);
    if (m) m.saida += Number(p.paidAmount ?? p.amount);
  }

  return [...meses.entries()].map(([mes, v]) => ({
    mes,
    rotulo: rotuloMes(mes),
    entrada: v.entrada,
    saida: v.saida,
    saldo: v.entrada - v.saida,
  }));
}

/** Funil comercial: quantos e quanto em cada etapa aberta do pipeline. */
export async function getSalesFunnel(user: SessionUser) {
  const etapas = await prisma.opportunityStage.findMany({
    where: { companyId: user.companyId, active: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, kind: true, color: true },
  });

  const abertas = await prisma.opportunity.groupBy({
    by: ['stageId'],
    where: { companyId: user.companyId, deletedAt: null, closedAt: null },
    _count: true,
    _sum: { estimatedValue: true },
  });

  return etapas
    .filter((e) => e.kind !== 'GANHA' && e.kind !== 'PERDIDA')
    .map((e) => {
      const dados = abertas.find((a) => a.stageId === e.id);
      return {
        etapa: e.name,
        cor: e.color,
        quantidade: dados?._count ?? 0,
        valor: dados?._sum.estimatedValue?.toString() ?? '0',
      };
    });
}

/** Conversão de propostas nos últimos 12 meses. */
export async function getConversionRate(user: SessionUser) {
  const desde = mesesAtras(11);
  const propostas = await prisma.proposal.findMany({
    where: { companyId: user.companyId, deletedAt: null, createdAt: { gte: desde } },
    select: {
      status: true,
      budgetVersion: { select: { total: true } },
    },
  });

  const aceitas = propostas.filter((p) => p.status === 'ACEITA');
  const recusadas = propostas.filter((p) => p.status === 'RECUSADA');
  const decididas = aceitas.length + recusadas.length;

  return {
    emitidas: propostas.length,
    aceitas: aceitas.length,
    recusadas: recusadas.length,
    emAberto: propostas.length - decididas,
    taxa: decididas > 0 ? Math.round((aceitas.length / decididas) * 100) : 0,
    valorGanho: aceitas.reduce((acc, p) => acc + Number(p.budgetVersion.total), 0).toFixed(2),
    valorPerdido: recusadas.reduce((acc, p) => acc + Number(p.budgetVersion.total), 0).toFixed(2),
  };
}

/** Situação da carteira de projetos, por coluna do quadro. */
export async function getProjectsOverview(user: SessionUser) {
  const projetos = await prisma.project.findMany({
    where: { companyId: user.companyId, deletedAt: null, archivedAt: null },
    select: {
      id: true, code: true, name: true, status: true, contractValue: true,
      contractualDeadline: true,
      client: { select: { legalName: true, tradeName: true } },
    },
  });

  const inicioDia = new Date();
  inicioDia.setHours(0, 0, 0, 0);
  const encerrados = ['CONCLUIDO', 'ENCERRADO', 'CANCELADO'];

  const atrasados = projetos.filter(
    (p) => p.contractualDeadline && p.contractualDeadline < inicioDia && !encerrados.includes(p.status),
  );

  return {
    total: projetos.length,
    ativos: projetos.filter((p) => !encerrados.includes(p.status)).length,
    concluidos: projetos.filter((p) => p.status === 'CONCLUIDO').length,
    atrasados,
    valorCarteira: projetos
      .filter((p) => !encerrados.includes(p.status))
      .reduce((acc, p) => acc + Number(p.contractValue ?? 0), 0)
      .toFixed(2),
  };
}

/** Horas apontadas por projeto, com custo — base para saber se o projeto paga. */
export async function getHoursByProject(user: SessionUser) {
  const entradas = await prisma.timeEntry.findMany({
    where: { companyId: user.companyId, deletedAt: null },
    select: {
      hours: true, hourlyCost: true, billable: true,
      project: { select: { id: true, code: true, name: true, contractValue: true } },
    },
  });

  const porProjeto = new Map<string, {
    code: string; name: string; horas: number; custo: number; valor: number;
  }>();

  for (const e of entradas) {
    const atual = porProjeto.get(e.project.id) ?? {
      code: e.project.code, name: e.project.name, horas: 0, custo: 0,
      valor: Number(e.project.contractValue ?? 0),
    };
    atual.horas += Number(e.hours);
    atual.custo += Number(e.hours) * Number(e.hourlyCost ?? 0);
    porProjeto.set(e.project.id, atual);
  }

  return [...porProjeto.entries()]
    .map(([id, v]) => ({ id, ...v, horas: Number(v.horas.toFixed(1)), custo: v.custo.toFixed(2) }))
    .sort((a, b) => b.horas - a.horas);
}

/** Clientes que mais faturaram, pelo que foi efetivamente recebido. */
export async function getTopClients(user: SessionUser, limite = 10) {
  const recebimentos = await prisma.receipt.findMany({
    where: { companyId: user.companyId, reversedAt: null },
    select: {
      amount: true,
      receivable: { select: { clientId: true, client: { select: { legalName: true, tradeName: true } } } },
    },
  });

  const porCliente = new Map<string, { nome: string; total: number; quantidade: number }>();
  for (const r of recebimentos) {
    const c = r.receivable;
    const atual = porCliente.get(c.clientId) ?? {
      nome: c.client.tradeName ?? c.client.legalName, total: 0, quantidade: 0,
    };
    atual.total += Number(r.amount);
    atual.quantidade += 1;
    porCliente.set(c.clientId, atual);
  }

  return [...porCliente.entries()]
    .map(([id, v]) => ({ id, nome: v.nome, total: v.total.toFixed(2), quantidade: v.quantidade }))
    .sort((a, b) => Number(b.total) - Number(a.total))
    .slice(0, limite);
}

/** Inadimplência por faixa de atraso. */
export async function getDelinquency(user: SessionUser) {
  const inicioDia = new Date();
  inicioDia.setHours(0, 0, 0, 0);

  const vencidas = await prisma.receivable.findMany({
    where: {
      companyId: user.companyId, deletedAt: null,
      dueDate: { lt: inicioDia },
      status: { notIn: ['RECEBIDO', 'CANCELADO'] },
    },
    include: { receipts: { where: { reversedAt: null }, select: { amount: true } } },
  });

  const faixas = [
    { titulo: 'Até 30 dias', ate: 30, total: 0, quantidade: 0 },
    { titulo: '31 a 60 dias', ate: 60, total: 0, quantidade: 0 },
    { titulo: '61 a 90 dias', ate: 90, total: 0, quantidade: 0 },
    { titulo: 'Mais de 90 dias', ate: Infinity, total: 0, quantidade: 0 },
  ];

  for (const r of vencidas) {
    const recebido = r.receipts.reduce((acc, x) => acc + Number(x.amount), 0);
    const saldo = Number(r.netValue) - recebido;
    if (saldo <= 0) continue;
    const dias = Math.floor((inicioDia.getTime() - r.dueDate.getTime()) / 86_400_000);
    const faixa = faixas.find((f) => dias <= f.ate)!;
    faixa.total += saldo;
    faixa.quantidade += 1;
  }

  return faixas.map((f) => ({ ...f, total: f.total.toFixed(2) }));
}
