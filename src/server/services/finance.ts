import 'server-only';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { nextCode } from '@/server/services/sequence';
import { parseDateInput } from '@/lib/dates';
import { enviarEmail, layoutEmail } from '@/server/mail';
import type { Prisma, ReceivableStatus, PayableStatus } from '@/generated/prisma/client';
import type { SessionUser } from '@/server/auth/session';

/** Situações em que a parcela ainda não entrou no caixa. */
const EM_ABERTO: ReceivableStatus[] = [
  'PREVISTO', 'A_FATURAR', 'AGUARDANDO_AUTORIZACAO', 'NF_EMITIDA', 'ENVIADO_AO_CLIENTE',
  'A_VENCER', 'VENCIDO', 'PARCIALMENTE_RECEBIDO', 'EM_COBRANCA', 'INADIMPLENTE',
];

/** Início do dia de hoje no fuso da empresa — base das comparações de vencimento. */
function hoje(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---------- Painel ----------

export async function getFinanceSummary(user: SessionUser) {
  const inicioDia = hoje();
  const em7dias = new Date(inicioDia);
  em7dias.setDate(em7dias.getDate() + 7);
  const inicioMes = new Date(inicioDia.getFullYear(), inicioDia.getMonth(), 1);
  const proximoMes = new Date(inicioDia.getFullYear(), inicioDia.getMonth() + 1, 1);

  const base = { companyId: user.companyId, deletedAt: null };

  const [vencidos, vencem7, recebidoMes, aPagarVencidos, aPagar7, pagoMes] = await Promise.all([
    prisma.receivable.aggregate({
      where: { ...base, status: { in: EM_ABERTO }, dueDate: { lt: inicioDia } },
      _sum: { netValue: true }, _count: true,
    }),
    prisma.receivable.aggregate({
      where: { ...base, status: { in: EM_ABERTO }, dueDate: { gte: inicioDia, lte: em7dias } },
      _sum: { netValue: true }, _count: true,
    }),
    prisma.receipt.aggregate({
      where: {
        companyId: user.companyId, reversedAt: null,
        receivedAt: { gte: inicioMes, lt: proximoMes },
      },
      _sum: { amount: true },
    }),
    prisma.payable.aggregate({
      where: { ...base, status: 'A_PAGAR', dueDate: { lt: inicioDia } },
      _sum: { amount: true }, _count: true,
    }),
    prisma.payable.aggregate({
      where: { ...base, status: 'A_PAGAR', dueDate: { gte: inicioDia, lte: em7dias } },
      _sum: { amount: true }, _count: true,
    }),
    prisma.payable.aggregate({
      where: { ...base, status: 'PAGO', paidAt: { gte: inicioMes, lt: proximoMes } },
      _sum: { paidAmount: true },
    }),
  ]);

  const num = (v: Prisma.Decimal | null | undefined) => (v ? v.toString() : '0');

  return {
    receber: {
      vencidoValor: num(vencidos._sum.netValue), vencidoQtd: vencidos._count,
      proximoValor: num(vencem7._sum.netValue), proximoQtd: vencem7._count,
      recebidoMes: num(recebidoMes._sum.amount),
    },
    pagar: {
      vencidoValor: num(aPagarVencidos._sum.amount), vencidoQtd: aPagarVencidos._count,
      proximoValor: num(aPagar7._sum.amount), proximoQtd: aPagar7._count,
      pagoMes: num(pagoMes._sum.paidAmount),
    },
  };
}

// ---------- Contas a receber ----------

export type ReceivableFilter = {
  search?: string;
  situacao?: 'ABERTO' | 'VENCIDO' | 'RECEBIDO' | 'TODOS';
  clientId?: string;
  page?: number;
};

export async function listReceivables(user: SessionUser, filter: ReceivableFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = 30;
  const where: Prisma.ReceivableWhereInput = { companyId: user.companyId, deletedAt: null };

  if (filter.clientId) where.clientId = filter.clientId;
  if (filter.situacao === 'VENCIDO') {
    where.status = { in: EM_ABERTO };
    where.dueDate = { lt: hoje() };
  } else if (filter.situacao === 'RECEBIDO') {
    where.status = 'RECEBIDO';
  } else if (filter.situacao !== 'TODOS') {
    where.status = { in: EM_ABERTO }; // padrão: em aberto
  }
  if (filter.search) {
    where.OR = [
      { code: { contains: filter.search, mode: 'insensitive' } },
      { description: { contains: filter.search, mode: 'insensitive' } },
      { client: { legalName: { contains: filter.search, mode: 'insensitive' } } },
    ];
  }

  const [total, items, soma] = await prisma.$transaction([
    prisma.receivable.count({ where }),
    prisma.receivable.findMany({
      where,
      include: {
        client: { select: { id: true, legalName: true, tradeName: true } },
        contract: { select: { id: true, code: true } },
        project: { select: { id: true, code: true } },
        receipts: { where: { reversedAt: null }, select: { amount: true } },
      },
      orderBy: { dueDate: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.receivable.aggregate({ where, _sum: { netValue: true } }),
  ]);

  return {
    items, total, page, pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    somaValor: soma._sum.netValue?.toString() ?? '0',
  };
}

export type ReceivableInput = {
  clientId: string;
  description: string;
  dueDate: string;
  grossValue: string;
  contractId?: string | null;
  projectId?: string | null;
  notes?: string | null;
  /** Entrada paga na hora: cria a cobrança e a baixa num passo só. */
  jaRecebido?: boolean;
};

export async function createReceivable(user: SessionUser, input: ReceivableInput) {
  const client = await prisma.client.findFirst({
    where: { id: input.clientId, companyId: user.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!client) return { error: 'Cliente não encontrado.' };

  const vencimento = parseDateInput(input.dueDate);
  if (!vencimento) return { error: 'Informe a data de vencimento.' };

  const receivable = await prisma.$transaction(async (tx) => {
    const code = await nextCode(user.companyId, 'PARC', tx);
    const criada = await tx.receivable.create({
      data: {
        companyId: user.companyId,
        code,
        clientId: input.clientId,
        contractId: input.contractId || null,
        projectId: input.projectId || null,
        description: input.description,
        dueDate: vencimento,
        grossValue: input.grossValue,
        netValue: input.grossValue,
        notes: input.notes || null,
        status: input.jaRecebido ? 'RECEBIDO' : 'A_VENCER',
        createdById: user.id,
      },
    });

    // Entrada quitada no ato: registra a baixa junto, sem um segundo passo
    if (input.jaRecebido) {
      await tx.receipt.create({
        data: {
          companyId: user.companyId,
          receivableId: criada.id,
          receivedAt: vencimento,
          amount: input.grossValue,
          createdById: user.id,
        },
      });
    }
    return criada;
  });

  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'create',
    entityType: 'receivable', entityId: receivable.id, after: { code: receivable.code },
  });
  return { receivable };
}

/**
 * Gera as parcelas de um contrato assinado a partir do número de vezes e do
 * primeiro vencimento — o caminho comum, sem redigitar valor por valor.
 */
export async function generateInstallments(
  user: SessionUser,
  contractId: string,
  input: { quantidade: number; primeiroVencimento: string; intervaloDias: number },
) {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, companyId: user.companyId, deletedAt: null },
    include: { projects: { where: { deletedAt: null }, select: { id: true }, take: 1 } },
  });
  if (!contract) return { error: 'Contrato não encontrado.' };
  if (!['ASSINADO', 'VIGENTE'].includes(contract.status)) {
    return { error: 'Gere as parcelas apenas de contratos assinados ou vigentes.' };
  }
  const jaExistem = await prisma.receivable.count({ where: { contractId, deletedAt: null } });
  if (jaExistem > 0) return { error: 'Este contrato já possui parcelas geradas.' };

  const primeiro = parseDateInput(input.primeiroVencimento);
  if (!primeiro) return { error: 'Informe o primeiro vencimento.' };
  if (input.quantidade < 1 || input.quantidade > 60) {
    return { error: 'A quantidade de parcelas deve estar entre 1 e 60.' };
  }

  const total = Number(contract.totalValue);
  // A diferença de arredondamento vai para a primeira parcela
  const valorParcela = Math.floor((total / input.quantidade) * 100) / 100;
  const sobra = Math.round((total - valorParcela * input.quantidade) * 100) / 100;

  const criadas = await prisma.$transaction(async (tx) => {
    const lista = [];
    for (let i = 0; i < input.quantidade; i++) {
      const code = await nextCode(user.companyId, 'PARC', tx);
      const vencimento = new Date(primeiro);
      vencimento.setDate(vencimento.getDate() + i * input.intervaloDias);
      const valor = (i === 0 ? valorParcela + sobra : valorParcela).toFixed(2);

      lista.push(await tx.receivable.create({
        data: {
          companyId: user.companyId,
          code,
          clientId: contract.clientId,
          contractId: contract.id,
          projectId: contract.projects[0]?.id ?? null,
          description: `${contract.subject} — parcela ${i + 1}/${input.quantidade}`,
          installmentNumber: i + 1,
          dueDate: vencimento,
          grossValue: valor,
          netValue: valor,
          status: 'A_VENCER',
          createdById: user.id,
        },
      }));
    }
    return lista;
  });

  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'create',
    entityType: 'receivable', entityId: contract.id,
    after: { parcelas: criadas.length, contrato: contract.code },
  });
  return { quantidade: criadas.length };
}

/** Baixa (recebimento) da parcela; recebimento parcial mantém o saldo em aberto. */
export async function registerReceipt(
  user: SessionUser,
  receivableId: string,
  input: { receivedAt: string; amount: string; interest?: string; fine?: string; discount?: string; notes?: string | null },
) {
  const receivable = await prisma.receivable.findFirst({
    where: { id: receivableId, companyId: user.companyId, deletedAt: null },
    include: { receipts: { where: { reversedAt: null } } },
  });
  if (!receivable) return { error: 'Parcela não encontrada.' };
  if (receivable.status === 'RECEBIDO') return { error: 'Esta parcela já foi recebida.' };

  const data = parseDateInput(input.receivedAt);
  if (!data) return { error: 'Informe a data do recebimento.' };
  const valor = Number(input.amount);
  if (!(valor > 0)) return { error: 'O valor recebido deve ser maior que zero.' };

  const jaRecebido = receivable.receipts.reduce((acc, r) => acc + Number(r.amount), 0);
  const total = Number(receivable.netValue);
  const acumulado = jaRecebido + valor;
  // tolerância de 1 centavo para arredondamentos
  const quitado = acumulado >= total - 0.01;

  await prisma.$transaction([
    prisma.receipt.create({
      data: {
        companyId: user.companyId,
        receivableId,
        receivedAt: data,
        amount: input.amount,
        interest: input.interest || '0',
        fine: input.fine || '0',
        discount: input.discount || '0',
        notes: input.notes || null,
        createdById: user.id,
      },
    }),
    prisma.receivable.update({
      where: { id: receivableId },
      data: { status: quitado ? 'RECEBIDO' : 'PARCIALMENTE_RECEBIDO', updatedById: user.id },
    }),
  ]);

  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'receipt',
    entityType: 'receivable', entityId: receivableId,
    after: { valor: input.amount, quitado },
  });
  return { ok: true, quitado };
}

export async function cancelReceivable(user: SessionUser, id: string) {
  const receivable = await prisma.receivable.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
    include: { receipts: { where: { reversedAt: null }, select: { id: true } } },
  });
  if (!receivable) return { error: 'Parcela não encontrada.' };
  if (receivable.receipts.length > 0) {
    return { error: 'Esta parcela tem recebimento lançado. Estorne antes de cancelar.' };
  }

  await prisma.receivable.update({ where: { id }, data: { status: 'CANCELADO', updatedById: user.id } });
  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'cancel',
    entityType: 'receivable', entityId: id,
  });
  return { ok: true };
}

/**
 * Situação financeira de um projeto: o que foi cobrado, recebido, ainda falta
 * e quanto saiu em despesas ligadas a ele.
 */
export async function getProjectFinance(user: SessionUser, projectId: string) {
  const [receivables, payables] = await Promise.all([
    prisma.receivable.findMany({
      where: { projectId, companyId: user.companyId, deletedAt: null },
      include: { receipts: { where: { reversedAt: null }, select: { amount: true } } },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.payable.findMany({
      where: { projectId, companyId: user.companyId, deletedAt: null },
      orderBy: { dueDate: 'asc' },
    }),
  ]);

  const ativos = receivables.filter((r) => r.status !== 'CANCELADO');
  const cobrado = ativos.reduce((acc, r) => acc + Number(r.netValue), 0);
  const recebido = ativos.reduce(
    (acc, r) => acc + r.receipts.reduce((s, x) => s + Number(x.amount), 0),
    0,
  );
  const despesas = payables
    .filter((p) => p.status !== 'CANCELADO')
    .reduce((acc, p) => acc + Number(p.paidAmount ?? p.amount), 0);

  return {
    receivables,
    payables,
    resumo: {
      cobrado: cobrado.toFixed(2),
      recebido: recebido.toFixed(2),
      aReceber: Math.max(0, cobrado - recebido).toFixed(2),
      despesas: despesas.toFixed(2),
      saldo: (recebido - despesas).toFixed(2),
    },
  };
}

// ---------- Notas fiscais ----------

export type InvoiceFilter = { search?: string; status?: string; page?: number };

export async function listInvoices(user: SessionUser, filter: InvoiceFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = 30;
  const where: Prisma.InvoiceWhereInput = { companyId: user.companyId, deletedAt: null };

  if (filter.status && filter.status !== 'TODOS') where.status = filter.status as never;
  if (filter.search) {
    where.OR = [
      { number: { contains: filter.search, mode: 'insensitive' } },
      { serviceDescription: { contains: filter.search, mode: 'insensitive' } },
      { client: { legalName: { contains: filter.search, mode: 'insensitive' } } },
    ];
  }

  const [total, items, soma] = await prisma.$transaction([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      include: {
        client: { select: { legalName: true, tradeName: true } },
        project: { select: { code: true } },
        receivables: { include: { receivable: { select: { code: true } } } },
      },
      orderBy: { issueDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invoice.aggregate({ where, _sum: { netValue: true } }),
  ]);

  return {
    items, total, page, pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    somaValor: soma._sum.netValue?.toString() ?? '0',
  };
}

export type InvoiceInput = {
  number: string;
  series?: string | null;
  issueDate: string;
  clientId: string;
  grossValue: string;
  retentionsTotal?: string | null;
  serviceDescription?: string | null;
  externalLink?: string | null;
  projectId?: string | null;
  receivableIds?: string[];
};

/**
 * Registro da NFS-e emitida no portal da prefeitura. O sistema não emite a
 * nota — guarda o número, o valor e o vínculo com as parcelas, para o
 * financeiro saber o que já foi faturado.
 */
export async function createInvoice(user: SessionUser, input: InvoiceInput) {
  const emissao = parseDateInput(input.issueDate);
  if (!emissao) return { error: 'Informe a data de emissão.' };

  const client = await prisma.client.findFirst({
    where: { id: input.clientId, companyId: user.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!client) return { error: 'Cliente não encontrado.' };

  const duplicada = await prisma.invoice.findFirst({
    where: {
      companyId: user.companyId, number: input.number,
      series: input.series || null, deletedAt: null,
    },
    select: { id: true },
  });
  if (duplicada) return { error: `A nota ${input.number} já está registrada.` };

  const bruto = Number(input.grossValue);
  const retencoes = Number(input.retentionsTotal ?? 0);
  if (retencoes > bruto) return { error: 'As retenções não podem superar o valor bruto.' };
  const liquido = (bruto - retencoes).toFixed(2);

  const invoice = await prisma.invoice.create({
    data: {
      companyId: user.companyId,
      number: input.number,
      series: input.series || null,
      issueDate: emissao,
      clientId: input.clientId,
      projectId: input.projectId || null,
      grossValue: input.grossValue,
      retentionsTotal: retencoes.toFixed(2),
      netValue: liquido,
      serviceDescription: input.serviceDescription || null,
      externalLink: input.externalLink || null,
      status: 'EMITIDA',
      createdById: user.id,
      receivables: input.receivableIds?.length
        ? { create: input.receivableIds.map((receivableId) => ({ receivableId })) }
        : undefined,
    },
  });

  // As parcelas vinculadas passam a constar como faturadas
  if (input.receivableIds?.length) {
    await prisma.receivable.updateMany({
      where: {
        id: { in: input.receivableIds },
        companyId: user.companyId,
        status: { in: ['PREVISTO', 'A_FATURAR', 'AGUARDANDO_AUTORIZACAO', 'A_VENCER'] },
      },
      data: { status: 'NF_EMITIDA' },
    });
  }

  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'create',
    entityType: 'invoice', entityId: invoice.id, after: { numero: invoice.number },
  });
  return { invoice };
}

export async function cancelInvoice(user: SessionUser, id: string, reason: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
  });
  if (!invoice) return { error: 'Nota não encontrada.' };
  if (invoice.status === 'CANCELADA') return { error: 'Esta nota já está cancelada.' };
  if (!reason.trim()) return { error: 'Informe o motivo do cancelamento.' };

  await prisma.invoice.update({
    where: { id },
    data: { status: 'CANCELADA', cancelledAt: new Date(), cancellationReason: reason },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'cancel',
    entityType: 'invoice', entityId: id, after: { motivo: reason },
  });
  return { ok: true };
}

/** Parcelas que ainda podem ser vinculadas a uma nota. */
export async function listReceivablesToInvoice(user: SessionUser, clientId: string) {
  return prisma.receivable.findMany({
    where: {
      companyId: user.companyId, clientId, deletedAt: null,
      status: { in: ['PREVISTO', 'A_FATURAR', 'AGUARDANDO_AUTORIZACAO', 'A_VENCER', 'VENCIDO'] },
    },
    select: { id: true, code: true, description: true, dueDate: true, netValue: true },
    orderBy: { dueDate: 'asc' },
  });
}

// ---------- Contas a pagar ----------

export type PayableFilter = {
  search?: string;
  situacao?: 'ABERTO' | 'VENCIDO' | 'PAGO' | 'TODOS';
  page?: number;
};

export async function listPayables(user: SessionUser, filter: PayableFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = 30;
  const where: Prisma.PayableWhereInput = { companyId: user.companyId, deletedAt: null };

  if (filter.situacao === 'VENCIDO') {
    where.status = 'A_PAGAR';
    where.dueDate = { lt: hoje() };
  } else if (filter.situacao === 'PAGO') {
    where.status = 'PAGO';
  } else if (filter.situacao !== 'TODOS') {
    where.status = 'A_PAGAR';
  }
  if (filter.search) {
    where.OR = [
      { description: { contains: filter.search, mode: 'insensitive' } },
      { supplier: { contains: filter.search, mode: 'insensitive' } },
      { category: { contains: filter.search, mode: 'insensitive' } },
    ];
  }

  const [total, items, soma] = await prisma.$transaction([
    prisma.payable.count({ where }),
    prisma.payable.findMany({
      where,
      include: { project: { select: { id: true, code: true } } },
      orderBy: { dueDate: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.payable.aggregate({ where, _sum: { amount: true } }),
  ]);

  return {
    items, total, page, pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    somaValor: soma._sum.amount?.toString() ?? '0',
  };
}

export type PayableInput = {
  description: string;
  supplier?: string | null;
  category?: string | null;
  projectId?: string | null;
  dueDate: string;
  amount: string;
  notes?: string | null;
};

export async function createPayable(user: SessionUser, input: PayableInput) {
  const vencimento = parseDateInput(input.dueDate);
  if (!vencimento) return { error: 'Informe a data de vencimento.' };
  if (!(Number(input.amount) > 0)) return { error: 'O valor deve ser maior que zero.' };

  const payable = await prisma.payable.create({
    data: {
      companyId: user.companyId,
      description: input.description,
      supplier: input.supplier || null,
      category: input.category || null,
      projectId: input.projectId || null,
      dueDate: vencimento,
      amount: input.amount,
      notes: input.notes || null,
      createdById: user.id,
    },
  });

  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'create',
    entityType: 'payable', entityId: payable.id, after: { descricao: payable.description },
  });
  return { payable };
}

export async function payPayable(
  user: SessionUser, id: string, input: { paidAt: string; paidAmount: string },
) {
  const payable = await prisma.payable.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
  });
  if (!payable) return { error: 'Conta não encontrada.' };
  if (payable.status === 'PAGO') return { error: 'Esta conta já está paga.' };

  const data = parseDateInput(input.paidAt);
  if (!data) return { error: 'Informe a data do pagamento.' };
  if (!(Number(input.paidAmount) > 0)) return { error: 'O valor pago deve ser maior que zero.' };

  await prisma.payable.update({
    where: { id },
    data: { status: 'PAGO', paidAt: data, paidAmount: input.paidAmount, updatedById: user.id },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'payment',
    entityType: 'payable', entityId: id, after: { valor: input.paidAmount },
  });
  return { ok: true };
}

export async function setPayableStatus(user: SessionUser, id: string, status: PayableStatus) {
  const payable = await prisma.payable.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
  });
  if (!payable) return { error: 'Conta não encontrada.' };

  await prisma.payable.update({
    where: { id },
    data: {
      status,
      // desfazer o pagamento limpa a baixa
      paidAt: status === 'PAGO' ? payable.paidAt : null,
      paidAmount: status === 'PAGO' ? payable.paidAmount : null,
      updatedById: user.id,
    },
  });
  return { ok: true };
}

// ---------- Cobrança ----------

/**
 * Marca como vencidas as parcelas cujo prazo passou. Roda ao abrir o
 * financeiro, para a situação refletir a data de hoje sem depender de
 * agendador externo.
 */
export async function refreshOverdue(user: SessionUser): Promise<number> {
  const { count } = await prisma.receivable.updateMany({
    where: {
      companyId: user.companyId, deletedAt: null,
      dueDate: { lt: hoje() },
      status: { in: ['PREVISTO', 'A_FATURAR', 'NF_EMITIDA', 'ENVIADO_AO_CLIENTE', 'A_VENCER'] },
    },
    data: { status: 'VENCIDO' },
  });
  return count;
}

export type CollectionEventInput = {
  eventType: string;
  channel?: string | null;
  notes?: string | null;
};

/** Registra o contato de cobrança feito com o cliente. */
export async function addCollectionEvent(
  user: SessionUser, receivableId: string, input: CollectionEventInput,
) {
  const receivable = await prisma.receivable.findFirst({
    where: { id: receivableId, companyId: user.companyId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!receivable) return { error: 'Parcela não encontrada.' };

  const evento = await prisma.collectionEvent.create({
    data: {
      companyId: user.companyId,
      receivableId,
      eventType: input.eventType as never,
      channel: input.channel || null,
      notes: input.notes || null,
      createdById: user.id,
    },
  });

  // A partir do primeiro aviso de atraso a parcela entra em cobrança
  const emCobranca = ['PRIMEIRO_AVISO_ATRASO', 'SEGUNDO_AVISO_ATRASO', 'COBRANCA_FORMAL'];
  if (emCobranca.includes(input.eventType) && receivable.status === 'VENCIDO') {
    await prisma.receivable.update({
      where: { id: receivableId },
      data: { status: 'EM_COBRANCA' },
    });
  }
  if (input.eventType === 'ENCAMINHAMENTO_JURIDICO') {
    await prisma.receivable.update({
      where: { id: receivableId },
      data: { status: 'INADIMPLENTE' },
    });
  }

  return { evento };
}

/**
 * Envia o aviso de cobrança ao cliente e já registra o contato — sem depender
 * de alguém lembrar de anotar que cobrou.
 */
export async function sendCollectionEmail(
  user: SessionUser,
  receivableId: string,
  input: { para: string; assunto: string; mensagem: string; eventType: string },
): Promise<{ ok: true } | { error: string }> {
  const receivable = await prisma.receivable.findFirst({
    where: { id: receivableId, companyId: user.companyId, deletedAt: null },
    include: { client: { select: { legalName: true, tradeName: true } } },
  });
  if (!receivable) return { error: 'Parcela não encontrada.' };

  const envio = await enviarEmail({
    para: input.para,
    // Comprovante e dúvidas voltam para quem cobrou
    responderPara: user.email,
    assunto: input.assunto,
    texto: input.mensagem,
    html: layoutEmail(
      'Cobrança em aberto',
      `<p>${input.mensagem.replace(/\n/g, '<br>')}</p>`,
      'Se o pagamento já foi feito, desconsidere e nos envie o comprovante.',
    ),
  });
  if ('error' in envio) return { error: envio.error };

  await addCollectionEvent(user, receivableId, {
    eventType: input.eventType,
    channel: 'E-mail',
    notes: `Enviado para ${input.para}`,
  });

  return { ok: true };
}

export async function listCollectionEvents(user: SessionUser, receivableId: string) {
  return prisma.collectionEvent.findMany({
    where: { companyId: user.companyId, receivableId },
    orderBy: { eventDate: 'desc' },
  });
}

/**
 * Parcelas que pedem ação de cobrança hoje, agrupadas pelo tempo de atraso —
 * a régua que orienta quem cobrar primeiro.
 */
export async function getCollectionQueue(user: SessionUser) {
  const inicioDia = hoje();
  const vencidas = await prisma.receivable.findMany({
    where: {
      companyId: user.companyId, deletedAt: null,
      dueDate: { lt: inicioDia },
      status: { in: ['VENCIDO', 'EM_COBRANCA', 'INADIMPLENTE', 'PARCIALMENTE_RECEBIDO'] },
    },
    include: {
      client: { select: { id: true, legalName: true, tradeName: true, email: true, phone: true } },
      receipts: { where: { reversedAt: null }, select: { amount: true } },
      collectionEvents: { orderBy: { eventDate: 'desc' }, take: 1 },
    },
    orderBy: { dueDate: 'asc' },
  });

  return vencidas.map((r) => {
    const recebido = r.receipts.reduce((acc, x) => acc + Number(x.amount), 0);
    const diasAtraso = Math.floor((inicioDia.getTime() - r.dueDate.getTime()) / 86_400_000);
    return {
      ...r,
      saldo: (Number(r.netValue) - recebido).toFixed(2),
      diasAtraso,
      // sugestão de próximo passo conforme o tempo de atraso
      sugestao:
        diasAtraso <= 7 ? 'PRIMEIRO_AVISO_ATRASO'
        : diasAtraso <= 20 ? 'SEGUNDO_AVISO_ATRASO'
        : diasAtraso <= 45 ? 'COBRANCA_FORMAL'
        : 'ENCAMINHAMENTO_JURIDICO',
      ultimoContato: r.collectionEvents[0] ?? null,
    };
  });
}

export async function deletePayable(user: SessionUser, id: string) {
  const payable = await prisma.payable.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
  });
  if (!payable) return { error: 'Conta não encontrada.' };
  await prisma.payable.update({ where: { id }, data: { deletedAt: new Date() } });
  return { ok: true };
}
