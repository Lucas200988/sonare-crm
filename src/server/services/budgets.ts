import 'server-only';
import { isEmptyRich } from '@/lib/html-text';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { nextCode } from '@/server/services/sequence';
import { computeBudgetTotals, approvalTriggers, type ApprovalRules } from '@/lib/budget-calc';
import type { Prisma, BudgetStatus } from '@/generated/prisma/client';
import type { SessionUser } from '@/server/auth/session';

export const TRIGGER_LABELS: Record<string, string> = {
  desconto_acima_maximo: 'Desconto acima do máximo permitido',
  margem_abaixo_minima: 'Margem abaixo da mínima',
  valor_acima_limite: 'Valor acima do limite sem aprovação',
};

async function getApprovalRules(companyId: string): Promise<ApprovalRules> {
  const settings = await prisma.systemSetting.findMany({
    where: {
      companyId,
      key: { in: ['approval.maxDiscountPercent', 'approval.minMarginPercent', 'approval.maxValueWithoutApproval'] },
    },
  });
  const get = (key: string, fallback: number) => {
    const s = settings.find((x) => x.key === key);
    return s ? Number(s.value) : fallback;
  };
  return {
    maxDiscountPercent: get('approval.maxDiscountPercent', 10),
    minMarginPercent: get('approval.minMarginPercent', 20),
    maxValueWithoutApproval: get('approval.maxValueWithoutApproval', 100000),
  };
}

// ---------- Listagem ----------

export type BudgetListFilter = {
  search?: string;
  status?: BudgetStatus | 'A_FAZER' | 'AGUARDANDO_RETORNO' | 'TODOS';
  clientId?: string;
  page?: number;
};

export async function listBudgets(user: SessionUser, filter: BudgetListFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = 20;

  const where: Prisma.BudgetWhereInput = { companyId: user.companyId, deletedAt: null };
  if (filter.clientId) where.clientId = filter.clientId;
  if (filter.status && filter.status !== 'TODOS') {
    if (filter.status === 'A_FAZER') {
      where.status = { in: ['RASCUNHO', 'EM_REVISAO', 'APROVACAO_INTERNA'] };
    } else if (filter.status === 'AGUARDANDO_RETORNO') {
      where.currentVersion = { proposals: { some: { status: { in: ['ENVIADA', 'VISUALIZADA'] } } } };
    } else {
      where.status = filter.status;
    }
  }
  if (filter.search) {
    where.OR = [
      { code: { contains: filter.search, mode: 'insensitive' } },
      { client: { legalName: { contains: filter.search, mode: 'insensitive' } } },
      { opportunity: { title: { contains: filter.search, mode: 'insensitive' } } },
    ];
  }

  const [total, items] = await prisma.$transaction([
    prisma.budget.count({ where }),
    prisma.budget.findMany({
      where,
      include: {
        client: { select: { id: true, legalName: true, tradeName: true } },
        opportunity: { select: { id: true, code: true, title: true } },
        currentVersion: { select: { id: true, versionNumber: true, total: true, validUntil: true } },
        commercialOwner: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getBudget(user: SessionUser, id: string) {
  return prisma.budget.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
    include: {
      client: { select: { id: true, legalName: true, tradeName: true, email: true } },
      clientUnit: true,
      opportunity: { select: { id: true, code: true, title: true, stageId: true } },
      commercialOwner: { select: { id: true, name: true } },
      technicalOwner: { select: { id: true, name: true } },
      currentVersion: {
        include: {
          items: { orderBy: { sortOrder: 'asc' } },
          proposals: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
        },
      },
      versions: { orderBy: { versionNumber: 'desc' }, select: { id: true, versionNumber: true, total: true, immutable: true, createdAt: true, changeReason: true } },
      approvals: {
        include: {
          requestedBy: { select: { name: true } },
          decidedBy: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

// ---------- Criação ----------

export async function createBudget(user: SessionUser, input: {
  clientId: string;
  opportunityId?: string | null;
  clientUnitId?: string | null;
  technicalOwnerId?: string | null;
}) {
  const client = await prisma.client.findFirst({
    where: { id: input.clientId, companyId: user.companyId, deletedAt: null },
  });
  if (!client) return { error: 'Cliente não encontrado.' };

  let serviceType: string | null = null;
  if (input.opportunityId) {
    const opp = await prisma.opportunity.findFirst({
      where: { id: input.opportunityId, companyId: user.companyId, deletedAt: null },
      include: { serviceCatalog: true },
    });
    if (!opp) return { error: 'Oportunidade não encontrada.' };
    serviceType = opp.serviceCatalog?.name ?? null;
  }

  const validityDaysSetting = await prisma.systemSetting.findUnique({
    where: { companyId_key: { companyId: user.companyId, key: 'proposal.defaultValidityDays' } },
  });
  const validityDays = validityDaysSetting ? Number(validityDaysSetting.value) : 60;

  const budget = await prisma.$transaction(async (tx) => {
    const code = await nextCode(user.companyId, 'ORC', tx);
    const created = await tx.budget.create({
      data: {
        companyId: user.companyId,
        code,
        clientId: input.clientId,
        opportunityId: input.opportunityId || null,
        clientUnitId: input.clientUnitId || null,
        commercialOwnerId: user.id,
        technicalOwnerId: input.technicalOwnerId || null,
        createdById: user.id,
      },
    });
    const version = await tx.budgetVersion.create({
      data: {
        budgetId: created.id,
        versionNumber: 1,
        serviceType,
        validUntil: new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000),
        createdById: user.id,
      },
    });
    return tx.budget.update({
      where: { id: created.id },
      data: { currentVersionId: version.id },
    });
  });

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'create', entityType: 'budget', entityId: budget.id, after: budget,
  });
  return { budget };
}

// ---------- Edição da versão corrente ----------

export type VersionPayload = {
  validUntil?: Date | null;
  serviceType?: string | null;
  scope?: string | null;
  premises?: string | null;
  exclusions?: string | null;
  executionDeadline?: string | null;
  deliveryMethod?: string | null;
  paymentTerms?: string | null;
  discount?: string;
  surcharge?: string;
  taxes?: string;
  estimatedRetentions?: string;
  internalNotes?: string | null;
  clientNotes?: string | null;
  items: Array<{
    serviceCatalogId?: string | null;
    description: string;
    discipline?: string | null;
    stage?: string | null;
    itemType?: string | null;
    unit?: string | null;
    quantity: string;
    unitPrice: string;
    unitCost?: string;
    discount?: string;
  }>;
};

const EDITABLE_STATUSES: BudgetStatus[] = ['RASCUNHO', 'EM_REVISAO'];

export async function saveCurrentVersion(user: SessionUser, budgetId: string, payload: VersionPayload) {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, companyId: user.companyId, deletedAt: null },
    include: { currentVersion: true },
  });
  if (!budget || !budget.currentVersion) return { error: 'Orçamento não encontrado.' };
  if (budget.currentVersion.immutable) {
    return { error: 'Esta versão foi enviada e é imutável. Crie uma nova versão para alterar.' };
  }
  if (!EDITABLE_STATUSES.includes(budget.status)) {
    return { error: `Orçamento em status ${budget.status} não pode ser editado.` };
  }

  const totals = computeBudgetTotals({
    items: payload.items.map((i) => ({
      quantity: i.quantity, unitPrice: i.unitPrice, unitCost: i.unitCost, discount: i.discount,
    })),
    discount: payload.discount,
    surcharge: payload.surcharge,
    taxes: payload.taxes,
    estimatedRetentions: payload.estimatedRetentions,
  });

  const versionId = budget.currentVersion.id;
  await prisma.$transaction([
    prisma.budgetItem.deleteMany({ where: { budgetVersionId: versionId } }),
    prisma.budgetItem.createMany({
      data: payload.items.map((i, idx) => ({
        budgetVersionId: versionId,
        serviceCatalogId: i.serviceCatalogId || null,
        description: i.description,
        discipline: i.discipline || null,
        stage: i.stage || null,
        itemType: i.itemType || null,
        unit: i.unit || null,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        unitCost: i.unitCost || '0',
        discount: i.discount || '0',
        total: totals.itemTotals[idx].toString(),
        sortOrder: idx,
      })),
    }),
    prisma.budgetVersion.update({
      where: { id: versionId },
      data: {
        validUntil: payload.validUntil,
        serviceType: payload.serviceType,
        scope: payload.scope,
        premises: payload.premises,
        exclusions: payload.exclusions,
        executionDeadline: payload.executionDeadline,
        deliveryMethod: payload.deliveryMethod,
        paymentTerms: payload.paymentTerms,
        internalNotes: payload.internalNotes,
        clientNotes: payload.clientNotes,
        subtotal: totals.subtotal.toString(),
        discount: totals.discount.toString(),
        surcharge: totals.surcharge.toString(),
        taxes: totals.taxes.toString(),
        estimatedRetentions: totals.estimatedRetentions.toString(),
        totalCost: totals.totalCost.toString(),
        grossMargin: totals.grossMargin.toString(),
        marginPercent: totals.marginPercent.toString(),
        total: totals.total.toString(),
      },
    }),
    prisma.budget.update({ where: { id: budgetId }, data: { updatedById: user.id } }),
  ]);

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'update', entityType: 'budget', entityId: budgetId,
    after: { versionNumber: budget.currentVersion.versionNumber, total: totals.total.toString() },
  });
  return { ok: true as const, totals };
}

// ---------- Nova versão ----------

export async function createNewVersion(user: SessionUser, budgetId: string, reason: string) {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, companyId: user.companyId, deletedAt: null },
    include: { currentVersion: { include: { items: { orderBy: { sortOrder: 'asc' } } } } },
  });
  if (!budget || !budget.currentVersion) return { error: 'Orçamento não encontrado.' };

  const cv = budget.currentVersion;
  const nextNumber = (await prisma.budgetVersion.aggregate({
    where: { budgetId },
    _max: { versionNumber: true },
  }))._max.versionNumber! + 1;

  const newVersion = await prisma.$transaction(async (tx) => {
    const created = await tx.budgetVersion.create({
      data: {
        budgetId,
        versionNumber: nextNumber,
        validUntil: cv.validUntil,
        serviceType: cv.serviceType,
        scope: cv.scope,
        premises: cv.premises,
        exclusions: cv.exclusions,
        referenceDocuments: cv.referenceDocuments,
        executionDeadline: cv.executionDeadline,
        deliveryMethod: cv.deliveryMethod,
        paymentTerms: cv.paymentTerms,
        paymentSchedule: cv.paymentSchedule ?? undefined,
        subtotal: cv.subtotal, discount: cv.discount, surcharge: cv.surcharge,
        taxes: cv.taxes, estimatedRetentions: cv.estimatedRetentions,
        totalCost: cv.totalCost, grossMargin: cv.grossMargin,
        marginPercent: cv.marginPercent, total: cv.total,
        internalNotes: cv.internalNotes, clientNotes: cv.clientNotes,
        changeReason: reason,
        createdById: user.id,
      },
    });
    if (cv.items.length > 0) {
      await tx.budgetItem.createMany({
        data: cv.items.map((i) => ({
          budgetVersionId: created.id,
          serviceCatalogId: i.serviceCatalogId,
          description: i.description,
          discipline: i.discipline,
          stage: i.stage,
          itemType: i.itemType,
          unit: i.unit,
          quantity: i.quantity.toString(),
          unitPrice: i.unitPrice.toString(),
          unitCost: i.unitCost.toString(),
          discount: i.discount.toString(),
          total: i.total.toString(),
          sortOrder: i.sortOrder,
        })),
      });
    }
    await tx.budget.update({
      where: { id: budgetId },
      data: { currentVersionId: created.id, status: 'RASCUNHO', updatedById: user.id },
    });
    return created;
  });

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'new_version', entityType: 'budget', entityId: budgetId,
    after: { versionNumber: nextNumber, reason },
  });
  return { version: newVersion };
}

// ---------- Envio para aprovação interna ----------

export async function submitBudget(user: SessionUser, budgetId: string) {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, companyId: user.companyId, deletedAt: null },
    include: { currentVersion: { include: { items: true } } },
  });
  if (!budget || !budget.currentVersion) return { error: 'Orçamento não encontrado.' };
  if (!EDITABLE_STATUSES.includes(budget.status)) {
    return { error: `Orçamento em status ${budget.status} não pode ser submetido.` };
  }
  if (budget.currentVersion.items.length === 0) {
    return { error: 'Adicione ao menos um item antes de submeter o orçamento.' };
  }
  // O escopo é a parte principal da proposta — sem ele o cliente recebe
  // um documento só com preços.
  if (isEmptyRich(budget.currentVersion.scope)) {
    return {
      error: 'Preencha o escopo dos serviços antes de submeter — é a descrição que vai para a proposta.',
    };
  }

  const totals = computeBudgetTotals({
    items: budget.currentVersion.items.map((i) => ({
      quantity: i.quantity.toString(), unitPrice: i.unitPrice.toString(),
      unitCost: i.unitCost.toString(), discount: i.discount.toString(),
    })),
    discount: budget.currentVersion.discount.toString(),
    surcharge: budget.currentVersion.surcharge.toString(),
    taxes: budget.currentVersion.taxes.toString(),
    estimatedRetentions: budget.currentVersion.estimatedRetentions.toString(),
  });
  // Orçamento sem valor não pode ser aprovado nem virar proposta (§22.3)
  if (totals.total.lessThanOrEqualTo(0)) {
    return {
      error: 'O valor total do orçamento está zerado. Informe os preços dos itens antes de submeter.',
    };
  }
  const zeroPriced = budget.currentVersion.items.filter((i) => Number(i.unitPrice) <= 0);
  if (zeroPriced.length > 0) {
    const nomes = zeroPriced.slice(0, 3).map((i) => `“${i.description}”`).join(', ');
    const resto = zeroPriced.length > 3 ? ` e mais ${zeroPriced.length - 3}` : '';
    return { error: `Há item(ns) sem preço unitário: ${nomes}${resto}.` };
  }

  const rules = await getApprovalRules(user.companyId);
  const triggers = approvalTriggers(totals, rules);

  if (triggers.length === 0) {
    await prisma.budget.update({
      where: { id: budgetId },
      data: { status: 'APROVADO', updatedById: user.id },
    });
    await auditLog({
      companyId: user.companyId, userId: user.id,
      action: 'approve_auto', entityType: 'budget', entityId: budgetId,
    });
    return { ok: true as const, status: 'APROVADO' as const, triggers: [] };
  }

  await prisma.$transaction([
    prisma.budget.update({
      where: { id: budgetId },
      data: { status: 'APROVACAO_INTERNA', updatedById: user.id },
    }),
    ...triggers.map((t) =>
      prisma.budgetApproval.create({
        data: { budgetId, ruleTriggered: t, requestedById: user.id },
      }),
    ),
  ]);
  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'submit_approval', entityType: 'budget', entityId: budgetId, after: { triggers },
  });
  return { ok: true as const, status: 'APROVACAO_INTERNA' as const, triggers };
}

// ---------- Exclusão ----------

/**
 * Exclusão lógica do orçamento. Bloqueada quando já existe proposta emitida
 * ou contrato vinculado — nesses casos o histórico precisa ser preservado.
 */
export async function softDeleteBudget(user: SessionUser, budgetId: string) {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, companyId: user.companyId, deletedAt: null },
    include: {
      versions: { include: { proposals: { where: { deletedAt: null } } } },
      contracts: { where: { deletedAt: null } },
      projects: { where: { deletedAt: null } },
    },
  });
  if (!budget) return { error: 'Orçamento não encontrado.' };

  const proposals = budget.versions.flatMap((v) => v.proposals);
  const sent = proposals.filter((p) => p.status !== 'RASCUNHO');
  if (sent.length > 0) {
    return {
      error: `Este orçamento já gerou proposta enviada ao cliente (${sent.map((p) => p.code).join(', ')}). Cancele o orçamento em vez de excluí-lo.`,
    };
  }
  if (budget.contracts.length > 0) {
    return { error: 'Há contrato vinculado a este orçamento. A exclusão não é permitida.' };
  }
  if (budget.projects.length > 0) {
    return { error: 'Há projeto vinculado a este orçamento. A exclusão não é permitida.' };
  }

  await prisma.$transaction([
    // propostas em rascunho (PDF gerado mas nunca enviado) acompanham o orçamento
    ...(proposals.length > 0
      ? [prisma.proposal.updateMany({
          where: { id: { in: proposals.map((p) => p.id) } },
          data: { deletedAt: new Date() },
        })]
      : []),
    prisma.budget.update({
      where: { id: budgetId },
      data: { deletedAt: new Date(), updatedById: user.id },
    }),
  ]);

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'delete', entityType: 'budget', entityId: budgetId,
    before: { code: budget.code, status: budget.status },
  });
  return { ok: true as const, code: budget.code };
}

/** Cancelamento: mantém o registro no histórico, encerra o orçamento. */
export async function cancelBudget(user: SessionUser, budgetId: string, reason: string) {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, companyId: user.companyId, deletedAt: null },
  });
  if (!budget) return { error: 'Orçamento não encontrado.' };
  if (budget.status === 'CANCELADO') return { error: 'Este orçamento já está cancelado.' };

  await prisma.budget.update({
    where: { id: budgetId },
    data: { status: 'CANCELADO', updatedById: user.id },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'cancel', entityType: 'budget', entityId: budgetId,
    before: { status: budget.status }, after: { status: 'CANCELADO', reason },
  });
  return { ok: true as const };
}

// ---------- Decisão de aprovação ----------

export async function decideApproval(user: SessionUser, budgetId: string, approve: boolean, comment?: string) {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, companyId: user.companyId, deletedAt: null, status: 'APROVACAO_INTERNA' },
  });
  if (!budget) return { error: 'Orçamento não está aguardando aprovação.' };

  await prisma.$transaction([
    prisma.budgetApproval.updateMany({
      where: { budgetId, status: 'PENDENTE' },
      data: {
        status: approve ? 'APROVADA' : 'RECUSADA',
        decidedById: user.id,
        comment,
        decidedAt: new Date(),
      },
    }),
    prisma.budget.update({
      where: { id: budgetId },
      data: { status: approve ? 'APROVADO' : 'EM_REVISAO', updatedById: user.id },
    }),
  ]);
  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: approve ? 'approve' : 'reject', entityType: 'budget', entityId: budgetId,
    after: { comment },
  });
  return { ok: true as const };
}
