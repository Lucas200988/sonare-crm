'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/server/auth/guards';
import * as aprovacoes from '@/server/services/aprovacoes';
import { parseDateBR } from '@/lib/dates';

export type ActionState = { error?: string; info?: string };

/** Data digitada em pt-BR; vazia vira hoje. */
function data(valor: FormDataEntryValue | null): Date | null {
  const texto = String(valor ?? '').trim();
  if (!texto) return new Date();
  // o input type=date manda ISO; o resto vem no formato brasileiro
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(texto) ? new Date(`${texto}T12:00:00`) : parseDateBR(texto);
  return iso && !Number.isNaN(iso.getTime()) ? iso : null;
}

export async function abrirAprovacaoAction(
  projectId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('project:write');
  const orgao = String(formData.get('orgao') ?? '').trim();

  const result = await aprovacoes.abrirAprovacao(user, projectId, orgao);
  if ('error' in result) return { error: result.error };

  revalidatePath(`/projetos/${projectId}`);
  return { info: 'Processo aberto. Comece pela solicitação do orçamento de conexão.' };
}

export async function cancelarAprovacaoAction(
  approvalId: string, projectId: string, motivo: string | null,
): Promise<ActionState> {
  const user = await requirePermission('project:write');
  const result = await aprovacoes.cancelarAprovacao(user, approvalId, motivo);
  if ('error' in result) return { error: result.error };

  revalidatePath(`/projetos/${projectId}`);
  return {
    info: result.removido
      ? 'Processo removido. O cartão voltou ao estado anterior.'
      : 'Processo cancelado. Ele fica registrado na auditoria.',
  };
}

const protocoloSchema = z.object({
  protocolo: z.string().trim().min(1, 'Informe o número do protocolo.'),
  notes: z.string().trim().max(500).optional(),
});

export async function registrarProtocoloAction(
  stepId: string, projectId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('project:write');
  const parsed = protocoloSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const quando = data(formData.get('data'));
  if (!quando) return { error: 'Data do protocolo inválida.' };

  const result = await aprovacoes.registrarProtocolo(user, stepId, {
    protocolo: parsed.data.protocolo,
    data: quando,
    notes: parsed.data.notes,
  });
  if ('error' in result) return { error: result.error };

  revalidatePath(`/projetos/${projectId}`);
  return { info: 'Protocolo registrado. O prazo passa a contar desta data.' };
}

export async function registrarCobrancaAction(
  stepId: string, projectId: string,
): Promise<ActionState> {
  const user = await requirePermission('project:write');
  const result = await aprovacoes.registrarCobranca(user, stepId);
  if ('error' in result) return { error: result.error };

  revalidatePath(`/projetos/${projectId}`);
  return { info: 'Cobrança registrada.' };
}

const conclusaoSchema = z.object({
  desfecho: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(500).optional(),
  dispensar: z.preprocess((v) => v === 'on' || v === 'true', z.boolean().default(false)),
});

export async function concluirPassoAction(
  stepId: string, projectId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('project:write');
  const parsed = conclusaoSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const quando = data(formData.get('data'));
  if (!quando) return { error: 'Data inválida.' };

  const result = await aprovacoes.concluirPasso(user, stepId, {
    data: quando,
    desfecho: parsed.data.desfecho,
    notes: parsed.data.notes,
    dispensar: parsed.data.dispensar,
  });
  if ('error' in result) return { error: result.error };

  revalidatePath(`/projetos/${projectId}`);
  return { info: parsed.data.dispensar ? 'Passo dispensado.' : 'Passo concluído.' };
}
