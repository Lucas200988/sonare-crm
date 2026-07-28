import 'server-only';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '@/server/db';

/**
 * Armazenamento de documentos com dois destinos:
 *
 *  - `supabase`: bucket privado — obrigatório em produção, pois servidores na
 *    nuvem têm sistema de arquivos efêmero (o disco é apagado a cada deploy).
 *  - `local`: pasta no disco — prático no desenvolvimento.
 *
 * O destino vem de STORAGE_DRIVER. Quando as credenciais do Supabase existem,
 * ele é usado automaticamente, evitando perder arquivos por esquecimento de
 * configuração.
 */

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'documentos';

function supabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function useSupabase(): boolean {
  const driver = process.env.STORAGE_DRIVER;
  if (driver === 'local') return false;
  if (driver === 'supabase') return true;
  return supabaseConfigured(); // automático
}

function supabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Storage no Supabase exige SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY. ' +
      'Configure-as ou defina STORAGE_DRIVER=local.',
    );
  }
  // A chave de serviço só existe no servidor; nunca chega ao navegador.
  return createClient(url, key, { auth: { persistSession: false } });
}

function baseDir(): string {
  return path.resolve(process.env.STORAGE_LOCAL_PATH ?? './storage');
}

export type SavedFile = {
  attachmentId: string;
  storageKey: string;
  sha256: string;
  sizeBytes: number;
};

export async function saveFile(input: {
  companyId: string;
  entityType: string;
  entityId: string;
  category?: string;
  fileName: string;
  mimeType: string;
  content: Buffer;
  createdById?: string;
}): Promise<SavedFile> {
  const sha256 = createHash('sha256').update(input.content).digest('hex');
  const now = new Date();
  const key = path.posix.join(
    input.companyId,
    String(now.getFullYear()),
    input.entityType,
    `${sha256.slice(0, 16)}-${input.fileName.replace(/[^\w.\-]+/g, '_')}`,
  );

  if (useSupabase()) {
    const { error } = await supabaseClient()
      .storage.from(BUCKET)
      .upload(key, input.content, { contentType: input.mimeType, upsert: true });
    if (error) throw new Error(`Falha ao enviar o arquivo: ${error.message}`);
  } else {
    const fullPath = path.join(baseDir(), key);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, input.content);
  }

  const attachment = await prisma.attachment.create({
    data: {
      companyId: input.companyId,
      entityType: input.entityType,
      entityId: input.entityId,
      category: input.category,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.content.length,
      sha256,
      storageKey: key,
      createdById: input.createdById,
    },
  });

  return { attachmentId: attachment.id, storageKey: key, sha256, sizeBytes: input.content.length };
}

export async function readAttachment(companyId: string, attachmentId: string) {
  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, companyId, deletedAt: null },
  });
  if (!attachment) return null;

  try {
    if (useSupabase()) {
      const { data, error } = await supabaseClient().storage.from(BUCKET).download(attachment.storageKey);
      if (error || !data) return null;
      return { attachment, content: Buffer.from(await data.arrayBuffer()) };
    }
    const content = await readFile(path.join(baseDir(), attachment.storageKey));
    return { attachment, content };
  } catch {
    return null;
  }
}

/** Remove o arquivo do destino atual. Usado na limpeza de documentos. */
export async function deleteStoredFile(storageKey: string): Promise<void> {
  try {
    if (useSupabase()) {
      await supabaseClient().storage.from(BUCKET).remove([storageKey]);
      return;
    }
    await rm(path.join(baseDir(), storageKey), { force: true });
  } catch {
    // arquivo já ausente não é erro
  }
}

/** Diagnóstico exibido nas configurações e no health check. */
export function storageInfo() {
  return {
    driver: useSupabase() ? ('supabase' as const) : ('local' as const),
    bucket: useSupabase() ? BUCKET : null,
    configured: useSupabase() ? supabaseConfigured() : true,
  };
}
