'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requirePermission } from '@/server/auth/guards';
import * as budgets from '@/server/services/budgets';
import {
  generateProposal, registerProposalEvent, sendProposalByEmail,
} from '@/server/services/proposals';
import { parseDateBR } from '@/lib/dates';
import { parseDecimalBR } from '@/lib/parse';

export type ActionState = { error?: string; info?: string };

const decimalStr = z.preprocess(
  (v) => (typeof v === 'string' ? parseDecimalBR(v) : '0'),
  z.string().regex(/^\d+(\.\d+)?$/, 'Valor numérico inválido'),
);

// ---------- Criação ----------

const createSchema = z.object({
  clientId: z.string().min(1, 'Selecione o cliente.'),
  opportunityId: z.preprocess((v) => (v === '' ? null : v), z.string().nullable().optional()),
  clientUnitId: z.preprocess((v) => (v === '' ? null : v), z.string().nullable().optional()),
});

export async function createBudgetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission('budget:write');
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await budgets.createBudget(user, parsed.data);
  if ('error' in result) return { error: result.error };
  revalidatePath('/orcamentos');
  redirect(`/orcamentos/${result.budget.id}`);
}

// ---------- Salvar versão corrente (itens + condições) ----------

const itemSchema = z.object({
  serviceCatalogId: z.string().optional().nullable(),
  description: z.string().trim().min(1, 'Item sem descrição.'),
  discipline: z.string().optional().nullable(),
  stage: z.string().optional().nullable(),
  itemType: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  quantity: decimalStr,
  unitPrice: decimalStr,
  unitCost: decimalStr.optional(),
  discount: decimalStr.optional(),
});

const versionSchema = z.object({
  validUntil: z.string().optional(),
  serviceType: z.string().optional(),
  scope: z.string().optional(),
  premises: z.string().optional(),
  exclusions: z.string().optional(),
  executionDeadline: z.string().optional(),
  deliveryMethod: z.string().optional(),
  paymentTerms: z.string().optional(),
  discount: decimalStr,
  surcharge: decimalStr,
  taxes: decimalStr,
  estimatedRetentions: decimalStr,
  internalNotes: z.string().optional(),
  clientNotes: z.string().optional(),
  contactId: z.preprocess((v) => (v === '' ? null : v), z.string().nullable().optional()),
  // null = usar o texto padrão da empresa; string (mesmo vazia) = sobrepor,
  // porque o texto genérico às vezes não se aplica ao serviço do orçamento.
  generalInfoOverride: z.string().nullable().optional(),
  differentialsOverride: z.string().nullable().optional(),
  items: z.array(itemSchema).max(200),
});

export async function saveVersionAction(budgetId: string, payload: unknown): Promise<ActionState> {
  const user = await requirePermission('budget:write');
  const parsed = versionSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await budgets.saveCurrentVersion(user, budgetId, {
    ...parsed.data,
    validUntil: parsed.data.validUntil ? parseDateBR(parsed.data.validUntil) : null,
    serviceType: parsed.data.serviceType || null,
    scope: parsed.data.scope || null,
    premises: parsed.data.premises || null,
    exclusions: parsed.data.exclusions || null,
    executionDeadline: parsed.data.executionDeadline || null,
    deliveryMethod: parsed.data.deliveryMethod || null,
    paymentTerms: parsed.data.paymentTerms || null,
    internalNotes: parsed.data.internalNotes || null,
    clientNotes: parsed.data.clientNotes || null,
    contactId: parsed.data.contactId ?? null,
    generalInfoOverride: parsed.data.generalInfoOverride ?? null,
    differentialsOverride: parsed.data.differentialsOverride ?? null,
  });
  if ('error' in result) return { error: result.error };
  revalidatePath(`/orcamentos/${budgetId}`);
  return { info: 'Orçamento salvo.' };
}

// ---------- Fluxo ----------

export async function newVersionAction(budgetId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission('budget:write');
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 3) return { error: 'Informe a justificativa da nova versão.' };

  const result = await budgets.createNewVersion(user, budgetId, reason);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/orcamentos/${budgetId}`);
  return {};
}

export async function submitBudgetAction(budgetId: string): Promise<ActionState> {
  const user = await requirePermission('budget:write');
  const result = await budgets.submitBudget(user, budgetId);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/orcamentos/${budgetId}`);
  revalidatePath('/orcamentos');
  if (result.status === 'APROVADO') return { info: 'Orçamento aprovado automaticamente (nenhuma regra violada).' };
  const labels = result.triggers.map((t) => budgets.TRIGGER_LABELS[t] ?? t).join('; ');
  return { info: `Enviado para aprovação interna: ${labels}.` };
}

export async function decideApprovalAction(
  budgetId: string, approve: boolean, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('budget:approve');
  const comment = String(formData.get('comment') ?? '').trim() || undefined;
  const result = await budgets.decideApproval(user, budgetId, approve, comment);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/orcamentos/${budgetId}`);
  revalidatePath('/orcamentos');
  return {};
}

export async function deleteBudgetAction(budgetId: string): Promise<ActionState> {
  const user = await requirePermission('budget:write');
  const result = await budgets.softDeleteBudget(user, budgetId);
  if ('error' in result) return { error: result.error };
  revalidatePath('/orcamentos');
  revalidatePath('/dashboard');
  redirect('/orcamentos');
}

export async function cancelBudgetAction(
  budgetId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('budget:write');
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 3) return { error: 'Informe o motivo do cancelamento.' };

  const result = await budgets.cancelBudget(user, budgetId, reason);
  if ('error' in result) return { error: result.error };
  revalidatePath('/orcamentos');
  revalidatePath(`/orcamentos/${budgetId}`);
  revalidatePath('/dashboard');
  return { info: 'Orçamento cancelado.' };
}

export async function generateProposalAction(
  budgetId: string,
): Promise<ActionState & { attachmentId?: string; fileName?: string }> {
  const user = await requirePermission('proposal:write');
  const result = await generateProposal(user, budgetId);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/orcamentos/${budgetId}`);
  return {
    info: result.reemitida
      ? `Proposta ${result.code} reemitida (${result.emissionCount}ª emissão).`
      : `Proposta ${result.code} gerada.`,
    attachmentId: result.attachmentId,
    fileName: result.fileName,
  };
}

const eventSchema = z.object({
  event: z.enum(['ENVIADA', 'VISUALIZADA', 'ACEITA', 'RECUSADA']),
  sentVia: z.string().optional(),
  recipients: z.string().optional(),
  rejectionReason: z.string().optional(),
});

const envioSchema = z.object({
  para: z.string().trim().email('Informe um e-mail válido.'),
  mensagem: z.string().optional(),
});

/** Envia a proposta ao cliente com o PDF anexado. */
export async function sendProposalAction(
  proposalId: string, budgetId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('proposal:write');
  const parsed = envioSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await sendProposalByEmail(user, proposalId, parsed.data);
  if ('error' in result) return { error: result.error };

  revalidatePath(`/orcamentos/${budgetId}`);
  revalidatePath('/orcamentos');
  return { info: `Proposta enviada para ${parsed.data.para}.` };
}

export async function proposalEventAction(
  proposalId: string, budgetId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('proposal:write');
  const parsed = eventSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: 'Dados inválidos.' };

  const result = await registerProposalEvent(user, proposalId, parsed.data.event, {
    sentVia: parsed.data.sentVia,
    recipients: parsed.data.recipients,
    rejectionReason: parsed.data.rejectionReason,
  });
  if ('error' in result) return { error: result.error };
  revalidatePath(`/orcamentos/${budgetId}`);
  revalidatePath('/orcamentos');
  revalidatePath('/dashboard');
  return {};
}
