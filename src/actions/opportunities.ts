'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requirePermission } from '@/server/auth/guards';
import * as opps from '@/server/services/opportunities';
import { parseDateBR } from '@/lib/dates';
import { parseDecimalBR } from '@/lib/parse';

const optional = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().nullable().optional(),
);

const decimalStr = z.preprocess(
  (v) => {
    if (typeof v !== 'string' || v.trim() === '') return null;
    return parseDecimalBR(v);
  },
  z.string().regex(/^\d+(\.\d+)?$/, 'Valor numérico inválido').nullable().optional(),
);

const dateStr = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() !== '' ? parseDateBR(v) : null),
  z.date().nullable().optional(),
);

const oppSchema = z.object({
  title: z.string().trim().min(3, 'Informe o título da oportunidade.'),
  clientId: z.string().min(1, 'Selecione o cliente.'),
  clientUnitId: optional,
  primaryContactId: optional,
  description: optional,
  serviceCatalogId: optional,
  discipline: optional,
  commercialOwnerId: optional,
  technicalOwnerId: optional,
  leadSourceId: optional,
  estimatedValue: decimalStr,
  probability: decimalStr,
  expectedCloseDate: dateStr,
  estimatedDuration: optional,
  priority: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']).default('MEDIA'),
  competitors: optional,
  hiringReason: optional,
  clientNeed: optional,
  nextAction: optional,
  nextActionDate: dateStr,
  notes: optional,
});

export type ActionState = { error?: string };

export async function createOpportunityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission('opportunity:write');
  const parsed = oppSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await opps.createOpportunity(user, parsed.data);
  if ('error' in result) return { error: result.error };

  revalidatePath('/crm');
  redirect(`/crm/${result.opportunity.id}`);
}

export async function updateOpportunityAction(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission('opportunity:write');
  const parsed = oppSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await opps.updateOpportunity(user, id, parsed.data);
  if ('error' in result) return { error: result.error };

  revalidatePath('/crm');
  revalidatePath(`/crm/${id}`);
  redirect(`/crm/${id}`);
}

/** Chamada pelo Kanban (drag-and-drop) e pelo detalhe. Retorna erro especial quando falta motivo de perda. */
export async function moveStageAction(input: {
  opportunityId: string;
  targetStageId: string;
  lossReasonId?: string;
  lossNotes?: string;
}): Promise<ActionState & { needsLossReason?: boolean }> {
  const user = await requirePermission('opportunity:write');
  const result = await opps.moveOpportunityStage(user, input.opportunityId, input.targetStageId, {
    lossReasonId: input.lossReasonId,
    lossNotes: input.lossNotes,
  });
  if ('error' in result) {
    if (result.error === 'MOTIVO_PERDA_OBRIGATORIO') return { needsLossReason: true };
    return { error: result.error };
  }
  revalidatePath('/crm');
  revalidatePath(`/crm/${input.opportunityId}`);
  return {};
}

// ---------- Atividades ----------

const activitySchema = z.object({
  activityType: z.enum([
    'LIGACAO', 'REUNIAO', 'VISITA_TECNICA', 'MENSAGEM', 'EMAIL', 'TAREFA',
    'LEMBRETE', 'ENVIO_DOCUMENTO', 'FOLLOW_UP', 'NEGOCIACAO', 'DECISAO',
  ]),
  title: z.string().trim().min(2, 'Descreva a atividade.'),
  notes: optional,
  responsibleId: optional,
  dueAt: dateStr,
});

export async function createActivityAction(
  target: { opportunityId?: string; clientId?: string },
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('activity:write');
  const parsed = activitySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await opps.createActivity(user, { ...parsed.data, ...target });
  if ('error' in result) return { error: result.error };

  if (target.opportunityId) revalidatePath(`/crm/${target.opportunityId}`);
  if (target.clientId) revalidatePath(`/clientes/${target.clientId}`);
  return {};
}

export async function completeActivityAction(activityId: string, path: string): Promise<ActionState> {
  const user = await requirePermission('activity:write');
  const result = await opps.setActivityStatus(user, activityId, 'CONCLUIDA');
  if ('error' in result) return { error: result.error };
  revalidatePath(path);
  return {};
}
