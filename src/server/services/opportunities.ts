import 'server-only';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { nextCode } from '@/server/services/sequence';
import type { ActivityStatus, ActivityType, Prisma, PriorityLevel } from '@/generated/prisma/client';
import type { SessionUser } from '@/server/auth/session';

// ---------- Board (Kanban) ----------

export type BoardFilters = {
  commercialOwnerId?: string;
  serviceCatalogId?: string;
  leadSourceId?: string;
  search?: string;
  includeClosed?: boolean;
};

export async function getBoard(user: SessionUser, filters: BoardFilters) {
  const where: Prisma.OpportunityWhereInput = {
    companyId: user.companyId,
    deletedAt: null,
  };
  if (filters.commercialOwnerId) where.commercialOwnerId = filters.commercialOwnerId;
  if (filters.serviceCatalogId) where.serviceCatalogId = filters.serviceCatalogId;
  if (filters.leadSourceId) where.leadSourceId = filters.leadSourceId;
  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { code: { contains: filters.search, mode: 'insensitive' } },
      { client: { legalName: { contains: filters.search, mode: 'insensitive' } } },
    ];
  }

  const [stages, opportunities] = await Promise.all([
    prisma.opportunityStage.findMany({
      where: {
        companyId: user.companyId,
        active: true,
        ...(filters.includeClosed ? {} : { kind: 'ABERTA' }),
      },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.opportunity.findMany({
      where,
      include: {
        client: { select: { id: true, legalName: true, tradeName: true } },
        commercialOwner: { select: { id: true, name: true } },
        serviceCatalog: { select: { id: true, name: true } },
        activities: {
          where: { status: 'PENDENTE' },
          orderBy: { dueAt: 'asc' },
          take: 1,
        },
      },
      orderBy: [{ boardPosition: 'asc' }, { createdAt: 'desc' }],
    }),
  ]);

  return { stages, opportunities };
}

// ---------- CRUD ----------

export type OpportunityInput = {
  title: string;
  clientId: string;
  clientUnitId?: string | null;
  primaryContactId?: string | null;
  description?: string | null;
  serviceCatalogId?: string | null;
  discipline?: string | null;
  commercialOwnerId?: string | null;
  technicalOwnerId?: string | null;
  leadSourceId?: string | null;
  estimatedValue?: string | null; // Decimal como string
  probability?: string | null;
  expectedCloseDate?: Date | null;
  estimatedDuration?: string | null;
  priority?: PriorityLevel;
  competitors?: string | null;
  hiringReason?: string | null;
  clientNeed?: string | null;
  nextAction?: string | null;
  nextActionDate?: Date | null;
  notes?: string | null;
  stageId?: string;
};

export async function getOpportunity(user: SessionUser, id: string) {
  return prisma.opportunity.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
    include: {
      client: { include: { contacts: { where: { deletedAt: null } }, units: { where: { deletedAt: null } } } },
      clientUnit: true,
      primaryContact: true,
      serviceCatalog: true,
      commercialOwner: { select: { id: true, name: true } },
      technicalOwner: { select: { id: true, name: true } },
      leadSource: true,
      stage: true,
      lossReason: true,
      activities: {
        where: { deletedAt: null },
        include: { responsible: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
      budgets: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
    },
  });
}

export async function createOpportunity(user: SessionUser, input: OpportunityInput) {
  const client = await prisma.client.findFirst({
    where: { id: input.clientId, companyId: user.companyId, deletedAt: null },
  });
  if (!client) return { error: 'Cliente não encontrado.' };

  let stageId = input.stageId;
  if (!stageId) {
    const firstStage = await prisma.opportunityStage.findFirst({
      where: { companyId: user.companyId, active: true, kind: 'ABERTA' },
      orderBy: { sortOrder: 'asc' },
    });
    if (!firstStage) return { error: 'Nenhuma etapa de pipeline configurada.' };
    stageId = firstStage.id;
  }

  const opportunity = await prisma.$transaction(async (tx) => {
    const code = await nextCode(user.companyId, 'OPP', tx);
    return tx.opportunity.create({
      data: {
        ...toOpportunityData(input),
        companyId: user.companyId,
        code,
        stageId: stageId!,
        commercialOwnerId: input.commercialOwnerId ?? user.id,
        createdById: user.id,
      },
    });
  });

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'create', entityType: 'opportunity', entityId: opportunity.id, after: opportunity,
  });
  return { opportunity };
}

export async function updateOpportunity(user: SessionUser, id: string, input: OpportunityInput) {
  const before = await prisma.opportunity.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
  if (!before) return { error: 'Oportunidade não encontrada.' };

  const opportunity = await prisma.opportunity.update({
    where: { id },
    data: { ...toOpportunityData(input), updatedById: user.id },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'update', entityType: 'opportunity', entityId: id, before, after: opportunity,
  });
  return { opportunity };
}

function toOpportunityData(input: OpportunityInput) {
  return {
    title: input.title,
    clientId: input.clientId,
    clientUnitId: input.clientUnitId || null,
    primaryContactId: input.primaryContactId || null,
    description: input.description || null,
    serviceCatalogId: input.serviceCatalogId || null,
    discipline: input.discipline || null,
    technicalOwnerId: input.technicalOwnerId || null,
    leadSourceId: input.leadSourceId || null,
    estimatedValue: input.estimatedValue ? input.estimatedValue : null,
    probability: input.probability ? input.probability : null,
    expectedCloseDate: input.expectedCloseDate ?? null,
    estimatedDuration: input.estimatedDuration || null,
    priority: input.priority ?? 'MEDIA',
    competitors: input.competitors || null,
    hiringReason: input.hiringReason || null,
    clientNeed: input.clientNeed || null,
    nextAction: input.nextAction || null,
    nextActionDate: input.nextActionDate ?? null,
    notes: input.notes || null,
    ...(input.commercialOwnerId !== undefined ? { commercialOwnerId: input.commercialOwnerId || null } : {}),
  };
}

// ---------- Movimentação de etapa (Kanban) ----------

export async function moveOpportunityStage(
  user: SessionUser,
  opportunityId: string,
  targetStageId: string,
  options?: { lossReasonId?: string; lossNotes?: string; boardPosition?: number },
) {
  const [opportunity, targetStage] = await Promise.all([
    prisma.opportunity.findFirst({
      where: { id: opportunityId, companyId: user.companyId, deletedAt: null },
      include: { stage: true },
    }),
    prisma.opportunityStage.findFirst({
      where: { id: targetStageId, companyId: user.companyId },
    }),
  ]);
  if (!opportunity) return { error: 'Oportunidade não encontrada.' };
  if (!targetStage) return { error: 'Etapa não encontrada.' };

  // Regra §4.5: perda exige motivo
  if (targetStage.kind === 'PERDIDA' && !options?.lossReasonId) {
    return { error: 'MOTIVO_PERDA_OBRIGATORIO' };
  }

  const isClosing = targetStage.kind === 'GANHA' || targetStage.kind === 'PERDIDA';
  const updated = await prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      stageId: targetStageId,
      boardPosition: options?.boardPosition ?? 0,
      updatedById: user.id,
      ...(targetStage.kind === 'PERDIDA'
        ? { lossReasonId: options?.lossReasonId, lossNotes: options?.lossNotes ?? null }
        : {}),
      ...(isClosing ? { closedAt: new Date() } : { closedAt: null, ...(targetStage.kind === 'ABERTA' ? { lossReasonId: null, lossNotes: null } : {}) }),
    },
  });

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'stage_change', entityType: 'opportunity', entityId: opportunityId,
    before: { stage: opportunity.stage.name },
    after: { stage: targetStage.name, lossReasonId: options?.lossReasonId },
  });
  return { opportunity: updated };
}

// ---------- Atividades ----------

export type ActivityInput = {
  activityType: ActivityType;
  title: string;
  notes?: string | null;
  responsibleId?: string | null;
  dueAt?: Date | null;
  opportunityId?: string | null;
  clientId?: string | null;
};

export async function createActivity(user: SessionUser, input: ActivityInput) {
  if (!input.opportunityId && !input.clientId) {
    return { error: 'Atividade precisa estar vinculada a uma oportunidade ou cliente.' };
  }
  const activity = await prisma.opportunityActivity.create({
    data: {
      companyId: user.companyId,
      opportunityId: input.opportunityId || null,
      clientId: input.clientId || null,
      activityType: input.activityType,
      title: input.title,
      notes: input.notes || null,
      responsibleId: input.responsibleId || user.id,
      dueAt: input.dueAt ?? null,
      createdById: user.id,
    },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'create', entityType: 'activity', entityId: activity.id, after: activity,
  });
  return { activity };
}

export async function setActivityStatus(user: SessionUser, activityId: string, status: ActivityStatus) {
  const activity = await prisma.opportunityActivity.findFirst({
    where: { id: activityId, companyId: user.companyId, deletedAt: null },
  });
  if (!activity) return { error: 'Atividade não encontrada.' };
  const updated = await prisma.opportunityActivity.update({
    where: { id: activityId },
    data: { status, completedAt: status === 'CONCLUIDA' ? new Date() : null },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'update', entityType: 'activity', entityId: activityId,
    before: { status: activity.status }, after: { status },
  });
  return { activity: updated };
}

// ---------- Timeline (atividades + mudanças de etapa da auditoria) ----------

export async function getOpportunityTimeline(user: SessionUser, opportunityId: string) {
  const events = await prisma.auditLog.findMany({
    where: {
      companyId: user.companyId,
      entityType: 'opportunity',
      entityId: opportunityId,
      action: { in: ['create', 'stage_change'] },
    },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return events;
}
