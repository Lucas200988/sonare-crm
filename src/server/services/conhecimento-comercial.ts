import 'server-only';
import { createHash } from 'node:crypto';
import { prisma } from '@/server/db';
import { getAiConfig, gerarEmbedding } from '@/server/ai/client';
import { htmlToText, isHtml } from '@/lib/html-text';
import {
  extrairPorte, ranquear, type CandidataSemelhante, type ConsultaSemelhante,
} from '@/lib/ranking-comercial';
import { formatBRL } from '@/lib/money';
import type { SessionUser } from '@/server/auth/session';

/**
 * Base de conhecimento comercial — o que a SONARE já orçou, pesquisável.
 *
 * Uma linha por orçamento (QuoteKnowledge): campos estruturados para
 * filtro e ranking, um texto-representação e o embedding (pgvector). É
 * REFERÊNCIA HISTÓRICA, nunca fato atual: preço de 2024 é o que se cobrou
 * em 2024. O preço atual está no catálogo — quem consome sabe distinguir
 * porque cada resultado vem com data e desfecho.
 *
 * Este módulo não importa budgets/proposals (que o chamam ao gravar) —
 * evita ciclo de import.
 */

const texto = (v: string | null | undefined) => (v ? (isHtml(v) ? htmlToText(v) : v).replace(/\*\*/g, '').trim() : '');

/** Monta a representação indexável de um orçamento a partir do banco. */
async function representacao(companyId: string, budgetId: string) {
  const b = await prisma.budget.findFirst({
    where: { id: budgetId, companyId, deletedAt: null },
    include: {
      client: { select: { id: true, legalName: true, tradeName: true, segment: true, city: true, state: true } },
      currentVersion: {
        include: {
          items: { orderBy: { sortOrder: 'asc' } },
          proposals: { where: { deletedAt: null }, orderBy: { revision: 'desc' }, take: 1 },
        },
      },
      contracts: { where: { deletedAt: null }, select: { id: true }, take: 1 },
    },
  });
  if (!b || !b.currentVersion) return null;
  const v = b.currentVersion;
  const proposta = v.proposals[0] ?? null;

  const disciplinas = [...new Set(v.items.map((i) => i.discipline).filter((d): d is string => Boolean(d)))];
  const itens = v.items.map((i) => `${i.description} — ${Number(i.quantity)} ${i.unit ?? 'un'} × ${formatBRL(i.unitPrice)}`);
  const escopo = texto(v.scope);
  const porte = extrairPorte(`${v.serviceType ?? ''} ${escopo} ${itens.join(' ')}`);

  const corpo = [
    `Serviço: ${v.serviceType ?? 'não informado'}`,
    `Cliente: ${b.client.tradeName ?? b.client.legalName}${b.client.segment ? ` (${b.client.segment})` : ''}`,
    b.client.city ? `Local: ${b.client.city}/${b.client.state ?? ''}` : '',
    `Itens: ${itens.join('; ')}`,
    escopo ? `Escopo: ${escopo.slice(0, 3_000)}` : '',
    `Total: ${formatBRL(v.total)}`,
  ].filter(Boolean).join('\n');

  return {
    budget: b, versao: v, proposta,
    dados: {
      companyId,
      budgetId: b.id,
      budgetVersionId: v.id,
      proposalId: proposta?.id ?? null,
      budgetCode: b.code,
      proposalCode: proposta?.code ?? null,
      clientId: b.client.id,
      clientName: b.client.tradeName ?? b.client.legalName,
      segment: b.client.segment,
      city: b.client.city,
      state: b.client.state,
      serviceType: v.serviceType,
      disciplines: disciplinas,
      area: porte.area ?? null,
      itemsSummary: itens.join('; ').slice(0, 2_000),
      texto: corpo,
      total: v.total,
      budgetStatus: b.status,
      proposalStatus: proposta?.status ?? null,
      aprovada: proposta?.status === 'ACEITA' || b.contracts.length > 0,
      recusada: proposta?.status === 'RECUSADA' || b.status === 'RECUSADO',
      convertida: b.contracts.length > 0,
      issuedAt: proposta?.lastEmittedAt ?? proposta?.createdAt ?? v.createdAt,
      contentHash: createHash('sha256').update(corpo + (proposta?.status ?? '') + b.status + b.contracts.length).digest('hex'),
    },
  };
}

/**
 * Indexa (ou reindexa) um orçamento. Chamado pelos serviços do módulo ao
 * gravar/aprovar/recusar/converter — sempre em modo "melhor esforço": a
 * base de conhecimento nunca derruba a operação que a alimenta.
 *
 * Hash igual = nada a fazer (nem novo embedding). Só reembeda quando o
 * texto mudou; mudança só de status atualiza os campos e mantém o vetor.
 */
export async function indexarOrcamento(companyId: string, budgetId: string): Promise<void> {
  try {
    const r = await representacao(companyId, budgetId);
    if (!r) return;
    const { dados } = r;

    const atual = await prisma.quoteKnowledge.findUnique({
      where: { budgetId }, select: { id: true, contentHash: true, texto: true, embeddedAt: true },
    });
    if (atual && atual.contentHash === dados.contentHash) return;

    const linha = atual
      ? await prisma.quoteKnowledge.update({ where: { budgetId }, data: dados })
      : await prisma.quoteKnowledge.create({ data: dados });

    const textoMudou = !atual || atual.texto !== dados.texto || !atual.embeddedAt;
    if (!textoMudou) return;

    const config = await getAiConfig(companyId);
    if (!config.enabled) return;
    const vetor = await gerarEmbedding(config, dados.texto, { companyId, useCase: 'embedding' });
    if (!vetor) return;
    await prisma.$executeRawUnsafe(
      'UPDATE "QuoteKnowledge" SET "embedding" = $1::vector, "embeddedAt" = NOW() WHERE "id" = $2',
      `[${vetor.join(',')}]`, linha.id,
    );
  } catch (e) {
    console.error('[conhecimento] indexação falhou:', e instanceof Error ? e.message : e);
  }
}

/** Dispara a indexação sem esperar — para os serviços de escrita. */
export function indexarEmSegundoPlano(companyId: string, budgetId: string): void {
  void indexarOrcamento(companyId, budgetId);
}

/** Reindexa todos os orçamentos da empresa (botão em Configurações). */
export async function reindexarTudo(user: SessionUser) {
  const budgets = await prisma.budget.findMany({
    where: { companyId: user.companyId, deletedAt: null },
    select: { id: true },
  });
  for (const b of budgets) await indexarOrcamento(user.companyId, b.id);
  const [total, comEmbedding] = await Promise.all([
    prisma.quoteKnowledge.count({ where: { companyId: user.companyId } }),
    prisma.quoteKnowledge.count({ where: { companyId: user.companyId, embeddedAt: { not: null } } }),
  ]);
  return { orcamentos: budgets.length, indexados: total, comEmbedding };
}

export async function situacaoDaBase(companyId: string) {
  const [total, comEmbedding, orcamentos] = await Promise.all([
    prisma.quoteKnowledge.count({ where: { companyId } }),
    prisma.quoteKnowledge.count({ where: { companyId, embeddedAt: { not: null } } }),
    prisma.budget.count({ where: { companyId, deletedAt: null } }),
  ]);
  return { orcamentos, indexados: total, comEmbedding };
}

// ---------- Busca ----------

export type ConfigDeBusca = {
  usarHistorico: boolean;
  maxSimilares: number;
  somenteAprovadas: boolean;
  considerarRecusadas: boolean;
};

export type PropostaSemelhante = {
  orcamento: string;
  proposta: string | null;
  cliente: string;
  data: string | null;
  servico: string | null;
  disciplinas: string[];
  local: string | null;
  area: number | null;
  itens: string;
  total: string;
  desfecho: 'convertida em contrato' | 'aceita' | 'recusada' | 'sem desfecho';
  similaridade: number;
  observacao: string;
};

/**
 * Propostas semelhantes: filtro estrutural + semântica (pgvector, quando há
 * embedding) + ranking híbrido (src/lib/ranking-comercial.ts).
 */
export async function buscarSemelhantes(
  user: SessionUser, consulta: ConsultaSemelhante & { descricao: string }, config: ConfigDeBusca,
): Promise<{ resultados: PropostaSemelhante[]; metodologia: string }> {
  if (!config.usarHistorico) {
    return { resultados: [], metodologia: 'Uso do histórico desativado em Configurações → IA → Orçamentos.' };
  }

  const aiConfig = await getAiConfig(user.companyId);
  const vetor = aiConfig.enabled
    ? await gerarEmbedding(aiConfig, consulta.descricao, { companyId: user.companyId, userId: user.id, useCase: 'embedding' })
    : null;

  // candidatas: as N mais próximas no vetor (se houver) + todas as estruturais
  type Linha = {
    id: string; budgetCode: string; proposalCode: string | null; clientId: string; clientName: string;
    segment: string | null; city: string | null; state: string | null; serviceType: string | null;
    disciplines: string[]; area: number | null; itemsSummary: string; texto: string; total: string;
    aprovada: boolean; recusada: boolean; convertida: boolean; issuedAt: Date | null; semantica: number | null;
  };

  const filtroDesfecho = config.somenteAprovadas
    ? 'AND ("aprovada" = true OR "convertida" = true)'
    : config.considerarRecusadas ? '' : 'AND "recusada" = false';

  const linhas = vetor
    ? await prisma.$queryRawUnsafe<Linha[]>(
        `SELECT "id","budgetCode","proposalCode","clientId","clientName","segment","city","state","serviceType",
                "disciplines","area","itemsSummary","texto","total"::text AS "total","aprovada","recusada","convertida","issuedAt",
                CASE WHEN "embedding" IS NULL THEN NULL ELSE 1 - ("embedding" <=> $1::vector) END AS "semantica"
         FROM "QuoteKnowledge" WHERE "companyId" = $2 ${filtroDesfecho}
         ORDER BY "embedding" <=> $1::vector NULLS LAST LIMIT 40`,
        `[${vetor.join(',')}]`, user.companyId,
      )
    : (await prisma.quoteKnowledge.findMany({
        where: {
          companyId: user.companyId,
          ...(config.somenteAprovadas ? { OR: [{ aprovada: true }, { convertida: true }] } : {}),
          ...(!config.somenteAprovadas && !config.considerarRecusadas ? { recusada: false } : {}),
        },
        orderBy: { issuedAt: 'desc' },
        take: 200,
      })).map((l) => ({ ...l, total: l.total.toString(), semantica: null }));

  const candidatas: CandidataSemelhante[] = linhas.map((l) => ({
    id: l.id, serviceType: l.serviceType, disciplines: l.disciplines, segment: l.segment,
    city: l.city, state: l.state, area: l.area, clientId: l.clientId, issuedAt: l.issuedAt,
    aprovada: l.aprovada, convertida: l.convertida, recusada: l.recusada, texto: l.texto,
    semantica: l.semantica,
  }));
  const ranqueadas = ranquear(candidatas, consulta).slice(0, Math.max(1, Math.min(config.maxSimilares, 15)));

  const resultados: PropostaSemelhante[] = ranqueadas.map((r) => {
    const l = linhas.find((x) => x.id === r.id)!;
    const desfecho = l.convertida ? 'convertida em contrato' : l.aprovada ? 'aceita' : l.recusada ? 'recusada' : 'sem desfecho';
    const idade = l.issuedAt ? Math.round((Date.now() - l.issuedAt.getTime()) / (30.4375 * 86_400_000)) : null;
    return {
      orcamento: l.budgetCode,
      proposta: l.proposalCode,
      cliente: l.clientName,
      data: l.issuedAt ? l.issuedAt.toISOString().slice(0, 10) : null,
      servico: l.serviceType,
      disciplinas: l.disciplines,
      local: l.city ? `${l.city}/${l.state ?? ''}` : null,
      area: l.area,
      itens: l.itemsSummary.slice(0, 400),
      total: formatBRL(l.total),
      desfecho,
      similaridade: r.nota,
      observacao: [
        idade !== null && idade >= 12 ? `REFERÊNCIA HISTÓRICA de ${idade} meses atrás — preço da época, não o atual` : null,
        l.clientId === consulta.clienteId ? 'mesmo cliente' : null,
        r.componentes.estrutural >= 0.8 ? 'muito parecida em serviço/porte/região' : null,
      ].filter(Boolean).join('; '),
    };
  });

  return {
    resultados,
    metodologia: vetor
      ? 'nota = 0,40 semântica (embedding) + 0,30 estrutural (serviço, disciplina, segmento, região, porte, mesmo cliente) + 0,15 recência (decai em 3 anos) + 0,15 desfecho (convertida > aceita > sem desfecho > recusada)'
      : 'sem embedding disponível: nota = 0,20 termos + 0,50 estrutural + 0,15 recência + 0,15 desfecho',
  };
}
