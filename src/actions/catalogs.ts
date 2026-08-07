'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/server/auth/guards';
import * as catalogs from '@/server/services/catalogs';

export type ActionState = { error?: string };

const nameSchema = z.string().trim().min(2, 'Informe um nome válido.');

type SimpleCatalog = 'leadSource' | 'lossReason' | 'paymentMethod';

export async function addCatalogItemAction(
  catalog: SimpleCatalog, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('settings:manage');
  const parsed = nameSchema.safeParse(formData.get('name'));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Nome inválido.' };

  const result = await catalogs.addSimpleCatalogItem(user, catalog, parsed.data);
  if (result.error) return { error: result.error };
  revalidatePath('/configuracoes');
  return {};
}

export async function toggleCatalogItemAction(
  catalog: SimpleCatalog, id: string, active: boolean,
): Promise<ActionState> {
  const user = await requirePermission('settings:manage');
  const result = await catalogs.toggleSimpleCatalogItem(user, catalog, id, active);
  if (result.error) return { error: result.error };
  revalidatePath('/configuracoes');
  return {};
}

const stageSchema = z.object({
  name: nameSchema,
  kind: z.enum(['ABERTA', 'GANHA', 'PERDIDA', 'SUSPENSA']).default('ABERTA'),
  color: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().nullable().optional(),
  ),
});

export async function addStageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission('settings:manage');
  const parsed = stageSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await catalogs.addStage(user, parsed.data);
  if (result.error) return { error: result.error };
  revalidatePath('/configuracoes');
  return {};
}

/**
 * Marca a etapa que comemora na tela.
 *
 * Só uma por vez: comemorar duas vezes o mesmo negócio esvazia o gesto.
 */
export async function setStageCelebrateAction(
  id: string, celebrate: boolean,
): Promise<ActionState> {
  const user = await requirePermission('settings:manage');
  const result = await catalogs.setStageCelebrate(user, id, celebrate);
  if (result.error) return { error: result.error };
  revalidatePath('/configuracoes');
  revalidatePath('/crm');
  return {};
}

/** Marca a etapa em que o projeto é aberto automaticamente. */
export async function setStageCreatesProjectAction(
  id: string, cria: boolean,
): Promise<ActionState> {
  const admin = await requirePermission('settings:manage');
  const result = await catalogs.setStageCreatesProject(admin, id, cria);
  if (result.error) return { error: result.error };
  revalidatePath('/configuracoes');
  revalidatePath('/crm');
  return {};
}

export async function toggleStageAction(id: string, active: boolean): Promise<ActionState> {
  const user = await requirePermission('settings:manage');
  const result = await catalogs.updateStage(user, id, { active });
  if (result.error) return { error: result.error };
  revalidatePath('/configuracoes');
  return {};
}

/** Campo de texto opcional: string vazia do formulário vira null. */
const textoOpcional = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().nullable().optional(),
);

/** Valor em pt-BR (1.234,56) convertido para o formato que o Prisma aceita. */
const dinheiroOpcional = (rotulo: string) => z.preprocess(
  (v) => (typeof v !== 'string' || v.trim() === '' ? null : v.trim().replace(/\./g, '').replace(',', '.')),
  z.string().regex(/^\d+(\.\d+)?$/, `${rotulo} inválido`).nullable().optional(),
);

const serviceSchema = z.object({
  code: z.string().trim().min(2, 'Informe o código.'),
  name: nameSchema,
  category: textoOpcional,
  discipline: textoOpcional,
  unit: textoOpcional,
  defaultPrice: dinheiroOpcional('Preço'),
  estimatedCost: dinheiroOpcional('Custo'),
  // Textos que o orçamento usa para preencher escopo, premissas e exclusões
  // sozinho quando o serviço é escolhido.
  scopeTemplate: textoOpcional,
  premisesTemplate: textoOpcional,
  exclusionsTemplate: textoOpcional,
});

export async function saveServiceAction(
  serviceId: string | null, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('settings:manage');
  const parsed = serviceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await catalogs.upsertService(user, parsed.data, serviceId ?? undefined);
  if ('error' in result) return { error: result.error };
  revalidatePath('/configuracoes');
  return {};
}

export async function toggleServiceAction(id: string, active: boolean): Promise<ActionState> {
  const user = await requirePermission('settings:manage');
  const result = await catalogs.toggleService(user, id, active);
  if (result.error) return { error: result.error };
  revalidatePath('/configuracoes');
  return {};
}

const retentionSchema = z.object({
  percent: z.preprocess(
    (v) => (typeof v !== 'string' || v.trim() === '' ? '0' : v.trim().replace(',', '.')),
    z.string().regex(/^\d+(\.\d+)?$/, 'Percentual inválido'),
  ),
  active: z.preprocess((v) => v === 'on' || v === 'true', z.boolean().default(false)),
});

export async function updateRetentionAction(
  id: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('settings:manage');
  const parsed = retentionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await catalogs.updateRetention(user, id, parsed.data.percent, parsed.data.active);
  if (result.error) return { error: result.error };
  revalidatePath('/configuracoes');
  return {};
}
