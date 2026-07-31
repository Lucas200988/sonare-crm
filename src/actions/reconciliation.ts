'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/server/auth/guards';
import * as rec from '@/server/services/reconciliation';

export type ActionState = { error?: string; info?: string };

/** Teto generoso: um OFX de extrato mensal tem poucos KB. */
const TAMANHO_MAXIMO = 2 * 1024 * 1024;

export async function importOfxAction(
  _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('finance:write');

  const arquivo = formData.get('arquivo');
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { error: 'Selecione o arquivo OFX exportado do banco.' };
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    return { error: 'Arquivo grande demais para um extrato — confira se é o OFX correto.' };
  }

  const conteudo = await arquivo.text();
  const result = await rec.importOfx(user, conteudo);
  if ('error' in result) return { error: result.error };

  revalidatePath('/financeiro/conciliacao');
  const partes = [
    `${result.novas} transação(ões) importada(s)`,
    result.conciliadas > 0 ? `${result.conciliadas} conciliada(s) automaticamente` : null,
    result.pendentes > 0 ? `${result.pendentes} para revisar` : null,
    result.repetidas > 0 ? `${result.repetidas} já estavam no sistema` : null,
  ].filter(Boolean);
  return { info: partes.join('; ') + '.' };
}

export async function matchCandidatesAction(transactionId: string) {
  const user = await requirePermission('finance:write');
  return rec.getMatchCandidates(user, transactionId);
}

export async function matchTransactionAction(
  transactionId: string, alvo: { receiptId?: string; payableId?: string },
): Promise<ActionState> {
  const user = await requirePermission('finance:write');
  const result = await rec.matchTransaction(user, transactionId, alvo);
  if ('error' in result) return { error: result.error };
  revalidatePath('/financeiro/conciliacao');
  return { info: 'Conciliado.' };
}

export async function ignoreTransactionAction(transactionId: string): Promise<ActionState> {
  const user = await requirePermission('finance:write');
  const result = await rec.ignoreTransaction(user, transactionId);
  if ('error' in result) return { error: result.error };
  revalidatePath('/financeiro/conciliacao');
  return { info: 'Transação ignorada.' };
}

export async function unmatchTransactionAction(transactionId: string): Promise<ActionState> {
  const user = await requirePermission('finance:write');
  const result = await rec.unmatchTransaction(user, transactionId);
  if ('error' in result) return { error: result.error };
  revalidatePath('/financeiro/conciliacao');
  return { info: 'Voltou para pendente.' };
}
