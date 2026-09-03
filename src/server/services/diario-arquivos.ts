import 'server-only';
import { createHash } from 'node:crypto';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { escopoDeProjetos } from '@/server/auth/project-scope';
import { createDirectUpload, readByKey, registerStoredFile, saveFile } from '@/server/storage';
import type { SessionUser } from '@/server/auth/session';

/**
 * Vídeos e anexos do Diário de Obras.
 *
 * Mesma disciplina das fotos: hash calculado do que chegou ao servidor,
 * original intocado, exclusão sempre lógica e com motivo. O vídeo não entra
 * no PDF — o relatório lista que ele existe, e a tela o reproduz.
 */

export type TipoArquivo = 'VIDEO' | 'ANEXO';

const LIMITES: Record<TipoArquivo, { maxBytes: number; descricao: string }> = {
  VIDEO: { maxBytes: 100 * 1024 * 1024, descricao: 'Vídeo de até 100 MB' },
  ANEXO: { maxBytes: 25 * 1024 * 1024, descricao: 'Anexo de até 25 MB' },
};

const MIMES_ANEXO = [
  'application/pdf', 'text/plain', 'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

function tipoAceito(kind: TipoArquivo, mimeType: string): boolean {
  if (kind === 'VIDEO') return mimeType.startsWith('video/');
  return mimeType.startsWith('image/') || MIMES_ANEXO.includes(mimeType);
}

/** Diário aberto e visível — igual às fotos. */
async function diarioAberto(user: SessionUser, diaryId: string) {
  const diario = await prisma.constructionDiary.findFirst({
    where: {
      id: diaryId, companyId: user.companyId, deletedAt: null,
      project: { companyId: user.companyId, deletedAt: null, ...escopoDeProjetos(user) },
    },
    select: { id: true, code: true, status: true, projectId: true },
  });
  if (!diario) return { error: 'Diário não encontrado.' as const };
  if (diario.status !== 'ABERTO') {
    return { error: 'Este diário já foi finalizado.' as const };
  }
  return { diario };
}

/** Valida e prepara o envio — URL assinada em produção, rota comum no local. */
export async function prepararUploadArquivo(
  user: SessionUser, diaryId: string,
  input: { fileName: string; mimeType: string; sizeBytes: number; kind: TipoArquivo },
) {
  const r = await diarioAberto(user, diaryId);
  if ('error' in r) return { error: r.error };

  if (!tipoAceito(input.kind, input.mimeType)) {
    return {
      error: input.kind === 'VIDEO'
        ? 'Envie um vídeo (MP4, MOV…).'
        : 'Anexo deve ser PDF, imagem, planilha ou documento.',
    };
  }
  const limite = LIMITES[input.kind];
  if (input.sizeBytes > limite.maxBytes) {
    return { error: `${limite.descricao} — o arquivo passa disso.` };
  }

  const direto = await createDirectUpload({
    companyId: user.companyId,
    fileName: input.fileName,
  });
  if (!direto) return { ok: true as const, modo: 'rota' as const };
  return { ok: true as const, modo: 'direto' as const, ...direto };
}

export type MetaArquivo = {
  fileName: string;
  mimeType: string;
  kind: TipoArquivo;
  description?: string | null;
};

/** Grava o registro do arquivo — caminho comum aos dois modos de envio. */
export async function salvarArquivo(
  user: SessionUser, diaryId: string, conteudo: Buffer,
  meta: MetaArquivo, storageKeyExistente?: string,
) {
  const r = await diarioAberto(user, diaryId);
  if ('error' in r) return { error: r.error };
  const { diario } = r;

  if (!tipoAceito(meta.kind, meta.mimeType)) return { error: 'Tipo de arquivo não aceito.' };
  if (conteudo.length > LIMITES[meta.kind].maxBytes) {
    return { error: `${LIMITES[meta.kind].descricao} — o arquivo passa disso.` };
  }

  const original = storageKeyExistente
    ? await registerStoredFile({
        companyId: user.companyId, entityType: 'diary_file', entityId: diaryId,
        fileName: meta.fileName, mimeType: meta.mimeType,
        storageKey: storageKeyExistente, content: conteudo, createdById: user.id,
      })
    : await saveFile({
        companyId: user.companyId, entityType: 'diary_file', entityId: diaryId,
        fileName: meta.fileName, mimeType: meta.mimeType,
        content: conteudo, createdById: user.id,
      });

  const ultimo = await prisma.diaryFile.aggregate({
    where: { diaryId, kind: meta.kind },
    _max: { seq: true },
  });

  const arquivo = await prisma.diaryFile.create({
    data: {
      companyId: user.companyId,
      projectId: diario.projectId,
      diaryId,
      kind: meta.kind,
      seq: (ultimo._max.seq ?? 0) + 1,
      description: meta.description?.trim() || null,
      attachmentId: original.attachmentId,
      originalFilename: meta.fileName,
      mimeType: meta.mimeType,
      sizeBytes: conteudo.length,
      sha256: createHash('sha256').update(conteudo).digest('hex'),
      createdById: user.id,
    },
  });

  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'create',
    entityType: 'diary_file', entityId: arquivo.id,
    after: {
      diario: diario.code, tipo: meta.kind,
      arquivo: meta.fileName, bytes: conteudo.length, sha256: arquivo.sha256,
    },
  });
  return { ok: true as const, fileId: arquivo.id };
}

/** Confirma um envio direto ao bucket: baixa, confere e registra. */
export async function confirmarArquivoDireto(
  user: SessionUser, diaryId: string, storageKey: string, meta: MetaArquivo,
) {
  if (!storageKey.startsWith(`${user.companyId}/`)) {
    return { error: 'Arquivo inválido.' };
  }
  const conteudo = await readByKey(storageKey);
  if (!conteudo || conteudo.length === 0) {
    return { error: 'O arquivo não chegou ao armazenamento. Tente enviar de novo.' };
  }
  return salvarArquivo(user, diaryId, conteudo, meta, storageKey);
}

/** Descrição editável enquanto o diário está aberto. */
export async function descreverArquivo(user: SessionUser, fileId: string, descricao: string) {
  const arquivo = await prisma.diaryFile.findFirst({
    where: {
      id: fileId, companyId: user.companyId, deletedAt: null,
      diary: {
        status: 'ABERTO', deletedAt: null,
        project: { companyId: user.companyId, deletedAt: null, ...escopoDeProjetos(user) },
      },
    },
    select: { id: true },
  });
  if (!arquivo) return { error: 'Arquivo não encontrado ou diário já finalizado.' };

  await prisma.diaryFile.update({
    where: { id: fileId },
    data: { description: descricao.trim() || null },
  });
  return { ok: true as const };
}

/** Exclusão lógica com motivo — evidência não some, sai da frente. */
export async function excluirArquivo(user: SessionUser, fileId: string, motivo: string) {
  if (!motivo.trim()) return { error: 'Informe o motivo da exclusão.' };

  const arquivo = await prisma.diaryFile.findFirst({
    where: {
      id: fileId, companyId: user.companyId, deletedAt: null,
      diary: {
        deletedAt: null,
        project: { companyId: user.companyId, deletedAt: null, ...escopoDeProjetos(user) },
      },
    },
    select: { id: true, originalFilename: true, sha256: true, diary: { select: { status: true, code: true } } },
  });
  if (!arquivo) return { error: 'Arquivo não encontrado.' };
  if (arquivo.diary.status !== 'ABERTO') {
    return { error: 'O diário já foi finalizado. Exclusão exige retificação.' };
  }

  await prisma.diaryFile.update({
    where: { id: fileId },
    data: { deletedAt: new Date(), deletedById: user.id, deleteReason: motivo.trim() },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'delete',
    entityType: 'diary_file', entityId: fileId,
    before: {
      diario: arquivo.diary.code, arquivo: arquivo.originalFilename,
      sha256: arquivo.sha256, motivo: motivo.trim(),
    },
  });
  return { ok: true as const };
}

/** Arquivos do diário para a tela. */
export async function listarArquivos(user: SessionUser, diaryId: string) {
  return prisma.diaryFile.findMany({
    where: {
      diaryId, companyId: user.companyId, deletedAt: null,
      diary: {
        project: { companyId: user.companyId, deletedAt: null, ...escopoDeProjetos(user) },
      },
    },
    orderBy: [{ kind: 'asc' }, { seq: 'asc' }],
  });
}
