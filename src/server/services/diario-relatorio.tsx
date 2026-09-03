import 'server-only';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import QRCode from 'qrcode';
import { renderToBuffer } from '@react-pdf/renderer';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { escopoDeProjetos } from '@/server/auth/project-scope';
import { generateVerificationCode, verificationUrl, formatHashForDisplay } from '@/server/signature';
import { readAttachment, saveFile } from '@/server/storage';
import { RdoLotePdf, RdoPdf, type RdoPdfData } from '@/server/pdf/rdo-pdf';
import { formatDateBR, formatDateTimeBR } from '@/lib/dates';
import {
  PAPEIS_RDO, dataCalendario, diaDaSemana, ehPapelRdo, percentualDaAtividade,
  prazosDaObra, rotuloDoPapel, totaisDaEquipe, type PapelRdo,
} from '@/lib/rdo-relatorio';
import type { SessionUser } from '@/server/auth/session';

/**
 * O RDO como documento: leitura completa, assinaturas e o PDF emitido.
 *
 * A regra que organiza tudo: enquanto o diário está ABERTO o documento é um
 * rascunho vivo; FINALIZADO ele congela o conteúdo e recebe assinaturas; a
 * assinatura da fiscalização o torna APROVADO e o PDF é gravado no acervo
 * com hash — deste ponto em diante todo download sai do arquivo congelado.
 */

const ROTULO_STATUS = {
  ABERTO: 'Preenchendo Relatório',
  FINALIZADO: 'Finalizado',
  APROVADO: 'Aprovado',
} as const;

function doUsuario(user: SessionUser, diaryId: string) {
  return {
    id: diaryId, companyId: user.companyId, deletedAt: null,
    project: { companyId: user.companyId, deletedAt: null, ...escopoDeProjetos(user) },
  };
}

// ---------- Leitura ----------

export async function getRelatorio(user: SessionUser, diaryId: string) {
  const diario = await prisma.constructionDiary.findFirst({
    where: doUsuario(user, diaryId),
    include: {
      project: {
        select: {
          id: true, code: true, name: true, siteAddress: true,
          startDate: true, expectedEndDate: true, contractualDeadline: true,
          technicalLead: { select: { name: true } },
          contract: { select: { code: true } },
          client: { select: { legalName: true, tradeName: true } },
        },
      },
      entries: { where: { deletedAt: null }, orderBy: { happenedAt: 'asc' } },
      workforce: { orderBy: { role: 'asc' } },
      equipment: { orderBy: { name: 'asc' } },
      photos: {
        where: { deletedAt: null },
        orderBy: { seq: 'asc' },
        select: {
          id: true, seq: true, category: true, description: true,
          viewAttachmentId: true, thumbAttachmentId: true, originalAttachmentId: true,
          mimeType: true, receivedAt: true,
        },
      },
      files: { where: { deletedAt: null }, orderBy: { seq: 'asc' } },
      signatures: { orderBy: { signedAt: 'asc' } },
    },
  });
  if (!diario) return null;

  const [criador, fechador] = await Promise.all([
    diario.openedById
      ? prisma.user.findUnique({ where: { id: diario.openedById }, select: { name: true } })
      : null,
    diario.closedById
      ? prisma.user.findUnique({ where: { id: diario.closedById }, select: { name: true } })
      : null,
  ]);

  const prazos = prazosDaObra(
    dataCalendario(diario.project.startDate),
    dataCalendario(diario.project.expectedEndDate),
    diario.diaryDate,
  );

  return {
    diario,
    prazos,
    diaSemana: diaDaSemana(diario.diaryDate),
    rotuloStatus: ROTULO_STATUS[diario.status],
    criadoPor: criador?.name ?? null,
    fechadoPor: fechador?.name ?? null,
    // papel → assinatura, na ordem do rodapé do documento
    quadroAssinaturas: PAPEIS_RDO.map(({ papel, rotulo }) => ({
      papel,
      rotulo,
      assinatura: diario.signatures.find((a) => a.role === papel) ?? null,
    })),
  };
}

// ---------- Assinatura ----------

/**
 * Assina o RDO em um dos três papéis.
 *
 * Só depois de finalizado: assinatura em rascunho é assinatura em documento
 * que ainda vai mudar. A da fiscalização fecha o ciclo — o diário vira
 * APROVADO e o PDF é congelado no acervo.
 */
export async function assinarRdo(
  user: SessionUser, diaryId: string, papel: string, registro?: string | null,
) {
  if (!ehPapelRdo(papel)) return { error: 'Papel de assinatura inválido.' };

  const diario = await prisma.constructionDiary.findFirst({
    where: doUsuario(user, diaryId),
    select: {
      id: true, code: true, status: true, verificationCode: true,
      signatures: { select: { role: true } },
    },
  });
  if (!diario) return { error: 'Relatório não encontrado.' };
  if (diario.status === 'ABERTO') {
    return { error: 'Finalize o relatório antes de colher assinaturas.' };
  }
  if (diario.signatures.some((a) => a.role === papel)) {
    return { error: `${rotuloDoPapel(papel)} já assinou este relatório.` };
  }

  await prisma.$transaction(async (tx) => {
    await tx.diarySignature.create({
      data: {
        diaryId,
        role: papel,
        name: user.name,
        registration: registro?.trim() || null,
        signedById: user.id,
      },
    });
    await tx.constructionDiary.update({
      where: { id: diaryId },
      data: {
        // garante o código público mesmo em diários finalizados antes desta versão
        verificationCode: diario.verificationCode ?? generateVerificationCode(),
        ...(papel === 'FISCALIZACAO' ? { status: 'APROVADO' } : {}),
      },
    });
  });

  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'sign',
    entityType: 'construction_diary', entityId: diaryId,
    after: { diario: diario.code, papel, nome: user.name },
  });

  // aprovado: emite e congela o PDF com as assinaturas completas até aqui
  if (papel === 'FISCALIZACAO') {
    await emitirPdfCongelado(user, diaryId).catch(() => null);
  }
  return { ok: true as const, aprovado: papel === 'FISCALIZACAO' };
}

/** Volta um FINALIZADO sem assinaturas para ABERTO — errou, corrige e fecha de novo. */
export async function reabrirDiario(user: SessionUser, diaryId: string) {
  const diario = await prisma.constructionDiary.findFirst({
    where: doUsuario(user, diaryId),
    select: { id: true, code: true, status: true, signatures: { select: { id: true } } },
  });
  if (!diario) return { error: 'Relatório não encontrado.' };
  if (diario.status !== 'FINALIZADO') {
    return { error: 'Só um relatório finalizado (e ainda não assinado) pode ser reaberto.' };
  }
  if (diario.signatures.length > 0) {
    return { error: 'Relatório já assinado não reabre — o que foi assinado não muda.' };
  }

  await prisma.constructionDiary.update({
    where: { id: diaryId },
    data: { status: 'ABERTO', closedAt: null, closedById: null },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'update',
    entityType: 'construction_diary', entityId: diaryId,
    after: { diario: diario.code, situacao: 'reaberto' },
  });
  return { ok: true as const };
}

// ---------- Legenda de foto ----------

/** Legenda editável da foto — o texto que sai impresso no relatório. */
export async function legendarFoto(
  user: SessionUser, fotoId: string, legenda: string,
) {
  const foto = await prisma.sitePhoto.findFirst({
    where: {
      id: fotoId, companyId: user.companyId, deletedAt: null,
      diary: { deletedAt: null, status: 'ABERTO' },
    },
    select: { id: true, diaryId: true },
  });
  if (!foto) return { error: 'Foto não encontrada ou relatório já finalizado.' };

  await prisma.sitePhoto.update({
    where: { id: foto.id },
    data: { description: legenda.trim() || null },
  });
  return { ok: true as const };
}

// ---------- PDF ----------

async function montarDadosPdf(
  user: SessionUser, diaryId: string, limiteFotos = 40,
): Promise<RdoPdfData | null> {
  const rel = await getRelatorio(user, diaryId);
  if (!rel) return null;
  const { diario } = rel;

  const logoPng = await readFile(
    path.join(process.cwd(), 'public', 'brand', 'logo-horizontal-preto.png'),
  ).catch(() => null);

  // fotos: a versão com tarja, limitada para o PDF não estourar memória
  const fotos: RdoPdfData['fotos'] = [];
  for (const f of diario.photos.slice(0, limiteFotos)) {
    const attId = f.viewAttachmentId ?? f.originalAttachmentId;
    const arq = await readAttachment(user.companyId, attId);
    if (!arq) continue;
    fotos.push({
      imagem: arq.content,
      formato: arq.attachment.mimeType === 'image/png' ? 'png' : 'jpg',
      legenda: f.description ?? f.category ?? null,
    });
  }

  // clima: 3 períodos quando houver, senão a leitura única da abertura
  const w = diario.weather as Record<string, unknown> | null;
  const periodo = (chave: string, nome: string) => {
    const p = w?.[chave] as { rotulo?: string; praticavel?: boolean } | undefined;
    return p?.rotulo
      ? { periodo: nome, rotulo: p.rotulo, condicao: p.praticavel === false ? 'Impraticável' : 'Praticável' }
      : null;
  };
  const tresPeriodos = [
    periodo('manha', 'Manhã'), periodo('tarde', 'Tarde'), periodo('noite', 'Noite'),
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  const clima = tresPeriodos.length > 0
    ? tresPeriodos
    : (w as { rotulo?: string } | null)?.rotulo
      ? [{
          periodo: 'Dia',
          rotulo: String((w as { rotulo?: string }).rotulo),
          condicao: diario.weatherBlocked ? 'Impraticável' : 'Praticável',
        }]
      : [];

  const entradas = diario.entries;
  const atividades = entradas.filter((e) => e.kind === 'ATIVIDADE').map((e) => {
    const percentual = percentualDaAtividade(e.payload);
    return {
      titulo: e.title,
      descricao: e.description,
      percentual,
      andamento: percentual === null ? null : percentual >= 100 ? 'Concluída' : 'Em andamento',
    };
  });
  const ocorrencias = entradas
    .filter((e) => e.kind === 'OCORRENCIA' || e.kind === 'IMPEDIMENTO')
    .map((e) => ({
      titulo: e.kind === 'IMPEDIMENTO' ? `Impedimento: ${e.title}` : e.title,
      descricao: e.description,
      responsavel: e.responsible,
      status: e.status === 'ABERTA' ? 'Em aberto' : e.status === 'RESOLVIDA' ? 'Resolvida' : null,
    }));
  const comentarios = entradas
    .filter((e) => !['ATIVIDADE', 'OCORRENCIA', 'IMPEDIMENTO'].includes(e.kind))
    .map((e) => ({ titulo: e.title, descricao: e.description }));

  const inicio = dataCalendario(diario.project.startDate);
  const fim = dataCalendario(diario.project.expectedEndDate);

  const verificacao = diario.verificationCode
    ? {
        codigo: diario.verificationCode,
        url: verificationUrl(diario.verificationCode),
        hashInicio: diario.documentHash ? formatHashForDisplay(diario.documentHash) : null,
        qrPng: await QRCode.toBuffer(verificationUrl(diario.verificationCode), {
          type: 'png', width: 180, margin: 1,
          color: { dark: '#111111', light: '#ffffff' },
        }).catch(() => null),
      }
    : null;

  return {
    logoPng,
    codigo: diario.code,
    numero: diario.number,
    dataBR: formatDateBR(new Date(`${diario.diaryDate}T12:00:00Z`)),
    diaSemana: rel.diaSemana,
    status: rel.rotuloStatus,
    obra: {
      nome: diario.project.name,
      endereco: diario.project.siteAddress,
      contratante: diario.project.client.tradeName ?? diario.project.client.legalName,
      responsavel: diario.project.technicalLead?.name ?? null,
      contrato: diario.project.contract?.code ?? null,
      periodo: inicio && fim
        ? `${formatDateBR(new Date(`${inicio}T12:00:00Z`))} até ${formatDateBR(new Date(`${fim}T12:00:00Z`))}`
        : null,
    },
    prazos: rel.prazos,
    clima,
    climaObs: diario.weatherNotes,
    maoDeObra: diario.workforce.map((m) => ({
      funcao: m.role,
      quantidade: m.quantity,
      origem: m.kind === 'TERCEIRO' ? 'TERCEIRO' as const : 'PROPRIA' as const,
    })),
    totaisEquipe: totaisDaEquipe(diario.workforce),
    equipamentos: diario.equipment.map((e) => ({
      nome: e.name, quantidade: e.quantity, identificacao: e.identification,
    })),
    atividades,
    ocorrencias,
    comentarios,
    narrativa: diario.narrative,
    fotos,
    videos: diario.files.filter((f) => f.kind === 'VIDEO')
      .map((f) => ({ nome: f.originalFilename, descricao: f.description })),
    anexos: diario.files.filter((f) => f.kind === 'ANEXO')
      .map((f) => ({ nome: f.originalFilename, descricao: f.description })),
    assinaturas: rel.quadroAssinaturas.map((q) => ({
      rotulo: q.rotulo,
      nome: q.assinatura?.name ?? null,
      registro: q.assinatura?.registration ?? null,
      assinadoEmBR: q.assinatura ? formatDateTimeBR(q.assinatura.signedAt) : null,
    })),
    rodape: {
      criadoPor: rel.criadoPor,
      criadoEmBR: formatDateTimeBR(diario.openedAt),
      modificadoEmBR: diario.updatedAt > diario.openedAt ? formatDateTimeBR(diario.updatedAt) : null,
    },
    verificacao,
  };
}

function nomeArquivoRdo(numero: number, diaryDate: string): string {
  const [ano, mes, dia] = diaryDate.split('-');
  return `RDO nº ${numero} - ${dia}-${mes}-${ano}.pdf`;
}

/** PDF congelado do acervo, se já emitido. */
async function pdfCongelado(user: SessionUser, diaryId: string) {
  const att = await prisma.attachment.findFirst({
    where: {
      companyId: user.companyId, entityType: 'construction_diary',
      entityId: diaryId, category: 'rdo', deletedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  return att ? readAttachment(user.companyId, att.id) : null;
}

/** Emite o PDF final e grava no acervo com hash — chamado na aprovação. */
async function emitirPdfCongelado(user: SessionUser, diaryId: string) {
  const dados = await montarDadosPdf(user, diaryId);
  if (!dados) return null;

  const conteudo = Buffer.from(await renderToBuffer(<RdoPdf data={dados} />));
  const salvo = await saveFile({
    companyId: user.companyId,
    entityType: 'construction_diary',
    entityId: diaryId,
    category: 'rdo',
    fileName: nomeArquivoRdo(dados.numero, dados.dataBR.split('/').reverse().join('-')),
    mimeType: 'application/pdf',
    content: conteudo,
    createdById: user.id,
  });
  await prisma.constructionDiary.update({
    where: { id: diaryId },
    data: { documentHash: salvo.sha256 },
  });
  return conteudo;
}

/**
 * O PDF do RDO para download.
 *
 * Aprovado: sai o arquivo congelado do acervo (o hash publicado confere com
 * ele). Antes disso, renderiza ao vivo — é um documento em elaboração.
 */
export async function gerarPdfDoRdo(user: SessionUser, diaryId: string) {
  const diario = await prisma.constructionDiary.findFirst({
    where: doUsuario(user, diaryId),
    select: { id: true, number: true, diaryDate: true, status: true },
  });
  if (!diario) return null;

  if (diario.status === 'APROVADO') {
    const congelado = await pdfCongelado(user, diaryId);
    if (congelado) {
      return {
        content: congelado.content,
        fileName: congelado.attachment.fileName,
      };
    }
    // aprovado antes desta versão, sem arquivo no acervo: emite e congela agora
    const emitido = await emitirPdfCongelado(user, diaryId);
    if (emitido) {
      return { content: emitido, fileName: nomeArquivoRdo(diario.number, diario.diaryDate) };
    }
  }

  const dados = await montarDadosPdf(user, diaryId);
  if (!dados) return null;
  const conteudo = Buffer.from(await renderToBuffer(<RdoPdf data={dados} />));
  return { content: conteudo, fileName: nomeArquivoRdo(diario.number, diario.diaryDate) };
}

export type PapelAssinatura = PapelRdo;

// ---------- Painel e lista de relatórios ----------

/** Obra visível pelo recorte do usuário (sem exigir diário aberto). */
async function obraDoUsuario(user: SessionUser, projectId: string) {
  return prisma.project.findFirst({
    where: {
      id: projectId, companyId: user.companyId, deletedAt: null, diaryEnabled: true,
      ...escopoDeProjetos(user),
    },
    select: {
      id: true, code: true, name: true, siteAddress: true, status: true,
      startDate: true, expectedEndDate: true,
      technicalLead: { select: { name: true } },
      contract: { select: { code: true } },
      client: { select: { legalName: true, tradeName: true } },
    },
  });
}

/**
 * O painel da obra: contadores, últimos relatórios, últimas fotos e a barra
 * de prazo — a visão de escritório do que o campo produziu.
 */
export async function painelDaObra(user: SessionUser, projectId: string) {
  const projeto = await obraDoUsuario(user, projectId);
  if (!projeto) return null;

  const [relatorios, entradas, fotos, arquivos, ultimasFotos, ultimosRelatorios] = await Promise.all([
    prisma.constructionDiary.count({ where: { projectId, deletedAt: null } }),
    prisma.diaryEntry.groupBy({
      by: ['kind'],
      where: { deletedAt: null, diary: { projectId, deletedAt: null } },
      _count: { _all: true },
    }),
    prisma.sitePhoto.count({ where: { projectId, deletedAt: null } }),
    prisma.diaryFile.groupBy({
      by: ['kind'],
      where: { projectId, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.sitePhoto.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { receivedAt: 'desc' },
      take: 8,
      select: { id: true, description: true, category: true },
    }),
    prisma.constructionDiary.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { diaryDate: 'desc' },
      take: 7,
      select: {
        id: true, number: true, diaryDate: true, status: true,
        _count: { select: { photos: { where: { deletedAt: null } } } },
      },
    }),
  ]);

  const porKind = (lista: Array<{ kind: string; _count: { _all: number } }>, kinds: string[]) =>
    lista.filter((x) => kinds.includes(x.kind)).reduce((a, x) => a + x._count._all, 0);

  return {
    projeto,
    prazos: prazosDaObra(
      dataCalendario(projeto.startDate),
      dataCalendario(projeto.expectedEndDate),
      new Date().toISOString().slice(0, 10),
    ),
    contadores: {
      relatorios,
      atividades: porKind(entradas, ['ATIVIDADE']),
      ocorrencias: porKind(entradas, ['OCORRENCIA', 'IMPEDIMENTO']),
      comentarios: porKind(entradas, ['OBSERVACAO', 'ORIENTACAO', 'VISITANTE', 'MATERIAL']),
      fotos,
      videos: porKind(arquivos, ['VIDEO']),
      anexos: porKind(arquivos, ['ANEXO']),
    },
    ultimasFotos,
    ultimosRelatorios,
  };
}

export type FiltroRelatorios = { de?: string | null; ate?: string | null };

/** Todos os relatórios da obra, filtráveis por período. */
export async function listarRelatorios(
  user: SessionUser, projectId: string, filtro: FiltroRelatorios = {},
) {
  const projeto = await obraDoUsuario(user, projectId);
  if (!projeto) return null;

  const diaryDate: { gte?: string; lte?: string } = {};
  if (filtro.de) diaryDate.gte = filtro.de;
  if (filtro.ate) diaryDate.lte = filtro.ate;

  const itens = await prisma.constructionDiary.findMany({
    where: {
      projectId, deletedAt: null,
      ...(diaryDate.gte || diaryDate.lte ? { diaryDate } : {}),
    },
    orderBy: { diaryDate: 'desc' },
    select: {
      id: true, number: true, code: true, diaryDate: true, status: true,
      geofence: true,
      signatures: { select: { role: true } },
      _count: {
        select: {
          photos: { where: { deletedAt: null } },
          files: { where: { deletedAt: null } },
          entries: { where: { deletedAt: null } },
        },
      },
    },
  });
  return { projeto, itens };
}

/**
 * PDF único com todos os RDOs do período — o pacote que acompanha a medição.
 *
 * Fotos limitadas por diário no lote, para o arquivo (e a memória do
 * servidor) não explodirem num mês inteiro de obra.
 */
export async function gerarPdfDoPeriodo(
  user: SessionUser, projectId: string, de: string, ate: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate) || ate < de) {
    return { error: 'Período inválido.' };
  }
  const listagem = await listarRelatorios(user, projectId, { de, ate });
  if (!listagem) return { error: 'Obra não encontrada.' };
  const ordenados = [...listagem.itens].reverse(); // do mais antigo ao mais novo
  if (ordenados.length === 0) return { error: 'Nenhum relatório no período.' };
  if (ordenados.length > 31) return { error: 'Período longo demais — limite de 31 relatórios por arquivo.' };

  const dados: RdoPdfData[] = [];
  for (const item of ordenados) {
    const d = await montarDadosPdf(user, item.id, 15);
    if (d) dados.push(d);
  }
  if (dados.length === 0) return { error: 'Nenhum relatório no período.' };

  const [anoDe, mesDe, diaDe] = de.split('-');
  const [anoAte, mesAte, diaAte] = ate.split('-');
  const titulo = `RDOs ${listagem.projeto.code} — ${diaDe}/${mesDe}/${anoDe} a ${diaAte}/${mesAte}/${anoAte}`;
  const content = Buffer.from(await renderToBuffer(<RdoLotePdf dados={dados} titulo={titulo} />));
  return {
    content,
    fileName: `${titulo.replace(/\//g, '-')}.pdf`,
    quantidade: dados.length,
  };
}
