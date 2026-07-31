'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/server/auth/guards';
import * as finance from '@/server/services/finance';
import { parseDecimalBR } from '@/lib/parse';

export type ActionState = { error?: string; info?: string };

const optional = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().nullable().optional(),
);

/** Campo de dinheiro digitado em pt-BR ("1.250,00") vira decimal com ponto. */
const dinheiro = z.preprocess(
  (v) => (typeof v === 'string' ? parseDecimalBR(v) : v),
  z.string().regex(/^\d+(\.\d{1,2})?$/, 'Valor inválido.'),
);

const payableSchema = z.object({
  description: z.string().trim().min(3, 'Descreva a conta.'),
  supplier: optional,
  category: optional,
  projectId: optional,
  dueDate: z.string().min(1, 'Informe o vencimento.'),
  amount: dinheiro,
  notes: optional,
});

// ---------- Contas a receber ----------

const receivableSchema = z.object({
  clientId: z.string().min(1, 'Selecione o cliente.'),
  description: z.string().trim().min(3, 'Descreva a cobrança.'),
  dueDate: z.string().min(1, 'Informe o vencimento.'),
  grossValue: dinheiro,
  contractId: optional,
  projectId: optional,
  notes: optional,
  jaRecebido: z.preprocess((v) => v === 'on' || v === 'true', z.boolean().default(false)),
});

/**
 * Lançamento a partir do cartão do projeto: cliente e projeto já vêm do
 * contexto, e a entrada paga no ato entra como recebida em um passo só.
 */
export async function createProjectReceivableAction(
  projectId: string, clientId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('finance:write');
  const parsed = receivableSchema.safeParse({
    ...Object.fromEntries(formData.entries()),
    projectId,
    clientId,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await finance.createReceivable(user, parsed.data);
  if ('error' in result) return { error: result.error };

  revalidatePath(`/projetos/${projectId}`);
  revalidatePath('/financeiro/receber');
  revalidatePath('/financeiro');
  return {
    info: parsed.data.jaRecebido
      ? `Recebimento de ${result.receivable.code} registrado.`
      : `Cobrança ${result.receivable.code} lançada.`,
  };
}

/** Despesa lançada direto do cartão do projeto. */
export async function createProjectPayableAction(
  projectId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('finance:write');
  const parsed = payableSchema.safeParse({
    ...Object.fromEntries(formData.entries()),
    projectId,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await finance.createPayable(user, parsed.data);
  if ('error' in result) return { error: result.error };

  revalidatePath(`/projetos/${projectId}`);
  revalidatePath('/financeiro/pagar');
  return { info: 'Despesa lançada.' };
}

export async function createReceivableAction(
  _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('finance:write');
  const parsed = receivableSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await finance.createReceivable(user, parsed.data);
  if ('error' in result) return { error: result.error };

  revalidatePath('/financeiro/receber');
  revalidatePath('/financeiro');
  return { info: `Parcela ${result.receivable.code} criada.` };
}

const installmentsSchema = z.object({
  quantidade: z.coerce.number().int().min(1, 'Mínimo de 1 parcela.').max(60, 'Máximo de 60 parcelas.'),
  primeiroVencimento: z.string().min(1, 'Informe o primeiro vencimento.'),
  intervaloDias: z.coerce.number().int().min(1).max(365).default(30),
});

export async function generateInstallmentsAction(
  contractId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('finance:write');
  const parsed = installmentsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await finance.generateInstallments(user, contractId, parsed.data);
  if ('error' in result) return { error: result.error };

  revalidatePath('/financeiro/receber');
  revalidatePath(`/contratos/${contractId}`);
  return { info: `${result.quantidade} parcela(s) gerada(s).` };
}

const receiptSchema = z.object({
  receivedAt: z.string().min(1, 'Informe a data.'),
  amount: dinheiro,
  interest: dinheiro.optional(),
  fine: dinheiro.optional(),
  discount: dinheiro.optional(),
  notes: optional,
});

export async function registerReceiptAction(
  receivableId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('finance:write');
  const parsed = receiptSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await finance.registerReceipt(user, receivableId, parsed.data);
  if ('error' in result) return { error: result.error };

  revalidatePath('/financeiro/receber');
  revalidatePath('/financeiro');
  return { info: result.quitado ? 'Parcela quitada.' : 'Recebimento parcial registrado.' };
}

export async function cancelReceivableAction(id: string): Promise<ActionState> {
  const user = await requirePermission('finance:write');
  const result = await finance.cancelReceivable(user, id);
  if ('error' in result) return { error: result.error };
  revalidatePath('/financeiro/receber');
  return { info: 'Parcela cancelada.' };
}

export async function reverseReceiptAction(receivableId: string): Promise<ActionState> {
  const user = await requirePermission('finance:write');
  const result = await finance.reverseLastReceipt(user, receivableId);
  if ('error' in result) return { error: result.error };
  revalidatePath('/financeiro/receber');
  revalidatePath('/financeiro');
  return { info: 'Recebimento estornado.' };
}

export async function deleteReceivableAction(id: string): Promise<ActionState> {
  const user = await requirePermission('finance:write');
  const result = await finance.deleteReceivable(user, id);
  if ('error' in result) return { error: result.error };
  revalidatePath('/financeiro/receber');
  revalidatePath('/financeiro');
  return { info: 'Parcela excluída.' };
}

// ---------- Contas a pagar ----------


export async function createPayableAction(
  _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('finance:write');
  const parsed = payableSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await finance.createPayable(user, parsed.data);
  if ('error' in result) return { error: result.error };

  revalidatePath('/financeiro/pagar');
  revalidatePath('/financeiro');
  return { info: 'Conta lançada.' };
}

const paySchema = z.object({
  paidAt: z.string().min(1, 'Informe a data do pagamento.'),
  paidAmount: dinheiro,
});

export async function payPayableAction(
  id: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('finance:write');
  const parsed = paySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await finance.payPayable(user, id, parsed.data);
  if ('error' in result) return { error: result.error };

  revalidatePath('/financeiro/pagar');
  revalidatePath('/financeiro');
  return { info: 'Pagamento registrado.' };
}

// ---------- Notas fiscais ----------

const invoiceSchema = z.object({
  number: z.string().trim().min(1, 'Informe o número da nota.'),
  series: optional,
  issueDate: z.string().min(1, 'Informe a data de emissão.'),
  clientId: z.string().min(1, 'Selecione o cliente.'),
  grossValue: dinheiro,
  retentionsTotal: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? parseDecimalBR(v) : '0'),
    z.string().regex(/^\d+(\.\d{1,2})?$/, 'Retenções inválidas.'),
  ),
  serviceDescription: optional,
  externalLink: optional,
  projectId: optional,
});

export async function createInvoiceAction(
  _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('invoice:write');
  const parsed = invoiceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const receivableIds = formData.getAll('receivableIds').map(String).filter(Boolean);
  const result = await finance.createInvoice(user, { ...parsed.data, receivableIds });
  if ('error' in result) return { error: result.error };

  revalidatePath('/financeiro/notas');
  revalidatePath('/financeiro/receber');
  return { info: `Nota ${result.invoice.number} registrada.` };
}

export async function cancelInvoiceAction(id: string, reason: string): Promise<ActionState> {
  const user = await requirePermission('invoice:write');
  const result = await finance.cancelInvoice(user, id, reason);
  if ('error' in result) return { error: result.error };
  revalidatePath('/financeiro/notas');
  return { info: 'Nota cancelada.' };
}

export async function listReceivablesToInvoiceAction(clientId: string) {
  const user = await requirePermission('invoice:write');
  const lista = await finance.listReceivablesToInvoice(user, clientId);
  return lista.map((r) => ({
    id: r.id, code: r.code, description: r.description,
    dueDate: r.dueDate.toISOString(), netValue: r.netValue.toString(),
  }));
}

// ---------- Cobrança ----------

export async function addCollectionEventAction(
  receivableId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('finance:write');
  const eventType = String(formData.get('eventType') ?? '');
  if (!eventType) return { error: 'Selecione o tipo de contato.' };

  const result = await finance.addCollectionEvent(user, receivableId, {
    eventType,
    channel: String(formData.get('channel') ?? '') || null,
    notes: String(formData.get('notes') ?? '') || null,
  });
  if ('error' in result) return { error: result.error };

  revalidatePath('/financeiro/cobranca');
  revalidatePath('/financeiro/receber');
  return { info: 'Contato de cobrança registrado.' };
}

const cobrancaEmailSchema = z.object({
  para: z.string().trim().email('Informe um e-mail válido.'),
  assunto: z.string().trim().min(3, 'Informe o assunto.'),
  mensagem: z.string().trim().min(10, 'Escreva a mensagem.'),
  eventType: z.string().min(1),
});

export async function sendCollectionEmailAction(
  receivableId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('finance:write');
  const parsed = cobrancaEmailSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await finance.sendCollectionEmail(user, receivableId, parsed.data);
  if ('error' in result) return { error: result.error };

  revalidatePath('/financeiro/cobranca');
  return { info: `Cobrança enviada para ${parsed.data.para}.` };
}

export async function reopenPayableAction(id: string): Promise<ActionState> {
  const user = await requirePermission('finance:write');
  const result = await finance.setPayableStatus(user, id, 'A_PAGAR');
  if ('error' in result) return { error: result.error };
  revalidatePath('/financeiro/pagar');
  return { info: 'Pagamento desfeito.' };
}

export async function deletePayableAction(id: string): Promise<ActionState> {
  const user = await requirePermission('finance:write');
  const result = await finance.deletePayable(user, id);
  if ('error' in result) return { error: result.error };
  revalidatePath('/financeiro/pagar');
  return { info: 'Conta removida.' };
}
