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
});

export async function perguntarAoJarvisAction(input: {
  threadId?: string | null;
  mensagem: string;
}) {
  const user = await requireAuth();
  const parsed = perguntaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Mensagem inválida.' };

  return conversar(user, {
    threadId: parsed.data.threadId ?? null,
    mensagem: parsed.data.mensagem,
    canal: 'CRM',
  });
}

export async function conversaRecenteDoJarvisAction() {
  const user = await requireAuth();
  return conversaRecente(user);
}
