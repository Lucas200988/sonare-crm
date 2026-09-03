'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/server/auth/guards';
import * as arquivos from '@/server/services/diario-arquivos';

export type ActionState = { error?: string; info?: string };

const tipoSchema = z.enum(['VIDEO', 'ANEXO']);

const prepararSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(3).max(120),
  sizeBytes: z.number().int().positive(),
  kind: tipoSchema,
});

export async function prepararUploadArquivoAction(
  diaryId: string,
  input: { fileName: string; mimeType: string; sizeBytes: number; kind: string },
) {
  const user = await requirePermission('diary:write');
  const parsed = prepararSchema.safeParse(input);
  if (!parsed.success) return { error: 'Arquivo inválido.' };
  return arquivos.prepararUploadArquivo(user, diaryId, parsed.data);
}

export async function confirmarArquivoDiretoAction(
  diaryId: string, projectId: string,
  input: { storageKey: string; fileName: string; mimeType: string; kind: string; description?: string },
) {
  const user = await requirePermission('diary:write');
  const kind = tipoSchema.safeParse(input.kind);
  if (!kind.success) return { error: 'Tipo inválido.' };

  const r = await arquivos.confirmarArquivoDireto(user, diaryId, input.storageKey, {
    fileName: input.fileName,
    mimeType: input.mimeType,
    kind: kind.data,
    description: input.description ?? null,
  });
  if ('error' in r) return { error: r.error };

  revalidatePath(`/obra/${projectId}`);
  return { info: 'Arquivo registrado.' };
}

export async function descreverArquivoAction(
  fileId: string, projectId: string, descricao: string,
): Promise<ActionState> {
  const user = await requirePermission('diary:write');
  const r = await arquivos.descreverArquivo(user, fileId, descricao);
  if ('error' in r) return { error: r.error };
  revalidatePath(`/obra/${projectId}`);
  return { info: 'Descrição salva.' };
}

export async function excluirArquivoAction(
  fileId: string, projectId: string, motivo: string,
): Promise<ActionState> {
  const user = await requirePermission('diary:write');
  const r = await arquivos.excluirArquivo(user, fileId, motivo);
  if ('error' in r) return { error: r.error };
  revalidatePath(`/obra/${projectId}`);
  return { info: 'Arquivo excluído (registro preservado na auditoria).' };
}
