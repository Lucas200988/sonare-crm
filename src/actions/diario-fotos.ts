'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/server/auth/guards';
import * as fotos from '@/server/services/diario-fotos';

export type ActionState = { error?: string; info?: string };

const prepararSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().max(100),
  sizeBytes: z.number().int().min(1),
});

/** Decide o caminho do envio: URL assinada (produção) ou rota (dev). */
export async function prepararUploadFotoAction(
  diaryId: string,
  input: { fileName: string; mimeType: string; sizeBytes: number },
): Promise<
  | { error: string }
  | { modo: 'rota' }
  | { modo: 'direto'; url: string; token: string; storageKey: string }
> {
  const user = await requirePermission('diary:write');
  const parsed = prepararSchema.safeParse(input);
  if (!parsed.success) return { error: 'Arquivo inválido.' };

  const r = await fotos.prepararUploadFoto(user, diaryId, parsed.data);
  if ('error' in r) return { error: r.error ?? 'Falha ao preparar o envio.' };
  if (r.modo === 'rota') return { modo: 'rota' };
  return { modo: 'direto', url: r.url, token: r.token, storageKey: r.storageKey };
}

const confirmarSchema = z.object({
  storageKey: z.string().min(1),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().max(100),
  capturedAt: z.number().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  accuracy: z.number().nullable(),
  source: z.enum(['APP_CAMERA', 'GALLERY_IMPORT', 'FILE_UPLOAD']),
});

/** Confirma a foto que subiu direto ao bucket; o servidor baixa e processa. */
export async function confirmarFotoAction(
  diaryId: string, projectId: string, input: z.infer<typeof confirmarSchema>,
): Promise<ActionState & { photoId?: string; codigo?: string }> {
  const user = await requirePermission('diary:write');
  const parsed = confirmarSchema.safeParse(input);
  if (!parsed.success) return { error: 'Dados do envio inválidos.' };
  const d = parsed.data;

  const r = await fotos.confirmarFotoDireta(user, diaryId, d.storageKey, {
    fileName: d.fileName,
    mimeType: d.mimeType,
    capturedAtDevice: d.capturedAt ? new Date(d.capturedAt) : null,
    lat: d.lat,
    lng: d.lng,
    accuracy: d.accuracy,
    source: d.source,
  });
  if ('error' in r) return { error: r.error };

  revalidatePath(`/obra/${projectId}`);
  return { info: `Foto ${r.codigo} salva.`, photoId: r.photoId, codigo: r.codigo };
}

const categoriaSchema = z.object({
  category: z.string().trim().max(60).optional(),
  description: z.string().trim().max(1000).optional(),
});

export async function categorizarFotoAction(
  photoId: string, projectId: string,
  input: { category?: string; description?: string },
): Promise<ActionState> {
  const user = await requirePermission('diary:write');
  const parsed = categoriaSchema.safeParse(input);
  if (!parsed.success) return { error: 'Dados inválidos.' };

  const r = await fotos.categorizarFoto(user, photoId, parsed.data);
  if ('error' in r) return { error: r.error };

  revalidatePath(`/obra/${projectId}`);
  return { info: 'Foto classificada.' };
}

export async function excluirFotoAction(
  photoId: string, projectId: string, motivo: string,
): Promise<ActionState> {
  const user = await requirePermission('diary:write');
  const r = await fotos.excluirFoto(user, photoId, motivo);
  if ('error' in r) return { error: r.error };

  revalidatePath(`/obra/${projectId}`);
  return { info: 'Foto removida do diário (o arquivo e o hash ficam guardados).' };
}
