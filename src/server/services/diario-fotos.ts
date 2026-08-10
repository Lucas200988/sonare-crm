import 'server-only';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { escopoDeProjetos } from '@/server/auth/project-scope';
import { createDirectUpload, readByKey, registerStoredFile, saveFile } from '@/server/storage';
import { processarFoto } from '@/server/fotos';
import { codigoFoto } from '@/lib/diario-regras';
import type { SessionUser } from '@/server/auth/session';

/**
 * Fotografias do Diário de Obras.
 *
 * Regras que não se negociam: o original nunca é alterado; o hash é
 * calculado do que chegou ao servidor, nunca confiado ao cliente; excluir é
 * lógico e com motivo; e o relógio do aparelho fica separado do relógio do
 * servidor — o oficial é o do servidor.
 */

/** Diário aberto e visível — toda operação de foto passa por aqui. */
async function diarioAberto(user: SessionUser, diaryId: string) {
  const diario = await prisma.constructionDiary.findFirst({
    where: {
      id: diaryId, companyId: user.companyId, deletedAt: null,
      project: { companyId: user.companyId, deletedAt: null, ...escopoDeProjetos(user) },
    },
    select: {
      id: true, code: true, status: true, projectId: true,
      project: { select: { name: true } },
    },
  });
  if (!diario) return { error: 'Diário não encontrado.' as const };
  if (diario.status !== 'ABERTO') {
    return { error: 'Este diário já foi finalizado.' as const };
  }
  return { diario };
}

/**
 * Prepara o envio de uma foto.
 *
 * Em produção devolve a URL assinada para o aparelho subir o original
 * direto ao bucket — o limite de 4,5 MB por requisição da Vercel não
 * comporta foto de celular. Em desenvolvimento (driver local) o envio vai
 * pela rota comum, que não tem esse teto.
 */
export async function prepararUploadFoto(
  user: SessionUser, diaryId: string,
  input: { fileName: string; mimeType: string; sizeBytes: number },
) {
  const r = await diarioAberto(user, diaryId);
  if ('error' in r) return { error: r.error };

  if (!input.mimeType.startsWith('image/')) {
    return { error: 'Envie uma imagem (JPG, PNG ou HEIC).' };
  }
  if (input.sizeBytes > 30 * 1024 * 1024) {
    return { error: 'Foto acima de 30 MB. Reduza a resolução da câmera.' };
  }

  const direto = await createDirectUpload({
    companyId: user.companyId,
    fileName: input.fileName,
  });
  if (!direto) return { ok: true as const, modo: 'rota' as const };
  return { ok: true as const, modo: 'direto' as const, ...direto };
}

export type MetaFoto = {
  fileName: string;
  mimeType: string;
  capturedAtDevice: Date | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  source: 'APP_CAMERA' | 'GALLERY_IMPORT' | 'FILE_UPLOAD';
  deviceInfo?: string | null;
};

/**
 * Processa e grava uma foto cujo conteúdo está em memória.
 *
 * Caminho comum aos dois modos de envio: hash do que chegou, original
 * intocado, miniatura e versão com tarja, e o registro com os dois relógios
 * separados.
 */
export async function salvarFoto(
  user: SessionUser, diaryId: string, conteudo: Buffer,
  meta: MetaFoto, storageKeyExistente?: string,
) {
  const r = await diarioAberto(user, diaryId);
  if ('error' in r) return { error: r.error };
  const { diario } = r;

  const agora = new Date();
  const dataHora = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Cuiaba',
  }).format(agora);

  // sequencial da foto no diário — vira RDO-…-F007
  const ultimo = await prisma.sitePhoto.aggregate({
    where: { diaryId },
    _max: { seq: true },
  });
  const seq = (ultimo._max.seq ?? 0) + 1;
  const codigo = codigoFoto(diario.code, seq);

  const processada = await processarFoto(conteudo, {
    empresa: 'SONARE Engenharia',
    projeto: diario.project.name,
    dataHora,
    codigoFoto: codigo,
    gps: meta.lat !== null && meta.lng !== null
      ? `GPS ${meta.lat.toFixed(6)}, ${meta.lng.toFixed(6)}`
      : null,
  });

  // original: registra o que já está no bucket, ou envia agora (modo rota)
  const original = storageKeyExistente
    ? await registerStoredFile({
        companyId: user.companyId, entityType: 'site_photo', entityId: diaryId,
        fileName: meta.fileName, mimeType: meta.mimeType,
        storageKey: storageKeyExistente, content: conteudo, createdById: user.id,
      })
    : await saveFile({
        companyId: user.companyId, entityType: 'site_photo', entityId: diaryId,
        fileName: meta.fileName, mimeType: meta.mimeType,
        content: conteudo, createdById: user.id,
      });

  const [thumb, view] = await Promise.all([
    saveFile({
      companyId: user.companyId, entityType: 'site_photo_thumb', entityId: diaryId,
      fileName: `${codigo}-thumb.jpg`, mimeType: 'image/jpeg',
      content: processada.thumb, createdById: user.id,
    }),
    saveFile({
      companyId: user.companyId, entityType: 'site_photo_view', entityId: diaryId,
      fileName: `${codigo}-view.jpg`, mimeType: 'image/jpeg',
      content: processada.view, createdById: user.id,
    }),
  ]);

  const foto = await prisma.sitePhoto.create({
    data: {
      companyId: user.companyId,
      projectId: diario.projectId,
      diaryId,
      seq,
      originalAttachmentId: original.attachmentId,
      viewAttachmentId: view.attachmentId,
      thumbAttachmentId: thumb.attachmentId,
      capturedAtDevice: meta.capturedAtDevice ?? processada.exifDate,
      lat: meta.lat ?? processada.exifGps?.lat ?? null,
      lng: meta.lng ?? processada.exifGps?.lng ?? null,
      accuracy: meta.accuracy,
      captureSource: meta.source,
      originalFilename: meta.fileName,
      mimeType: meta.mimeType,
      sizeBytes: conteudo.length,
      sha256: original.sha256,
      width: processada.width,
      height: processada.height,
      exif: processada.exifDate || processada.exifGps
        ? {
            date: processada.exifDate?.toISOString() ?? null,
            gps: processada.exifGps,
          }
        : undefined,
      deviceInfo: meta.deviceInfo ?? null,
      createdById: user.id,
    },
  });

  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'create',
    entityType: 'site_photo', entityId: foto.id,
    after: {
      codigo, diario: diario.code, sha256: original.sha256,
      origem: meta.source, bytes: conteudo.length,
    },
  });
  return { ok: true as const, photoId: foto.id, codigo, seq };
}

/** Confirma uma foto do upload direto: baixa do bucket, confere e processa. */
export async function confirmarFotoDireta(
  user: SessionUser, diaryId: string, storageKey: string, meta: MetaFoto,
) {
  // a chave tem que ser da própria empresa — nada de confirmar objeto alheio
  if (!storageKey.startsWith(`${user.companyId}/`)) {
    return { error: 'Arquivo inválido.' };
  }
  const conteudo = await readByKey(storageKey);
  if (!conteudo || conteudo.length === 0) {
    return { error: 'O arquivo não chegou ao armazenamento. Tente enviar de novo.' };
  }
  return salvarFoto(user, diaryId, conteudo, meta, storageKey);
}

/** Foto visível pelo recorte do usuário — mesmo em diário fechado (leitura). */
async function fotoVisivelEditavel(user: SessionUser, photoId: string) {
  return prisma.sitePhoto.findFirst({
    where: {
      id: photoId, companyId: user.companyId, deletedAt: null,
      diary: {
        project: { companyId: user.companyId, deletedAt: null, ...escopoDeProjetos(user) },
      },
    },
    select: { id: true, seq: true, sha256: true, diary: { select: { status: true, code: true } } },
  });
}

/** Classificação por um toque, depois da foto tirada. */
export async function categorizarFoto(
  user: SessionUser, photoId: string,
  input: { category?: string | null; description?: string | null },
) {
  const foto = await fotoVisivelEditavel(user, photoId);
  if (!foto) return { error: 'Foto não encontrada.' };
  if (foto.diary.status !== 'ABERTO') return { error: 'O diário já foi finalizado.' };

  await prisma.sitePhoto.update({
    where: { id: photoId },
    data: {
      category: input.category?.trim() || null,
      description: input.description?.trim() || null,
    },
  });
  return { ok: true as const };
}

/**
 * Exclusão lógica, com motivo obrigatório.
 *
 * A evidência não some: arquivo e hash continuam no storage e no banco, com
 * quem excluiu e por quê. Eliminação definitiva não existe por aqui.
 */
export async function excluirFoto(user: SessionUser, photoId: string, motivo: string) {
  if (!motivo.trim()) return { error: 'Informe o motivo da exclusão.' };

  const foto = await fotoVisivelEditavel(user, photoId);
  if (!foto) return { error: 'Foto não encontrada.' };
  if (foto.diary.status !== 'ABERTO') {
    return { error: 'O diário já foi finalizado. Exclusão exige retificação.' };
  }

  await prisma.sitePhoto.update({
    where: { id: photoId },
    data: { deletedAt: new Date(), deletedById: user.id, deleteReason: motivo.trim() },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'delete',
    entityType: 'site_photo', entityId: photoId,
    before: {
      codigo: codigoFoto(foto.diary.code, foto.seq),
      sha256: foto.sha256, motivo: motivo.trim(),
    },
  });
  return { ok: true as const };
}

/** Fotos do diário para a galeria. */
export async function listarFotos(user: SessionUser, diaryId: string) {
  return prisma.sitePhoto.findMany({
    where: {
      diaryId, companyId: user.companyId, deletedAt: null,
      diary: {
        project: { companyId: user.companyId, deletedAt: null, ...escopoDeProjetos(user) },
      },
    },
    orderBy: { seq: 'asc' },
  });
}

/** Carrega a foto com o recorte de acesso — para a rota que serve a imagem. */
export async function getFotoVisivel(user: SessionUser, photoId: string) {
  return prisma.sitePhoto.findFirst({
    where: {
      id: photoId, companyId: user.companyId,
      diary: {
        project: { companyId: user.companyId, deletedAt: null, ...escopoDeProjetos(user) },
      },
    },
  });
}
