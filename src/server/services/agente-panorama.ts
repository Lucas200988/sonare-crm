import 'server-only';
import { prisma } from '@/server/db';
import { STATUS_TRABALHO_ENCERRADO } from '@/config/project-status';
import { formatBRL } from '@/lib/money';
import type { ProjectStatus, TaskStatus } from '@/generated/prisma/client';
import type { SessionUser } from '@/server/auth/session';

/**
 * Panoramas por pessoa para os briefings por perfil.
 *
 * `panoramaPessoal` é o que é DE QUEM LÊ: acesso, registros, horas, tarefas,
 * projetos sob sua responsabilidade e conquistas próprias. `panoramaDaEquipe`
 * é a mesma coisa para cada pessoa, visto por quem gerencia — os FATOS que
 * sustentam reconhecer ou cobrar nominalmente. Em ambos vale a ressalva de
 * sempre: registro no CRM não é a medida do trabalho.
 */

const pode = (user: SessionUser, p: string) => user.permissions.has(p);
const TAREFA_ABERTA = { notIn: ['CONCLUIDA', 'CANCELADA'] as TaskStatus[] };
const PROJETO_FECHADO = [...STATUS_TRABALHO_ENCERRADO] as ProjectStatus[];
const TRES_DIAS = 3 * 86_400_000;
const SETE_DIAS = 7 * 86_400_000;

const RESSALVA = 'Registros no CRM não são a medida do trabalho: ausência de registro não é ausência de trabalho. Acesso ao sistema é fato; "não trabalhou" é julgamento — nunca faça.';

export async function panoramaPessoal(user: SessionUser, desde: Date) {
  const agora = new Date();
  const minha = { companyId: user.companyId, deletedAt: null, assigneeId: user.id, status: TAREFA_ABERTA };
  const tarefa = { title: true, dueAt: true, project: { select: { code: true } } } as const;

  const [dados, acessos, registros, horas, abertas, vencidas, vencendo, concluidas, projetos, negocios] = await Promise.all([
    prisma.user.findFirst({ where: { id: user.id }, select: { lastLoginAt: true } }),
    prisma.session.count({ where: { userId: user.id, createdAt: { gte: desde } } }),
    prisma.auditLog.count({ where: { companyId: user.companyId, userId: user.id, createdAt: { gte: desde } } }),
    prisma.timeEntry.aggregate({ where: { companyId: user.companyId, userId: user.id, workDate: { gte: desde } }, _sum: { hours: true } }),
    prisma.task.count({ where: minha }),
    prisma.task.findMany({ where: { ...minha, dueAt: { lt: agora } }, select: tarefa, orderBy: { dueAt: 'asc' }, take: 5 }),
    prisma.task.findMany({
      where: { ...minha, dueAt: { gte: agora, lte: new Date(agora.getTime() + TRES_DIAS) } },
      select: tarefa, orderBy: { dueAt: 'asc' }, take: 5,
    }),
    prisma.task.count({ where: { companyId: user.companyId, deletedAt: null, assigneeId: user.id, completedAt: { gte: desde } } }),
    prisma.project.findMany({
      where: {
        companyId: user.companyId, deletedAt: null, archivedAt: null, status: { notIn: PROJETO_FECHADO },
        OR: [{ technicalLeadId: user.id }, { members: { some: { userId: user.id } } }],
      },
      select: { code: true, name: true, status: true, contractualDeadline: true, technicalLeadId: true },
      orderBy: { contractualDeadline: 'asc' },
    }),
    pode(user, 'opportunity:read')
      ? prisma.opportunity.findMany({
          where: { companyId: user.companyId, deletedAt: null, commercialOwnerId: user.id, closedAt: { gte: desde }, stage: { kind: 'GANHA' } },
          select: { code: true, title: true, estimatedValue: true, client: { select: { legalName: true, tradeName: true } } },
          take: 5,
        })
      : [],
  ]);

  const limite = new Date(agora.getTime() + SETE_DIAS);
  return {
    observacao: RESSALVA,
    acesso: { ultimoEm: dados?.lastLoginAt ?? null, acessouNoPeriodo: acessos > 0 },
    registrosNoPeriodo: registros,
    horasLancadasNoPeriodo: horas._sum.hours?.toString() ?? '0',
    tarefas: {
      abertas,
      concluidasNoPeriodo: concluidas,
      vencidas: vencidas.map((t) => ({ titulo: t.title, projeto: t.project?.code ?? null, venceuEm: t.dueAt })),
      vencemEm3Dias: vencendo.map((t) => ({ titulo: t.title, projeto: t.project?.code ?? null, venceEm: t.dueAt })),
    },
    projetosSobMinhaResponsabilidade: projetos.map((p) => ({
      codigo: p.code,
      nome: p.name,
      status: p.status,
      papel: p.technicalLeadId === user.id ? 'responsável técnico' : 'equipe',
      prazoContratual: p.contractualDeadline,
      situacaoDoPrazo: !p.contractualDeadline ? 'sem prazo'
        : p.contractualDeadline < agora ? 'VENCIDO'
          : p.contractualDeadline <= limite ? 'vence em até 7 dias' : 'no prazo',
    })),
    conquistasPessoais: {
      negociosGanhos: negocios.map((n) => ({
        codigo: n.code,
        titulo: n.title,
        cliente: n.client.tradeName ?? n.client.legalName,
        valorEstimado: n.estimatedValue ? formatBRL(n.estimatedValue.toString()) : null,
      })),
    },
  };
}

/** A equipe vista por quem gerencia. Só para quem tem user:manage. */
export async function panoramaDaEquipe(user: SessionUser, desde: Date) {
  if (!pode(user, 'user:manage')) return null;
  const agora = new Date();
  const base = { companyId: user.companyId };

  const [pessoas, acessos, registros, vencidas, abertas, horas, negocios, disponibilidades] = await Promise.all([
    prisma.user.findMany({
      where: { ...base, deletedAt: null, active: true },
      select: { id: true, name: true, lastLoginAt: true, roles: { select: { role: { select: { code: true } } } } },
      orderBy: { name: 'asc' },
    }),
    prisma.session.groupBy({ by: ['userId'], where: { createdAt: { gte: desde }, user: base }, _count: { _all: true } }),
    prisma.auditLog.groupBy({ by: ['userId'], where: { ...base, createdAt: { gte: desde } }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ['assigneeId'], where: { ...base, deletedAt: null, status: TAREFA_ABERTA, dueAt: { lt: agora } }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ['assigneeId'], where: { ...base, deletedAt: null, status: TAREFA_ABERTA }, _count: { _all: true } }),
    prisma.timeEntry.groupBy({ by: ['userId'], where: { ...base, workDate: { gte: desde } }, _sum: { hours: true } }),
    prisma.opportunity.findMany({
      where: { ...base, deletedAt: null, closedAt: { gte: desde }, stage: { kind: 'GANHA' }, commercialOwnerId: { not: null } },
      select: { code: true, estimatedValue: true, commercialOwnerId: true },
    }),
    prisma.agentMemory.findMany({
      where: {
        ...base, deletedAt: null, type: 'USER_AVAILABILITY', subjectType: 'user',
        OR: [{ validUntil: null }, { validUntil: { gte: agora } }],
        AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: agora } }] }],
      },
      select: { subjectId: true, content: true },
    }),
  ]);

  const contagem = (lista: Array<{ _count: { _all: number } } & Record<string, unknown>>, chave: string) =>
    new Map(lista.map((x) => [x[chave] as string | null, x._count._all]));
  const porAcesso = contagem(acessos, 'userId');
  const porRegistro = contagem(registros, 'userId');
  const porVencida = contagem(vencidas, 'assigneeId');
  const porAberta = contagem(abertas, 'assigneeId');
  const porHoras = new Map(horas.map((h) => [h.userId, h._sum.hours?.toString() ?? '0']));

  const vendas = new Map<string, { quantidade: number; valor: number; codigos: string[] }>();
  for (const n of negocios) {
    const dono = n.commercialOwnerId as string;
    const atual = vendas.get(dono) ?? { quantidade: 0, valor: 0, codigos: [] };
    atual.quantidade += 1;
    atual.valor += Number(n.estimatedValue ?? 0);
    atual.codigos.push(n.code);
    vendas.set(dono, atual);
  }
  const porDisponibilidade = new Map<string, string[]>();
  for (const d of disponibilidades) {
    if (d.subjectId) porDisponibilidade.set(d.subjectId, [...(porDisponibilidade.get(d.subjectId) ?? []), d.content]);
  }

  return {
    observacao: `${RESSALVA} Considere a disponibilidade conhecida (férias, campo) antes de cobrar.`,
    pessoas: pessoas
      // o próprio agente não é equipe
      .filter((p) => !p.roles.some((r) => r.role.code === 'AGENTE_IA'))
      .map((p) => {
        const v = vendas.get(p.id);
        return {
          nome: p.name,
          souEu: p.id === user.id,
          papeis: p.roles.map((r) => r.role.code),
          ultimoAcessoEm: p.lastLoginAt,
          acessouNoPeriodo: (porAcesso.get(p.id) ?? 0) > 0,
          registrosNoPeriodo: porRegistro.get(p.id) ?? 0,
          tarefasAbertas: porAberta.get(p.id) ?? 0,
          tarefasVencidas: porVencida.get(p.id) ?? 0,
          horasLancadasNoPeriodo: porHoras.get(p.id) ?? '0',
          negociosGanhosNoPeriodo: v
            ? { quantidade: v.quantidade, valor: v.valor > 0 ? formatBRL(v.valor.toFixed(2)) : null, codigos: v.codigos }
            : null,
          disponibilidadeConhecida: porDisponibilidade.get(p.id) ?? [],
        };
      }),
  };
}
