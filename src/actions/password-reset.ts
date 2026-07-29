'use server';

import { z } from 'zod';
import {
  requestPasswordReset, resetPasswordWithToken,
} from '@/server/services/password-reset';
import { rateLimit } from '@/server/auth/rate-limit';

export type ResetState = { error?: string; info?: string; aviso?: string };

const pedidoSchema = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.'),
});

export async function requestResetAction(
  _prev: ResetState, formData: FormData,
): Promise<ResetState> {
  const parsed = pedidoSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  // Evita usar a tela para descobrir contas ou inundar caixas de entrada
  if (!rateLimit(`reset:${parsed.data.email}`, 3, 15 * 60_000)) {
    return { error: 'Muitos pedidos. Aguarde 15 minutos e tente novamente.' };
  }

  const r = await requestPasswordReset(parsed.data.email);
  return {
    info: 'Se houver conta com esse e-mail, o link de redefinição foi enviado. Confira também a caixa de spam.',
    aviso: r.avisoEnvio,
  };
}

const novaSenhaSchema = z.object({
  token: z.string().min(10, 'Link inválido.'),
  password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres.'),
  confirmacao: z.string(),
}).refine((d) => d.password === d.confirmacao, {
  message: 'As senhas não conferem.',
  path: ['confirmacao'],
});

export async function resetPasswordAction(
  _prev: ResetState, formData: FormData,
): Promise<ResetState> {
  const parsed = novaSenhaSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const r = await resetPasswordWithToken(parsed.data.token, parsed.data.password);
  if ('error' in r) return { error: r.error };
  return { info: 'Senha alterada. Você já pode entrar com a nova senha.' };
}
