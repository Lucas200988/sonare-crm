'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/server/auth/guards';
import * as relatorio from '@/server/services/diario-relatorio';

export type ActionState = { error?: string; info?: string };

export async function assinarRdoAction(
  diaryId: string, projectId: string, papel: string, registro: string | null,
): Promise<ActionState> {
  const user = await requirePermission('diary:write');
  const r = await relatorio.assinarRdo(user, diaryId, papel, registro);
  if ('error' in r) return { error: r.error };

  revalidatePath(`/obra/${projectId}`);
  return {
    info: r.aprovado
      ? 'Assinado. Com a fiscalização, o relatório está aprovado e o PDF foi congelado.'
      : 'Assinatura registrada.',
  };
}

export async function reabrirDiarioAction(
  diaryId: string, projectId: string,
): Promise<ActionState> {
  const user = await requirePermission('diary:write');
  const r = await relatorio.reabrirDiario(user, diaryId);
  if ('error' in r) return { error: r.error };

  revalidatePath(`/obra/${projectId}`);
  return { info: 'Relatório reaberto para correção.' };
}

export async function legendarFotoAction(
  fotoId: string, projectId: string, legenda: string,
): Promise<ActionState> {
  const user = await requirePermission('diary:write');
  const r = await relatorio.legendarFoto(user, fotoId, legenda);
  if ('error' in r) return { error: r.error };

  revalidatePath(`/obra/${projectId}`);
  return { info: 'Legenda salva.' };
}
