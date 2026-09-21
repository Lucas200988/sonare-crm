'use server';

import { z } from 'zod';
import { requireAuth } from '@/server/auth/guards';
import { conversar, conversaRecente } from '@/server/services/agente';

/**
 * O chat com o Jarvis é de qualquer usuário autenticado: o recorte do que
 * ele pode VER acontece ferramenta a ferramenta, pelo RBAC de sempre.
 */

const perguntaSchema = z.object({
  threadId: z.string().nullable().optional(),
  mensagem: z.string().trim().min(1, 'Escreva uma mensagem.').max(4_000),
  documentoIds: z.array(z.string().min(1).max(60)).max(3).optional(),
});

export async function perguntarAoJarvisAction(input: {
  threadId?: string | null;
  mensagem: string;
  documentoIds?: string[];
}) {
  const user = await requireAuth();
  const parsed = perguntaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Mensagem inválida.' };

  return conversar(user, {
    threadId: parsed.data.threadId ?? null,
    mensagem: parsed.data.mensagem,
    documentoIds: parsed.data.documentoIds,
    canal: 'CRM',
  });
}

export async function conversaRecenteDoJarvisAction() {
  const user = await requireAuth();
  return conversaRecente(user);
}

/**
 * Confirmação de ação proposta — o único caminho de escrita do Jarvis.
 * Executa deterministicamente o que foi proposto, sem o modelo no meio.
 */
export async function confirmarAcaoDoJarvisAction(acaoId: string) {
  const user = await requireAuth();
  if (!acaoId || typeof acaoId !== 'string') return { error: 'Ação inválida.' };
  const { confirmarAcao } = await import('@/server/services/agente-acoes');
  return confirmarAcao(user, acaoId);
}

export async function cancelarAcaoDoJarvisAction(acaoId: string) {
  const user = await requireAuth();
  if (!acaoId || typeof acaoId !== 'string') return { error: 'Ação inválida.' };
  const { cancelarAcao } = await import('@/server/services/agente-acoes');
  return cancelarAcao(user, acaoId);
}

/** Descarta o rascunho de orçamento em elaboração nesta conversa. */
export async function cancelarRascunhoDoJarvisAction(threadId: string) {
  const user = await requireAuth();
  if (!threadId || typeof threadId !== 'string') return { error: 'Conversa inválida.' };
  const { cancelarRascunho } = await import('@/server/services/orcamento-ia');
  return cancelarRascunho(user, threadId);
}
