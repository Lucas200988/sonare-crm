import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
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

/**
 * O nome do bucket diferencia maiúsculas ("Documentos" e "documentos" são
 * buckets distintos). Como o nome é digitado à mão no painel do Supabase, um
 * "D" maiúsculo derrubaria toda a emissão de documentos. Descobrimos o nome
 * real uma vez e guardamos em memória.
 */
let bucketResolvido: string | null = null;

async function resolveBucket(client: ReturnType<typeof supabaseClient>): Promise<string> {
  if (bucketResolvido) return bucketResolvido;

  const { data, error } = await client.storage.listBuckets();
  if (error || !data) {
    // sem permissão para listar: segue com o nome configurado
    bucketResolvido = BUCKET;
    return bucketResolvido;
  }

  const exato = data.find((b) => b.name === BUCKET);
  const semCaso = data.find((b) => b.name.toLowerCase() === BUCKET.toLowerCase());
  if (!exato && !semCaso) {
    throw new Error(
      `O bucket "${BUCKET}" não existe no Supabase. ` +
      `Buckets disponíveis: ${data.map((b) => b.name).join(', ') || 'nenhum'}. ` +
      'Crie-o em Storage → New bucket (privado) ou ajuste SUPABASE_STORAGE_BUCKET.',
    );
  }
  bucketResolvido = (exato ?? semCaso)!.name;
  return bucketResolvido;
}

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
    const client = supabaseClient();
    const bucket = await resolveBucket(client);
    const { error } = await client
      .storage.from(bucket)
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
      const client = supabaseClient();
      const bucket = await resolveBucket(client);
      const { data, error } = await client.storage.from(bucket).download(attachment.storageKey);
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
      const client = supabaseClient();
      await client.storage.from(await resolveBucket(client)).remove([storageKey]);
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

/**
 * Confere se o bucket realmente existe e aceita gravação. O health check só
 * olhava as variáveis de ambiente — e um bucket com nome divergente passava
 * despercebido até a primeira emissão de documento falhar.
 */
export async function checkStorageAccess(): Promise<
  { ok: true; bucket: string } | { ok: false; erro: string }
> {
  if (!useSupabase()) return { ok: true, bucket: 'local' };
  try {
    const client = supabaseClient();
    const bucket = await resolveBucket(client);
    const chave = '.healthcheck';
    const { error } = await client.storage
      .from(bucket)
      .upload(chave, Buffer.from('ok'), { contentType: 'text/plain', upsert: true });
    if (error) return { ok: false, erro: error.message };
    return { ok: true, bucket };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'falha desconhecida' };
  }
}

// ---------- Upload direto (fotos de obra) ----------

/**
 * URL assinada para o navegador subir o arquivo direto ao bucket.
 *
 * Existe por causa do limite de 4,5 MB por requisição nas funções da
 * Vercel: foto de celular passa disso com folga. O original vai do
 * aparelho ao storage sem tocar no servidor; depois o servidor baixa,
 * confere o hash e gera as derivadas.
 *
 * No driver local (desenvolvimento) não há URL assinada — o chamador cai
 * para o envio comum, que localmente não tem limite.
 */
export async function createDirectUpload(input: {
  companyId: string;
  fileName: string;
}): Promise<{ url: string; token: string; storageKey: string } | null> {
  if (!useSupabase()) return null;

  const client = supabaseClient();
  const bucket = await resolveBucket(client);
  const key = path.posix.join(
    input.companyId,
    String(new Date().getFullYear()),
    'site_photo',
    `${randomUUID()}-${input.fileName.replace(/[^\w.\-]+/g, '_')}`,
  );
  const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(key);
  if (error || !data) {
    throw new Error(`Falha ao preparar o envio: ${error?.message ?? 'sem resposta'}`);
  }
  return { url: data.signedUrl, token: data.token, storageKey: key };
}

/** Lê um objeto do storage pela chave — usado antes de existir Attachment. */
export async function readByKey(storageKey: string): Promise<Buffer | null> {
  try {
    if (useSupabase()) {
      const client = supabaseClient();
      const bucket = await resolveBucket(client);
      const { data, error } = await client.storage.from(bucket).download(storageKey);
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    }
    return await readFile(path.join(baseDir(), storageKey));
  } catch {
    return null;
  }
}

/**
 * Registra como Attachment um objeto que já está no storage (veio pelo
 * upload direto). O hash é calculado aqui, do conteúdo baixado — nunca
 * confiado ao cliente.
 */
export async function registerStoredFile(input: {
  companyId: string;
  entityType: string;
  entityId: string;
  category?: string;
  fileName: string;
  mimeType: string;
  storageKey: string;
  content: Buffer;
  createdById?: string;
}): Promise<SavedFile> {
  const sha256 = createHash('sha256').update(input.content).digest('hex');
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
      storageKey: input.storageKey,
      createdById: input.createdById,
    },
  });
  return { attachmentId: attachment.id, storageKey: input.storageKey, sha256, sizeBytes: input.content.length };
}
