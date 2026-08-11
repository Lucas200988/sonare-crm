'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/server/auth/guards';
import * as followup from '@/server/services/followup';

export type ActionState = { error?: string; info?: string };

const tipoSchema = z.enum(['SEM_RETORNO', 'VISUALIZADA_SEM_DECISAO', 'VALIDADE_PROXIMA', 'EXPIRADA']);

const configSchema = z.object({
  ativo: z.preprocess((v) => v === 'on' || v === true, z.boolean()),
  nivel: z.enum(['avisar', 'preparar', 'automatico']),
  diasSemRetorno: z.coerce.number().int().min(1).max(60),
  diasVisualizadaSemDecisao: z.coerce.number().int().min(1).max(60),
  diasAntesDaValidade: z.coerce.number().int().min(1).max(60),
  intervaloMinimoDias: z.coerce.number().int().min(1).max(60),
  maximoPorClienteSemana: z.coerce.number().int().min(1).max(20),
});

export async function saveFollowUpConfigAction(
  _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('proposal:write');
  const parsed = configSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  await followup.saveConfig(user, parsed.data);
  revalidatePath('/orcamentos/followup');
  return { info: 'Configuração salva.' };
}

/**
 * Monta o follow-up manual de um cartão do pipeline.
 *
 * Não envia nada: devolve destinatário, assunto e corpo prontos para o
 * diálogo, junto com o aviso de contato recente. O envio passa pelo mesmo
 * sendFollowUpAction da fila.
 */
export async function prepararFollowUpManualAction(opportunityId: string) {
  const user = await requirePermission('proposal:write');
  return followup.prepararFollowUpManual(user, opportunityId);
}

export async function sendFollowUpAction(
  _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('proposal:write');
  const dados = {
    proposalId: String(formData.get('proposalId') ?? ''),
    tipo: tipoSchema.safeParse(formData.get('tipo')),
    para: String(formData.get('para') ?? '').trim(),
    assunto: String(formData.get('assunto') ?? '').trim(),
    corpo: String(formData.get('corpo') ?? '').trim(),
  };
  if (!dados.tipo.success) return { error: 'Tipo de follow-up inválido.' };
  if (!dados.para.includes('@')) return { error: 'Informe o e-mail do destinatário.' };
  if (!dados.corpo) return { error: 'A mensagem não pode ficar vazia.' };

  const result = await followup.enviarToque(user, {
    proposalId: dados.proposalId, tipo: dados.tipo.data,
    para: dados.para, assunto: dados.assunto, corpo: dados.corpo,
  });
  if ('error' in result) return { error: result.error };

  revalidatePath('/orcamentos/followup');
  return { info: 'Follow-up enviado.' };
}

export async function registerContactAction(
  proposalId: string, tipo: string, canal: 'WHATSAPP' | 'INTERNO',
): Promise<ActionState> {
  const user = await requirePermission('proposal:write');
  const t = tipoSchema.safeParse(tipo);
  if (!t.success) return { error: 'Tipo de follow-up inválido.' };

  const result = await followup.registrarContatoManual(user, {
    proposalId, tipo: t.data, canal,
    notas: canal === 'WHATSAPP' ? 'Contato por WhatsApp a partir da fila.' : undefined,
  });
  if ('error' in result) return { error: result.error };

  revalidatePath('/orcamentos/followup');
  return { info: canal === 'WHATSAPP' ? 'Contato registrado.' : 'Item dispensado.' };
}

export async function runFollowUpNowAction(): Promise<ActionState> {
  const user = await requirePermission('proposal:write');
  const r = await followup.executarRotina(user);
  revalidatePath('/orcamentos/followup');
  if ('pulou' in r && r.pulou) return { info: `Nada feito: ${r.pulou}.` };
  return { info: `${r.fila ?? 0} item(ns) na fila; ${r.enviados ?? 0} enviado(s).` };
}
