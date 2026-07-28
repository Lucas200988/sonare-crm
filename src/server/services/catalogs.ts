import 'server-only';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import type { StageKind } from '@/generated/prisma/client';
import type { SessionUser } from '@/server/auth/session';

// Cadastros configuráveis (§16): origens, motivos de perda, etapas, serviços, formas de pagamento.

export async function listCatalogs(user: SessionUser) {
  const companyId = user.companyId;
  const [leadSources, lossReasons, stages, services, paymentMethods, retentions] = await Promise.all([
    prisma.leadSource.findMany({ where: { companyId }, orderBy: { sortOrder: 'asc' } }),
    prisma.lossReason.findMany({ where: { companyId }, orderBy: { sortOrder: 'asc' } }),
    prisma.opportunityStage.findMany({ where: { companyId }, orderBy: { sortOrder: 'asc' } }),
    prisma.serviceCatalog.findMany({ where: { companyId, deletedAt: null }, orderBy: { code: 'asc' } }),
    prisma.paymentMethod.findMany({ where: { companyId }, orderBy: { sortOrder: 'asc' } }),
    prisma.financialRetention.findMany({ where: { companyId }, orderBy: { code: 'asc' } }),
  ]);
  return { leadSources, lossReasons, stages, services, paymentMethods, retentions };
}

type SimpleCatalog = 'leadSource' | 'lossReason' | 'paymentMethod';

const SIMPLE_MODELS = {
  leadSource: () => prisma.leadSource,
  lossReason: () => prisma.lossReason,
  paymentMethod: () => prisma.paymentMethod,
} as const;

export async function addSimpleCatalogItem(user: SessionUser, catalog: SimpleCatalog, name: string) {
  const model = SIMPLE_MODELS[catalog]() as never as {
    findFirst: (args: unknown) => Promise<unknown>;
    create: (args: { data: { companyId: string; name: string; sortOrder: number } }) => Promise<{ id: string }>;
    count: (args: unknown) => Promise<number>;
  };
  const exists = await model.findFirst({ where: { companyId: user.companyId, name } });
  if (exists) return { error: 'Já existe um item com este nome.' };
  const sortOrder = await model.count({ where: { companyId: user.companyId } });
  const item = await model.create({ data: { companyId: user.companyId, name, sortOrder } });
  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'create', entityType: catalog, entityId: item.id, after: { name },
  });
  return { ok: true };
}

export async function toggleSimpleCatalogItem(user: SessionUser, catalog: SimpleCatalog, id: string, active: boolean) {
  const model = SIMPLE_MODELS[catalog]() as never as {
    findFirst: (args: unknown) => Promise<{ id: string } | null>;
    update: (args: unknown) => Promise<unknown>;
  };
  const item = await model.findFirst({ where: { id, companyId: user.companyId } });
  if (!item) return { error: 'Item não encontrado.' };
  await model.update({ where: { id }, data: { active } });
  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'update', entityType: catalog, entityId: id, after: { active },
  });
  return { ok: true };
}

// ---------- Etapas do pipeline ----------

export type StageInput = { name: string; kind: StageKind; color?: string | null };

export async function addStage(user: SessionUser, input: StageInput) {
  const exists = await prisma.opportunityStage.findFirst({
    where: { companyId: user.companyId, name: input.name },
  });
  if (exists) return { error: 'Já existe uma etapa com este nome.' };
  const sortOrder = await prisma.opportunityStage.count({ where: { companyId: user.companyId } });
  const stage = await prisma.opportunityStage.create({
    data: { companyId: user.companyId, name: input.name, kind: input.kind, color: input.color, sortOrder },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'create', entityType: 'stage', entityId: stage.id, after: stage,
  });
  return { ok: true };
}

export async function updateStage(
  user: SessionUser, id: string,
  data: Partial<StageInput> & { active?: boolean; sortOrder?: number },
) {
  const stage = await prisma.opportunityStage.findFirst({ where: { id, companyId: user.companyId } });
  if (!stage) return { error: 'Etapa não encontrada.' };
  if (data.active === false) {
    const inUse = await prisma.opportunity.count({ where: { stageId: id, deletedAt: null, closedAt: null } });
    if (inUse > 0) return { error: `Há ${inUse} oportunidade(s) aberta(s) nesta etapa. Mova-as antes de desativar.` };
  }
  await prisma.opportunityStage.update({ where: { id }, data });
  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'update', entityType: 'stage', entityId: id, before: stage, after: data,
  });
  return { ok: true };
}

// ---------- Catálogo de serviços ----------

export type ServiceInput = {
  code: string;
  name: string;
  category?: string | null;
  discipline?: string | null;
  unit?: string | null;
  defaultPrice?: string | null;
  estimatedCost?: string | null;
  estimatedHours?: string | null;
  description?: string | null;
  scopeTemplate?: string | null;
  premisesTemplate?: string | null;
  exclusionsTemplate?: string | null;
};

export async function upsertService(user: SessionUser, input: ServiceInput, serviceId?: string) {
  const dup = await prisma.serviceCatalog.findFirst({
    where: {
      companyId: user.companyId, code: input.code, deletedAt: null,
      NOT: serviceId ? { id: serviceId } : undefined,
    },
  });
  if (dup) return { error: 'Já existe um serviço com este código.' };

  const data = {
    ...input,
    defaultPrice: input.defaultPrice || null,
    estimatedCost: input.estimatedCost || null,
    estimatedHours: input.estimatedHours || null,
  };
  const service = serviceId
    ? await prisma.serviceCatalog.update({ where: { id: serviceId }, data })
    : await prisma.serviceCatalog.create({ data: { ...data, companyId: user.companyId } });

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: serviceId ? 'update' : 'create', entityType: 'service', entityId: service.id, after: service,
  });
  return { service };
}

export async function toggleService(user: SessionUser, id: string, active: boolean) {
  const service = await prisma.serviceCatalog.findFirst({ where: { id, companyId: user.companyId } });
  if (!service) return { error: 'Serviço não encontrado.' };
  await prisma.serviceCatalog.update({ where: { id }, data: { active } });
  return { ok: true };
}

// ---------- Retenções ----------

export async function updateRetention(user: SessionUser, id: string, percent: string, active: boolean) {
  const retention = await prisma.financialRetention.findFirst({ where: { id, companyId: user.companyId } });
  if (!retention) return { error: 'Retenção não encontrada.' };
  await prisma.financialRetention.update({ where: { id }, data: { percent, active } });
  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'update', entityType: 'retention', entityId: id,
    before: { percent: retention.percent, active: retention.active }, after: { percent, active },
  });
  return { ok: true };
}
