import 'server-only';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import {
  createBudget, getApprovalRules, saveCurrentVersion, submitBudget,
} from '@/server/services/budgets';
import { generateProposal } from '@/server/services/proposals';
import { searchClientOptions } from '@/server/services/clients';
import { getAiConfig } from '@/server/ai/client';
import { getPriceSuggestions } from '@/server/services/price-history';
import { buscarSemelhantes, type ConfigDeBusca } from '@/server/services/conhecimento-comercial';
import {
  RascunhoSchema, aplicarOperacoes, avisosComerciais, faltantesDoRascunho,
  resumoDoRascunho, totaisDoRascunho, type Operacao,
} from '@/lib/orcamento-rascunho';
import { extrairPorte, type ConsultaSemelhante } from '@/lib/ranking-comercial';
import { htmlToText, isHtml, textToHtml } from '@/lib/html-text';
import { formatBRL } from '@/lib/money';
import type { Prisma } from '@/generated/prisma/client';
import type { SessionUser } from '@/server/auth/session';

/**
 * Jarvis comercial: orçamentos e propostas por conversa.
 *
 * O princípio: IA interpreta, pesquisa, compara e redige; o CRM decide.
 * Nada aqui inventa preço — o valor vem do catálogo, do histórico ou da
 * pessoa, e cada um chega rotulado. O rascunho vive em AgentQuoteDraft até
 * a confirmação; aí vira Budget pelas MESMAS funções da tela de orçamento
 * (createBudget → saveCurrentVersion → submitBudget → generateProposal),
 * com as mesmas regras de aprovação interna e o mesmo PDF oficial.
 */

// ---------- Configuração ----------

export type ConfigIaOrcamentos = ConfigDeBusca & {
  permitirSugestaoPreco: boolean;
  permitirRascunho: boolean;
};

export async function configIaOrcamentos(companyId: string): Promise<ConfigIaOrcamentos> {
  const s = await prisma.systemSetting.findMany({
    where: { companyId, key: { startsWith: 'ai.quote.' } },
  });
  const get = <T,>(k: string, padrao: T): T => {
    const v = s.find((x) => x.key === `ai.quote.${k}`)?.value;
    return (v === undefined || v === null ? padrao : v) as T;
  };
  return {
    usarHistorico: get('usarHistorico', true),
    maxSimilares: Number(get('maxSimilares', 5)),
    somenteAprovadas: get('somenteAprovadas', false),
    considerarRecusadas: get('considerarRecusadas', true),
    permitirSugestaoPreco: get('permitirSugestaoPreco', true),
    permitirRascunho: get('permitirRascunho', true),
  };
}

/** Os parâmetros que o rascunho tem que respeitar — nunca inventados. */
export async function parametrosComerciais(companyId: string) {
  const [regras, s] = await Promise.all([
    getApprovalRules(companyId),
    prisma.systemSetting.findMany({
      where: {
        companyId,
        key: { in: ['proposal.defaultValidityDays', 'quote.paymentTermsDefault', 'quote.executionDeadlineDefault'] },
      },
    }),
  ]);
  const get = (k: string) => s.find((x) => x.key === k)?.value;
  const validadeDias = Number(get('proposal.defaultValidityDays') ?? 60) || 60;
  const pagamentoPadrao = typeof get('quote.paymentTermsDefault') === 'string' ? String(get('quote.paymentTermsDefault')).trim() : '';
  const prazoPadrao = typeof get('quote.executionDeadlineDefault') === 'string' ? String(get('quote.executionDeadlineDefault')).trim() : '';
  return {
    regras,
    validadeDias,
    pagamentoPadrao: pagamentoPadrao || null,
    prazoPadrao: prazoPadrao || null,
    limites: {
      descontoMaximoPercentual: Number(regras.maxDiscountPercent),
      margemMinimaPercentual: Number(regras.minMarginPercent),
      valorMaximoSemAprovacao: formatBRL(String(regras.maxValueWithoutApproval)),
    },
    observacao: 'Acima do desconto máximo, abaixo da margem mínima ou acima do valor limite, o orçamento entra em aprovação interna antes da proposta.',
  };
}

// ---------- Consultas ----------

export async function buscarCliente(user: SessionUser, termo: string) {
  const opcoes = await searchClientOptions(user, termo, 8);
  if (opcoes.length === 0) return { encontrados: [], dica: `Nenhum cliente com "${termo}". Cadastre em Clientes ou confira a grafia.` };
  const detalhes = await prisma.client.findMany({
    where: { id: { in: opcoes.map((o) => o.id) } },
    select: {
      id: true, segment: true, city: true, state: true, personType: true,
      _count: { select: { budgets: { where: { deletedAt: null } } } },
    },
  });
  return {
    encontrados: opcoes.map((o) => {
      const d = detalhes.find((x) => x.id === o.id);
      return {
        clienteId: o.id,
        nome: o.tradeName ?? o.legalName,
        razaoSocial: o.legalName,
        documento: o.document,
        tipo: d?.personType,
        segmento: d?.segment ?? null,
        local: o.city ? `${o.city}/${o.state ?? ''}` : null,
        contatos: o.contacts.map((c) => ({ contatoId: c.id, nome: c.name })),
        unidades: o.units.map((u) => ({ unidadeId: u.id, nome: u.name })),
        orcamentosAnteriores: d?._count.budgets ?? 0,
      };
    }),
  };
}

export async function catalogoDeServicos(user: SessionUser, termo?: string) {
  const [servicos, precos] = await Promise.all([
    prisma.serviceCatalog.findMany({
      where: {
        companyId: user.companyId, active: true, deletedAt: null,
        ...(termo?.trim()
          ? {
              OR: [
                { name: { contains: termo.trim(), mode: 'insensitive' } },
                { code: { contains: termo.trim(), mode: 'insensitive' } },
                { category: { contains: termo.trim(), mode: 'insensitive' } },
                { discipline: { contains: termo.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: 25,
    }),
    getPriceSuggestions(user).catch(() => []),
  ]);
  const texto = (v: string | null) => (v ? (isHtml(v) ? htmlToText(v) : v).slice(0, 1_200) : null);
  return {
    servicos: servicos.map((s) => {
      const h = precos.find((p) => p.serviceCatalogId === s.id);
      return {
        serviceCatalogId: s.id,
        codigo: s.code,
        nome: s.name,
        categoria: s.category,
        disciplina: s.discipline,
        unidade: s.unit,
        precoDeTabelaAtual: s.defaultPrice ? formatBRL(s.defaultPrice) : null,
        precoDeTabelaAtualNumero: s.defaultPrice ? Number(s.defaultPrice) : null,
        custoEstimado: s.estimatedCost ? Number(s.estimatedCost) : null,
        historicoPraticado: h
          ? { mediana: Number(h.sugerido), ultimo: Number(h.ultimo), menor: Number(h.menor), maior: Number(h.maior), amostras: h.amostras }
          : null,
        modeloDeEscopo: texto(s.scopeTemplate),
        modeloDePremissas: texto(s.premisesTemplate),
        modeloDeExclusoes: texto(s.exclusionsTemplate),
      };
    }),
    observacao: 'precoDeTabelaAtual é o FATO ATUAL do catálogo; historicoPraticado é REFERÊNCIA do que já se cobrou (mediana resiste a valor fora da curva). Serviço sem nenhum dos dois: não há base para recomendar preço.',
  };
}

export async function historicoDoCliente(user: SessionUser, clienteId: string) {
  const budgets = await prisma.budget.findMany({
    where: { companyId: user.companyId, clientId: clienteId, deletedAt: null },
    include: {
      currentVersion: {
        include: {
          items: { orderBy: { sortOrder: 'asc' }, select: { description: true, quantity: true, unit: true, unitPrice: true } },
          proposals: { where: { deletedAt: null }, select: { code: true, status: true, acceptedAt: true }, orderBy: { revision: 'desc' }, take: 1 },
        },
      },
      contracts: { where: { deletedAt: null }, select: { code: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 8,
  });
  return {
    orcamentos: budgets.map((b) => ({
      orcamento: b.code,
      data: b.createdAt.toISOString().slice(0, 10),
      status: b.status,
      servico: b.currentVersion?.serviceType ?? null,
      total: b.currentVersion ? formatBRL(b.currentVersion.total) : null,
      itens: b.currentVersion?.items.map((i) => `${i.description}: ${Number(i.quantity)} ${i.unit ?? 'un'} × ${formatBRL(i.unitPrice)}`) ?? [],
      prazo: b.currentVersion?.executionDeadline ?? null,
      pagamento: b.currentVersion?.paymentTerms ?? null,
      proposta: b.currentVersion?.proposals[0] ?? null,
      contrato: b.contracts[0]?.code ?? null,
    })),
  };
}

export async function propostasSemelhantes(
  user: SessionUser,
  consulta: { descricao: string; tipoDeServico?: string; segmento?: string; cidade?: string; estado?: string; area?: number; clienteId?: string; disciplinas?: string[] },
) {
  const config = await configIaOrcamentos(user.companyId);
  const porte = extrairPorte(consulta.descricao);
  const q: ConsultaSemelhante & { descricao: string } = {
    ...consulta,
    area: consulta.area ?? porte.area ?? null,
  };
  return buscarSemelhantes(user, q, config);
}

// ---------- Rascunho ----------

const ativoDaThread = (companyId: string, threadId: string) => ({
  companyId, threadId, status: 'EM_ELABORACAO',
});

type Fonte = { tipo: string; detalhe: string };

function paraSaida(draft: { id: string; versao: number; dados: unknown; budgetId: string | null; proposalId: string | null; status: string }, regras: Awaited<ReturnType<typeof getApprovalRules>>) {
  const r = RascunhoSchema.parse(draft.dados);
  return {
    rascunhoId: draft.id,
    versao: draft.versao,
    status: draft.status,
    resumo: resumoDoRascunho(r),
    totais: totaisDoRascunho(r),
    avisosComerciais: avisosComerciais(r, regras),
    faltantes: faltantesDoRascunho(r),
    rascunho: r,
    orcamentoId: draft.budgetId,
    propostaId: draft.proposalId,
  };
}

export async function rascunhoAtivo(user: SessionUser, threadId: string) {
  const draft = await prisma.agentQuoteDraft.findFirst({
    where: ativoDaThread(user.companyId, threadId),
    orderBy: { updatedAt: 'desc' },
  });
  if (!draft) return null;
  return paraSaida(draft, await getApprovalRules(user.companyId));
}

/**
 * Cria o rascunho a partir do que o modelo extraiu. Cliente e itens são
 * obrigatórios (schema); prazo, pagamento e validade caem nos padrões
 * configurados quando não vierem — e o resultado diz o que foi assumido.
 */
export async function criarRascunho(
  user: SessionUser, threadId: string, dadosBrutos: unknown, meta: { modelo?: string | null; fontes?: Fonte[] } = {},
) {
  if (!user.permissions.has('budget:write')) return { error: 'Sem permissão para criar orçamentos.' };
  const config = await configIaOrcamentos(user.companyId);
  if (!config.permitirRascunho) return { error: 'A criação de rascunhos pela IA está desativada em Configurações → IA → Orçamentos.' };

  const parsed = RascunhoSchema.safeParse(dadosBrutos);
  if (!parsed.success) return { error: `Rascunho inválido: ${parsed.error.issues[0]?.path.join('.')} — ${parsed.error.issues[0]?.message}.` };
  const r = parsed.data;

  const cliente = await prisma.client.findFirst({
    where: { id: r.clienteId, companyId: user.companyId, deletedAt: null },
    select: { id: true, legalName: true, tradeName: true },
  });
  if (!cliente) return { error: 'Cliente não encontrado — use buscar_cliente antes de criar o rascunho.' };
  r.clienteNome = cliente.tradeName ?? cliente.legalName;

  // recomendáveis: padrão quando existe, e fica registrado que foi assumido
  const params = await parametrosComerciais(user.companyId);
  const assumidos: string[] = [];
  if (!r.prazoExecucao && params.prazoPadrao) { r.prazoExecucao = params.prazoPadrao; assumidos.push(`prazo padrão (${params.prazoPadrao})`); }
  if (!r.formaPagamento && params.pagamentoPadrao) { r.formaPagamento = params.pagamentoPadrao; assumidos.push(`pagamento padrão (${params.pagamentoPadrao})`); }
  if (!dadosBrutos || typeof dadosBrutos !== 'object' || !('validadeDias' in dadosBrutos)) { r.validadeDias = params.validadeDias; assumidos.push(`validade padrão (${params.validadeDias} dias)`); }
  for (const a of assumidos) r.referencias.push({ tipo: 'parametro_padrao', descricao: a });

  // um rascunho ativo por conversa: o anterior é substituído, não duplicado
  await prisma.agentQuoteDraft.updateMany({
    where: ativoDaThread(user.companyId, threadId), data: { status: 'CANCELADO' },
  });
  const modelo = meta.modelo ?? (await getAiConfig(user.companyId).then((c) => c.model).catch(() => null));
  const draft = await prisma.agentQuoteDraft.create({
    data: {
      companyId: user.companyId, threadId, userId: user.id,
      dados: r as unknown as Prisma.InputJsonValue,
      modelo,
      fontes: (meta.fontes ?? []) as unknown as Prisma.InputJsonValue,
      alteracoes: [{ em: new Date().toISOString(), o: 'rascunho criado' }] as unknown as Prisma.InputJsonValue,
    },
  });

  return { ok: true as const, assumidos, ...paraSaida(draft, params.regras) };
}

export async function atualizarRascunho(user: SessionUser, threadId: string, operacoes: Operacao[]) {
  const draft = await prisma.agentQuoteDraft.findFirst({
    where: ativoDaThread(user.companyId, threadId), orderBy: { updatedAt: 'desc' },
  });
  if (!draft) return { error: 'Não há rascunho em elaboração nesta conversa. Crie um primeiro.' };
  if (draft.userId !== user.id) return { error: 'Este rascunho é de outro usuário.' };

  const atual = RascunhoSchema.parse(draft.dados);
  const r = aplicarOperacoes(atual, operacoes);
  if ('error' in r) return { error: r.error };

  const log = ((draft.alteracoes as unknown as Array<{ em: string; o: string }>) ?? []).slice(-40);
  for (const a of r.alteracoes) log.push({ em: new Date().toISOString(), o: a });

  const salvo = await prisma.agentQuoteDraft.update({
    where: { id: draft.id },
    data: {
      dados: r.rascunho as unknown as Prisma.InputJsonValue,
      versao: { increment: 1 },
      alteracoes: log as unknown as Prisma.InputJsonValue,
    },
  });
  return { ok: true as const, alteracoes: r.alteracoes, ...paraSaida(salvo, await getApprovalRules(user.companyId)) };
}

export async function cancelarRascunho(user: SessionUser, threadId: string) {
  const r = await prisma.agentQuoteDraft.updateMany({
    where: { ...ativoDaThread(user.companyId, threadId), userId: user.id },
    data: { status: 'CANCELADO' },
  });
  return { ok: true as const, cancelados: r.count };
}

// ---------- Geração oficial ----------

/**
 * O rascunho vira orçamento e proposta pelo caminho oficial. Chamado só
 * pela confirmação (AgentAction) — nunca pelo modelo.
 *
 * Se as regras comerciais mandarem para aprovação interna, o orçamento
 * fica criado e aguardando (como na tela); a proposta sai depois que a
 * diretoria aprovar, pelo próprio módulo.
 */
export async function gerarPropostaDoRascunho(user: SessionUser, draftId: string) {
  if (!user.permissions.has('budget:write') || !user.permissions.has('proposal:write')) {
    return { error: 'Sem permissão para gerar propostas.' };
  }
  const draft = await prisma.agentQuoteDraft.findFirst({
    where: { id: draftId, companyId: user.companyId, userId: user.id },
  });
  if (!draft) return { error: 'Rascunho não encontrado.' };
  if (draft.status !== 'EM_ELABORACAO') return { error: 'Este rascunho já foi gerado ou cancelado.' };

  const r = RascunhoSchema.parse(draft.dados);
  const faltantes = faltantesDoRascunho(r);
  if (faltantes.obrigatorios.length > 0) {
    return { error: `Falta preencher: ${faltantes.obrigatorios.join(', ')}.` };
  }

  const criado = await createBudget(user, { clientId: r.clienteId, clientUnitId: r.unidadeId ?? null });
  if ('error' in criado) return { error: criado.error };
  const budgetId = criado.budget.id;

  const salvo = await saveCurrentVersion(user, budgetId, {
    validUntil: new Date(Date.now() + r.validadeDias * 86_400_000),
    serviceType: r.tipoDeServico ?? r.itens[0].descricao,
    scope: textToHtml(r.escopo),
    premises: r.premissas ? textToHtml(r.premissas) : null,
    exclusions: r.exclusoes ? textToHtml(r.exclusoes) : null,
    executionDeadline: r.prazoExecucao || null,
    paymentTerms: r.formaPagamento || null,
    internalNotes: [r.observacoes, `Gerado pelo Jarvis (rascunho ${draft.id}).`].filter(Boolean).join('\n'),
    contactId: r.contatoId ?? null,
    discount: r.descontoReais.toFixed(2),
    surcharge: r.acrescimoReais.toFixed(2),
    taxes: '0',
    estimatedRetentions: '0',
    items: r.itens.map((i) => ({
      serviceCatalogId: i.serviceCatalogId ?? null,
      description: i.descricao,
      discipline: i.disciplina ?? null,
      itemType: 'serviço',
      unit: i.unidade ?? 'vb',
      quantity: String(i.quantidade),
      unitPrice: i.precoUnitario.toFixed(2),
      unitCost: (i.custoUnitario ?? 0).toFixed(2),
      discount: '0',
    })),
  });
  if ('error' in salvo) return { error: salvo.error ?? 'Falha ao gravar o orçamento.' };

  await prisma.budget.update({ where: { id: budgetId }, data: { aiDraftId: draft.id } });

  const submetido = await submitBudget(user, budgetId);
  if ('error' in submetido) return { error: submetido.error ?? 'Falha ao submeter.' };

  let proposta: { code: string; attachmentId: string; fileName: string } | null = null;
  if (submetido.status === 'APROVADO') {
    const gerada = await generateProposal(user, budgetId);
    if ('error' in gerada) return { error: gerada.error ?? 'Falha ao gerar a proposta.' };
    proposta = { code: gerada.code, attachmentId: gerada.attachmentId, fileName: gerada.fileName };
  }

  await prisma.agentQuoteDraft.update({
    where: { id: draft.id },
    data: { status: 'GERADO', budgetId, proposalId: proposta ? (await prisma.proposal.findFirst({ where: { code: proposta.code.split(' ')[0], companyId: user.companyId }, select: { id: true } }))?.id ?? null : null },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'ai_quote_generated',
    entityType: 'budget', entityId: budgetId,
    after: {
      rascunho: draft.id, modelo: draft.modelo, versaoDoRascunho: draft.versao,
      referencias: r.referencias.map((x) => `${x.tipo}${x.codigo ? ` ${x.codigo}` : ''}: ${x.descricao}`),
      status: submetido.status, proposta: proposta?.code ?? null, origem: 'jarvis — confirmado pelo usuário',
    },
  });

  return {
    ok: true as const,
    orcamento: { id: budgetId, code: criado.budget.code },
    status: submetido.status,
    gatilhos: submetido.triggers,
    proposta,
  };
}
