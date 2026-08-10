import 'server-only';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { escopoDeProjetos } from '@/server/auth/project-scope';
import {
  classificarLocal, codigoDiario, diaDaObra, pendenciasDoFechamento,
  rotuloDoClima, type ResumoParaFechar,
} from '@/lib/diario-regras';
import type { DiaryEntryKind, Prisma } from '@/generated/prisma/client';
import type { SessionUser } from '@/server/auth/session';

/**
 * Diário de Obras (RDO).
 *
 * A filosofia do módulo: o colaborador produz a evidência, o sistema produz
 * o relatório. Tudo que o sistema já sabe — usuário, data, obra, projeto,
 * localização — é preenchido sozinho; o campo só registra o que aconteceu.
 */

/** Projeto-obra visível para o usuário. */
function obraVisivel(user: SessionUser, projectId: string): Prisma.ProjectWhereInput {
  return {
    id: projectId, companyId: user.companyId, deletedAt: null,
    diaryEnabled: true,
    ...escopoDeProjetos(user),
  };
}

// ---------- Lista de obras ----------

/** Obras do usuário com a situação do diário de hoje — a tela inicial mobile. */
export async function listarObras(user: SessionUser) {
  const hoje = diaDaObra(new Date());
  const projetos = await prisma.project.findMany({
    where: {
      companyId: user.companyId, deletedAt: null, archivedAt: null,
      diaryEnabled: true,
      status: { notIn: ['CONCLUIDO', 'ENCERRADO', 'CANCELADO'] },
      ...escopoDeProjetos(user),
    },
    select: {
      id: true, code: true, name: true, siteAddress: true,
      client: { select: { legalName: true, tradeName: true } },
      diaries: {
        where: { diaryDate: hoje, deletedAt: null },
        select: { id: true, code: true, status: true },
        take: 1,
      },
    },
    orderBy: { code: 'asc' },
  });

  return projetos.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    endereco: p.siteAddress,
    cliente: p.client.tradeName ?? p.client.legalName,
    diarioDeHoje: p.diaries[0] ?? null,
  }));
}

// ---------- Clima ----------

/**
 * Clima atual pelo Open-Meteo — sem chave, sem cadastro.
 *
 * Nunca derruba a abertura do diário: sem coordenadas ou sem rede, o campo
 * fica vazio e pode ser preenchido à mão. A fonte e o horário da consulta
 * ficam gravados, porque dado automático sem origem vira dado inventado.
 */
async function consultarClima(lat: number, lng: number) {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${lat}&longitude=${lng}`
      + '&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m';
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const json = await res.json();
    const c = json?.current;
    if (!c) return null;
    return {
      fonte: 'open-meteo.com',
      consultadoEm: new Date().toISOString(),
      rotulo: rotuloDoClima(Number(c.weather_code)),
      tempC: c.temperature_2m ?? null,
      umidade: c.relative_humidity_2m ?? null,
      chuvaMm: c.precipitation ?? null,
      ventoKmh: c.wind_speed_10m ?? null,
    };
  } catch {
    return null;
  }
}

// ---------- Abertura ----------

export type LocalizacaoAbertura = {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
};

export async function abrirDiario(
  user: SessionUser, projectId: string, loc: LocalizacaoAbertura,
) {
  const projeto = await prisma.project.findFirst({
    where: obraVisivel(user, projectId),
    select: {
      id: true, code: true, name: true,
      siteLat: true, siteLng: true, siteRadiusM: true,
    },
  });
  if (!projeto) return { error: 'Obra não encontrada ou sem diário habilitado.' };

  const hoje = diaDaObra(new Date());
  const existente = await prisma.constructionDiary.findFirst({
    where: { projectId, diaryDate: hoje, deletedAt: null },
    select: { id: true },
  });
  // Reabrir a tela no meio do dia não pode criar outro diário
  if (existente) return { ok: true as const, diaryId: existente.id, jaExistia: true };

  const { classe, distanciaM } = classificarLocal(
    { lat: loc.lat, lng: loc.lng },
    { lat: projeto.siteLat, lng: projeto.siteLng, raioM: projeto.siteRadiusM },
  );

  // clima pela posição do aparelho; sem ela, pela geofence da obra
  const climaLat = loc.lat ?? projeto.siteLat;
  const climaLng = loc.lng ?? projeto.siteLng;
  const weather = climaLat !== null && climaLng !== null
    ? await consultarClima(climaLat, climaLng)
    : null;

  const ano = Number(hoje.slice(0, 4));

  const criado = await prisma.$transaction(async (tx) => {
    const ultimo = await tx.constructionDiary.aggregate({
      where: { projectId },
      _max: { number: true },
    });
    const numero = (ultimo._max.number ?? 0) + 1;
    return tx.constructionDiary.create({
      data: {
        companyId: user.companyId,
        projectId,
        number: numero,
        code: codigoDiario(projeto.code, ano, numero),
        diaryDate: hoje,
        openedById: user.id,
        openLat: loc.lat,
        openLng: loc.lng,
        openAccuracy: loc.accuracy,
        geofence: classe,
        geofenceDistM: distanciaM,
        weather: weather ?? undefined,
      },
    });
  });

  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'create',
    entityType: 'construction_diary', entityId: criado.id,
    after: { code: criado.code, obra: projeto.code, geofence: classe, distanciaM },
  });
  return { ok: true as const, diaryId: criado.id, jaExistia: false };
}

// ---------- Leitura ----------

export async function getDiario(user: SessionUser, diaryId: string) {
  return prisma.constructionDiary.findFirst({
    where: {
      id: diaryId, companyId: user.companyId, deletedAt: null,
      project: { companyId: user.companyId, deletedAt: null, ...escopoDeProjetos(user) },
    },
    include: {
      project: {
        select: {
          id: true, code: true, name: true, siteAddress: true,
          client: { select: { legalName: true, tradeName: true } },
          stages: { select: { name: true }, orderBy: { sortOrder: 'asc' } },
          tasks: {
            where: { deletedAt: null, status: { notIn: ['CONCLUIDA', 'CANCELADA'] } },
            select: { title: true },
            orderBy: { boardPosition: 'asc' },
          },
        },
      },
      entries: { where: { deletedAt: null }, orderBy: { happenedAt: 'asc' } },
      workforce: { orderBy: { role: 'asc' } },
      equipment: { orderBy: { name: 'asc' } },
    },
  });
}

/** O diário de hoje desta obra, com tudo que a home mobile mostra. */
export async function getDiarioDeHoje(user: SessionUser, projectId: string) {
  const hoje = diaDaObra(new Date());
  const d = await prisma.constructionDiary.findFirst({
    where: { projectId, diaryDate: hoje, deletedAt: null },
    select: { id: true },
  });
  return d ? getDiario(user, d.id) : null;
}

/** Diário aberto que aceita registro — toda escrita passa por aqui. */
async function diarioEditavel(user: SessionUser, diaryId: string) {
  const diario = await prisma.constructionDiary.findFirst({
    where: {
      id: diaryId, companyId: user.companyId, deletedAt: null,
      project: { companyId: user.companyId, deletedAt: null, ...escopoDeProjetos(user) },
    },
    select: { id: true, code: true, status: true, projectId: true },
  });
  if (!diario) return { error: 'Diário não encontrado.' as const };
  if (diario.status !== 'ABERTO') {
    return { error: 'Este diário já foi finalizado. Alterações exigem retificação.' as const };
  }
  return { diario };
}

// ---------- Registros ----------

export type NovoRegistro = {
  kind: DiaryEntryKind;
  title: string;
  description?: string | null;
  responsible?: string | null;
  payload?: Record<string, unknown> | null;
};

export async function registrarNoDiario(user: SessionUser, diaryId: string, input: NovoRegistro) {
  const r = await diarioEditavel(user, diaryId);
  if ('error' in r) return { error: r.error };

  const entry = await prisma.diaryEntry.create({
    data: {
      diaryId,
      kind: input.kind,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      responsible: input.responsible?.trim() || null,
      payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      // ocorrência e impedimento nascem abertos, para cobrança posterior
      status: input.kind === 'OCORRENCIA' || input.kind === 'IMPEDIMENTO' ? 'ABERTA' : null,
      createdById: user.id,
    },
  });

  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'create',
    entityType: 'diary_entry', entityId: entry.id,
    after: { diario: r.diario.code, tipo: input.kind, titulo: entry.title },
  });
  return { ok: true as const, entryId: entry.id };
}

export async function removerRegistro(user: SessionUser, diaryId: string, entryId: string) {
  const r = await diarioEditavel(user, diaryId);
  if ('error' in r) return { error: r.error };

  const entry = await prisma.diaryEntry.findFirst({
    where: { id: entryId, diaryId, deletedAt: null },
  });
  if (!entry) return { error: 'Registro não encontrado.' };

  // exclusão lógica: a evidência não some, sai da frente
  await prisma.diaryEntry.update({
    where: { id: entryId },
    data: { deletedAt: new Date() },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'delete',
    entityType: 'diary_entry', entityId: entryId,
    before: { diario: r.diario.code, tipo: entry.kind, titulo: entry.title },
  });
  return { ok: true as const };
}

// ---------- Equipe e equipamentos ----------

export async function adicionarEquipe(
  user: SessionUser, diaryId: string,
  input: { role: string; company?: string | null; quantity: number },
) {
  const r = await diarioEditavel(user, diaryId);
  if ('error' in r) return { error: r.error };
  if (!input.role.trim()) return { error: 'Informe a função.' };
  if (input.quantity < 1) return { error: 'Quantidade deve ser ao menos 1.' };

  await prisma.diaryWorkforce.create({
    data: {
      diaryId,
      role: input.role.trim(),
      company: input.company?.trim() || null,
      quantity: input.quantity,
    },
  });
  return { ok: true as const };
}

export async function adicionarEquipamento(
  user: SessionUser, diaryId: string,
  input: { name: string; quantity: number; identification?: string | null },
) {
  const r = await diarioEditavel(user, diaryId);
  if ('error' in r) return { error: r.error };
  if (!input.name.trim()) return { error: 'Informe o equipamento.' };

  await prisma.diaryEquipment.create({
    data: {
      diaryId,
      name: input.name.trim(),
      quantity: Math.max(1, input.quantity),
      identification: input.identification?.trim() || null,
    },
  });
  return { ok: true as const };
}

export async function removerEquipe(user: SessionUser, diaryId: string, id: string) {
  const r = await diarioEditavel(user, diaryId);
  if ('error' in r) return { error: r.error };
  await prisma.diaryWorkforce.deleteMany({ where: { id, diaryId } });
  return { ok: true as const };
}

export async function removerEquipamento(user: SessionUser, diaryId: string, id: string) {
  const r = await diarioEditavel(user, diaryId);
  if ('error' in r) return { error: r.error };
  await prisma.diaryEquipment.deleteMany({ where: { id, diaryId } });
  return { ok: true as const };
}

/**
 * Copia equipe e equipamentos do último diário anterior.
 *
 * A equipe de hoje quase sempre é a de ontem — redigitar quatro funções
 * todo dia é o tipo de atrito que faz o diário ser abandonado.
 */
export async function repetirDiaAnterior(user: SessionUser, diaryId: string) {
  const r = await diarioEditavel(user, diaryId);
  if ('error' in r) return { error: r.error };

  const atual = await prisma.constructionDiary.findUniqueOrThrow({
    where: { id: diaryId },
    select: { projectId: true, diaryDate: true },
  });
  const anterior = await prisma.constructionDiary.findFirst({
    where: {
      projectId: atual.projectId,
      diaryDate: { lt: atual.diaryDate },
      deletedAt: null,
    },
    orderBy: { diaryDate: 'desc' },
    include: { workforce: true, equipment: true },
  });
  if (!anterior) return { error: 'Não há diário anterior nesta obra.' };
  if (anterior.workforce.length === 0 && anterior.equipment.length === 0) {
    return { error: 'O diário anterior não tem equipe nem equipamentos.' };
  }

  await prisma.$transaction([
    // substitui em vez de somar: repetir duas vezes não pode duplicar
    prisma.diaryWorkforce.deleteMany({ where: { diaryId } }),
    prisma.diaryEquipment.deleteMany({ where: { diaryId } }),
    ...(anterior.workforce.length
      ? [prisma.diaryWorkforce.createMany({
          data: anterior.workforce.map((w) => ({
            diaryId, role: w.role, company: w.company,
            quantity: w.quantity, startTime: w.startTime, endTime: w.endTime,
          })),
        })]
      : []),
    ...(anterior.equipment.length
      ? [prisma.diaryEquipment.createMany({
          data: anterior.equipment.map((e) => ({
            diaryId, name: e.name, identification: e.identification,
            quantity: e.quantity, company: e.company,
          })),
        })]
      : []),
  ]);
  return {
    ok: true as const,
    copiados: anterior.workforce.length + anterior.equipment.length,
  };
}

// ---------- Fechamento ----------

/** Monta a narrativa do dia a partir dos registros — revisável antes de fechar. */
function montarNarrativa(d: {
  workforce: Array<{ role: string; quantity: number }>;
  entries: Array<{ kind: string; title: string; payload: unknown }>;
  weather: unknown;
  openedAt: Date;
  fotos?: number;
}): string {
  const partes: string[] = [];

  if (d.workforce.length > 0) {
    const equipe = d.workforce
      .map((w) => `${w.quantity} ${w.role.toLowerCase()}`)
      .join(', ');
    const hora = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Cuiaba',
    }).format(d.openedAt);
    partes.push(`Os serviços foram registrados a partir das ${hora}, com equipe composta por ${equipe}.`);
  }

  const atividades = d.entries.filter((e) => e.kind === 'ATIVIDADE');
  if (atividades.length > 0) {
    const lista = atividades.map((a) => {
      const p = a.payload as { quantidade?: string; unidade?: string } | null;
      const qtd = p?.quantidade ? ` (${p.quantidade}${p.unidade ? ` ${p.unidade}` : ''})` : '';
      return `${a.title}${qtd}`;
    }).join('; ');
    partes.push(`Atividades executadas: ${lista}.`);
  }

  const impedimentos = d.entries.filter((e) => e.kind === 'IMPEDIMENTO');
  for (const imp of impedimentos) {
    partes.push(`Foi registrado impedimento: ${imp.title}.`);
  }
  const ocorrencias = d.entries.filter((e) => e.kind === 'OCORRENCIA');
  for (const oc of ocorrencias) {
    partes.push(`Ocorrência registrada: ${oc.title}.`);
  }

  if (d.fotos && d.fotos > 0) {
    partes.push(`Foram registradas ${d.fotos} fotografia(s) das atividades desenvolvidas.`);
  }

  const clima = d.weather as { rotulo?: string } | null;
  if (clima?.rotulo) {
    partes.push(`Condições climáticas: ${clima.rotulo.toLowerCase()}.`);
  }

  return partes.join('\n\n');
}

/** Resumo e pendências — a tela de conferência antes de fechar. */
export async function conferirParaFechar(user: SessionUser, diaryId: string) {
  const diario = await getDiario(user, diaryId);
  if (!diario) return null;

  const [fotos, fotosSemCategoria] = await Promise.all([
    prisma.sitePhoto.count({ where: { diaryId, deletedAt: null } }),
    prisma.sitePhoto.count({ where: { diaryId, deletedAt: null, category: null } }),
  ]);

  const resumo: ResumoParaFechar = {
    atividades: diario.entries.filter((e) => e.kind === 'ATIVIDADE').length,
    equipes: diario.workforce.length,
    equipamentos: diario.equipment.length,
    fotos,
    fotosSemCategoria,
    ocorrenciasSemResponsavel: diario.entries
      .filter((e) => e.kind === 'OCORRENCIA' && !e.responsible).length,
    impedimentosAbertos: diario.entries
      .filter((e) => e.kind === 'IMPEDIMENTO' && e.status === 'ABERTA').length,
  };

  return {
    resumo,
    pendencias: pendenciasDoFechamento(resumo),
    narrativa: diario.narrative ?? montarNarrativa({ ...diario, fotos }),
  };
}

export async function finalizarDiario(
  user: SessionUser, diaryId: string,
  input: { narrativa?: string | null; avisosIgnorados?: string[] },
) {
  const r = await diarioEditavel(user, diaryId);
  if ('error' in r) return { error: r.error };

  await prisma.constructionDiary.update({
    where: { id: diaryId },
    data: {
      status: 'FINALIZADO',
      closedAt: new Date(),
      closedById: user.id,
      narrative: input.narrativa?.trim() || null,
      ignoredWarnings: input.avisosIgnorados?.length
        ? (input.avisosIgnorados as Prisma.InputJsonValue)
        : undefined,
    },
  });

  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'update',
    entityType: 'construction_diary', entityId: diaryId,
    after: {
      diario: r.diario.code, situacao: 'finalizado',
      avisosIgnorados: input.avisosIgnorados ?? [],
    },
  });
  return { ok: true as const };
}
