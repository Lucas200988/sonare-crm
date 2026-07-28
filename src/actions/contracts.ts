'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requirePermission } from '@/server/auth/guards';
import * as contracts from '@/server/services/contracts';
import {
  generateContractDraft, addSignature, confirmSignature,
  setContractStatus, createAmendment, signAmendment,
} from '@/server/services/contract-documents';
import { parseDateBR } from '@/lib/dates';
import { parseDecimalBR } from '@/lib/parse';

export type ActionState = { error?: string; info?: string };

const optional = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().nullable().optional(),
);
const decimalStr = z.preprocess(
  (v) => (typeof v === 'string' ? parseDecimalBR(v) : '0'),
  z.string().regex(/^\d+(\.\d+)?$/, 'Valor numérico inválido'),
);
const dateStr = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() !== '' ? parseDateBR(v) : null),
  z.date().nullable().optional(),
);

// ---------- Criação ----------

export async function createFromProposalAction(
  proposalId: string, templateId?: string,
): Promise<ActionState> {
  const user = await requirePermission('contract:write');
  const result = await contracts.createContractFromProposal(user, proposalId, templateId);
  if ('error' in result) return { error: result.error };
  revalidatePath('/contratos');
  redirect(`/contratos/${result.contract.id}`);
}

const createSchema = z.object({
  clientId: z.string().min(1, 'Selecione o cliente.'),
  clientUnitId: optional,
  templateId: optional,
  subject: z.string().trim().min(3, 'Informe o objeto do contrato.'),
  totalValue: decimalStr,
});

export async function createContractAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission('contract:write');
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await contracts.createContract(user, parsed.data);
  if ('error' in result) return { error: result.error };
  revalidatePath('/contratos');
  redirect(`/contratos/${result.contract.id}`);
}

// ---------- Edição ----------

const updateSchema = z.object({
  subject: z.string().trim().min(3, 'Informe o objeto do contrato.'),
  scope: optional,
  totalValue: decimalStr,
  contractNumber: optional,
  templateId: optional,
  startDate: dateStr,
  endDate: dateStr,
  durationDays: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : null),
    z.number().int().positive().nullable().optional(),
  ),
  paymentTerms: optional,
  adjustmentIndex: optional,
  penalties: optional,
  guarantees: optional,
  obligations: optional,
  terminationTerms: optional,
  jurisdiction: optional,
  // variáveis da minuta
  prazoExecucao: optional,
  formatosEntrega: optional,
  localExecucao: optional,
  revisoesIncluidas: optional,
  valorRevisaoExcedente: optional,
});

export async function updateContractAction(
  contractId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('contract:write');
  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const {
    prazoExecucao, formatosEntrega, localExecucao, revisoesIncluidas, valorRevisaoExcedente,
    ...contractFields
  } = parsed.data;

  const variables: Record<string, string> = {};
  if (prazoExecucao) variables.prazoExecucao = prazoExecucao;
  if (formatosEntrega) variables.formatosEntrega = formatosEntrega;
  if (localExecucao) variables.localExecucao = localExecucao;
  if (revisoesIncluidas) variables.revisoesIncluidas = revisoesIncluidas;
  if (valorRevisaoExcedente) variables.valorRevisaoExcedente = valorRevisaoExcedente;

  const result = await contracts.updateContract(user, contractId, {
    ...contractFields,
    variables: Object.keys(variables).length > 0 ? variables : undefined,
  });
  if ('error' in result) return { error: result.error };
  revalidatePath(`/contratos/${contractId}`);
  revalidatePath('/contratos');
  return { info: 'Contrato salvo.' };
}

// ---------- Minuta ----------

export async function generateDraftAction(
  contractId: string,
): Promise<ActionState & { attachmentId?: string; missing?: string[] }> {
  const user = await requirePermission('contract:write');
  const result = await generateContractDraft(user, contractId);
  if ('error' in result) return { error: result.error };

  revalidatePath(`/contratos/${contractId}`);
  const info = result.missingVariables.length > 0
    ? `Minuta V${String(result.versionNumber).padStart(2, '0')} gerada com ${result.missingVariables.length} campo(s) por preencher.`
    : `Minuta V${String(result.versionNumber).padStart(2, '0')} gerada.`;
  return { info, attachmentId: result.attachmentId, missing: result.missingVariables };
}

// ---------- Assinaturas ----------

const signerSchema = z.object({
  signerName: z.string().trim().min(3, 'Informe o nome de quem assina.'),
  signerRole: optional,
  signerEmail: optional,
});

export async function addSignerAction(
  contractId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('contract:write');
  const parsed = signerSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await addSignature(user, contractId, parsed.data);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/contratos/${contractId}`);
  return {};
}

export async function confirmSignatureAction(
  signatureId: string, contractId: string, dateText?: string,
): Promise<ActionState> {
  const user = await requirePermission('contract:sign');
  const signedAt = dateText ? parseDateBR(dateText) ?? new Date() : new Date();
  const result = await confirmSignature(user, signatureId, signedAt);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/contratos/${contractId}`);
  revalidatePath('/contratos');
  return { info: result.contractSigned ? 'Contrato marcado como assinado.' : 'Assinatura registrada.' };
}

const STATUSES = [
  'MINUTA', 'EM_REVISAO_INTERNA', 'AGUARDANDO_APROVACAO', 'ENVIADO_AO_CLIENTE',
  'EM_NEGOCIACAO', 'AGUARDANDO_ASSINATURA', 'ASSINADO', 'VIGENTE',
  'SUSPENSO', 'ENCERRADO', 'RESCINDIDO', 'CANCELADO',
] as const;

export async function setStatusAction(contractId: string, status: string): Promise<ActionState> {
  const user = await requirePermission('contract:write');
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return { error: 'Status inválido.' };

  const result = await setContractStatus(user, contractId, status);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/contratos/${contractId}`);
  revalidatePath('/contratos');
  return {};
}

// ---------- Aditivos ----------

const amendmentSchema = z.object({
  amendmentType: z.enum([
    'VALOR', 'PRAZO', 'ESCOPO', 'FORMA_PAGAMENTO',
    'RESPONSABILIDADE', 'SUSPENSAO', 'RETOMADA', 'RESCISAO',
  ]),
  description: z.string().trim().min(5, 'Descreva o aditivo.'),
  valueDelta: z.preprocess(
    (v) => {
      if (typeof v !== 'string' || v.trim() === '') return null;
      const negative = v.trim().startsWith('-');
      const parsed = parseDecimalBR(v.replace('-', ''));
      return negative ? `-${parsed}` : parsed;
    },
    z.string().regex(/^-?\d+(\.\d+)?$/, 'Valor inválido').nullable().optional(),
  ),
  newEndDate: dateStr,
});

export async function createAmendmentAction(
  contractId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('contract:write');
  const parsed = amendmentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await createAmendment(user, contractId, parsed.data);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/contratos/${contractId}`);
  return { info: 'Aditivo registrado.' };
}

export async function signAmendmentAction(
  amendmentId: string, contractId: string, dateText?: string,
): Promise<ActionState> {
  const user = await requirePermission('contract:sign');
  const signedAt = dateText ? parseDateBR(dateText) ?? new Date() : new Date();
  const result = await signAmendment(user, amendmentId, signedAt);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/contratos/${contractId}`);
  revalidatePath('/contratos');
  return { info: 'Aditivo assinado e aplicado ao contrato.' };
}
