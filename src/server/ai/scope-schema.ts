/**
 * O JSON que a IA devolve, e como ele vira conteúdo de orçamento.
 *
 * Sem acesso a banco nem rede de propósito: é transformação de texto, e é
 * onde mora o risco de a proposta sair torta. Fica testável.
 */

export type StatusEscopo = 'pronto' | 'pronto_com_premissas' | 'requer_informacoes';
export type Impacto = 'baixo' | 'medio' | 'alto';

export type EscopoGerado = {
  status: StatusEscopo;
  tituloServico: string;
  resumoExecutivo: string;
  objetoProposta: string;
  contextoJustificativa: string;
  escopoDetalhado: Array<{ etapa: string; atividades: string[] }>;
  entregaveis: string[];
  premissas: string[];
  responsabilidadesContratante: string[];
  exclusoes: string[];
  normasReferencias: string[];
  responsabilidadeTecnica: string;
  prazo: { duracao: string; marcoInicial: string; observacoes: string };
  revisoes: string;
  beneficiosContratante: string[];
  informacoesConfirmadas: string[];
  informacoesInferidas: string[];
  pontosAConfirmar: string[];
  riscosOrcamentarios: Array<{ item: string; impacto: Impacto; justificativa: string }>;
  servicosOpcionais: Array<{ servico: string; motivo: string }>;
  perguntasNecessarias: string[];
  resumoWhatsapp: string;
  observacoesInternas: string[];
};

/** O que efetivamente vai para os campos do orçamento. */
export type GeneratedScope = {
  scope: string;
  premises: string;
  exclusions: string;
  executionDeadline: string;
  items: Array<{ description: string; unit: string; quantity: string; unitPrice?: string }>;
  /** A parte que não vai para o cliente: dúvidas, riscos e oportunidades. */
  analise: AnaliseComercial;
};

export type AnaliseComercial = {
  status: StatusEscopo;
  titulo: string;
  resumoExecutivo: string;
  perguntas: string[];
  pontosAConfirmar: string[];
  informacoesInferidas: string[];
  riscos: Array<{ item: string; impacto: Impacto; justificativa: string }>;
  servicosOpcionais: Array<{ servico: string; motivo: string }>;
  beneficios: string[];
  resumoWhatsapp: string;
  observacoesInternas: string[];
};

// ---------- Leitura defensiva ----------

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function lista(v: unknown, max = 40): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(texto).filter((s) => s !== '').slice(0, max);
}

const IMPACTOS: Impacto[] = ['baixo', 'medio', 'alto'];
const STATUS: StatusEscopo[] = ['pronto', 'pronto_com_premissas', 'requer_informacoes'];

/**
 * Interpreta a resposta bruta do modelo.
 *
 * Aceita o JSON dentro de bloco markdown porque, apesar da instrução, alguns
 * modelos ainda o embrulham — e perder a geração inteira por três crases
 * seria desperdício.
 */
export function parseEscopo(raw: string): EscopoGerado {
  const limpo = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();
  const j = JSON.parse(limpo) as Record<string, unknown>;

  const prazo = (j.prazo ?? {}) as Record<string, unknown>;
  const status = texto(j.status) as StatusEscopo;

  return {
    status: STATUS.includes(status) ? status : 'pronto_com_premissas',
    tituloServico: texto(j.titulo_servico),
    resumoExecutivo: texto(j.resumo_executivo),
    objetoProposta: texto(j.objeto_proposta),
    contextoJustificativa: texto(j.contexto_justificativa),
    escopoDetalhado: Array.isArray(j.escopo_detalhado)
      ? (j.escopo_detalhado as Record<string, unknown>[])
          .slice(0, 15)
          .map((e) => ({ etapa: texto(e?.etapa), atividades: lista(e?.atividades, 25) }))
          .filter((e) => e.etapa !== '' || e.atividades.length > 0)
      : [],
    entregaveis: lista(j.entregaveis),
    premissas: lista(j.premissas),
    responsabilidadesContratante: lista(j.responsabilidades_contratante),
    exclusoes: lista(j.exclusoes),
    normasReferencias: lista(j.normas_referencias),
    responsabilidadeTecnica: texto(j.responsabilidade_tecnica),
    prazo: {
      duracao: texto(prazo.duracao),
      marcoInicial: texto(prazo.marco_inicial),
      observacoes: texto(prazo.observacoes),
    },
    revisoes: texto(j.revisoes),
    beneficiosContratante: lista(j.beneficios_contratante),
    informacoesConfirmadas: lista(j.informacoes_confirmadas),
    informacoesInferidas: lista(j.informacoes_inferidas),
    pontosAConfirmar: lista(j.pontos_a_confirmar),
    riscosOrcamentarios: Array.isArray(j.riscos_orcamentarios)
      ? (j.riscos_orcamentarios as Record<string, unknown>[])
          .slice(0, 15)
          .map((r) => {
            const imp = texto(r?.impacto) as Impacto;
            return {
              item: texto(r?.item),
              impacto: IMPACTOS.includes(imp) ? imp : 'medio',
              justificativa: texto(r?.justificativa),
            };
          })
          .filter((r) => r.item !== '')
      : [],
    servicosOpcionais: Array.isArray(j.servicos_opcionais)
      ? (j.servicos_opcionais as Record<string, unknown>[])
          .slice(0, 10)
          .map((s) => ({ servico: texto(s?.servico), motivo: texto(s?.motivo) }))
          .filter((s) => s.servico !== '')
      : [],
    // o prompt limita a cinco; o corte aqui garante mesmo se o modelo exagerar
    perguntasNecessarias: lista(j.perguntas_necessarias, 5),
    resumoWhatsapp: texto(j.resumo_whatsapp),
    observacoesInternas: lista(j.observacoes_internas),
  };
}

// ---------- Tradução para os campos do orçamento ----------

/** Bloco de texto com título, só quando houver conteúdo. */
function bloco(titulo: string, linhas: string[]): string | null {
  const cheias = linhas.filter((l) => l.trim() !== '');
  if (cheias.length === 0) return null;
  return `**${titulo}**\n${cheias.join('\n')}`;
}

function comHifen(itens: string[]): string[] {
  // o editor do orçamento espera uma linha por item, começando com "- "
  return itens.map((i) => (i.startsWith('- ') ? i : `- ${i}`));
}

/**
 * Monta o campo "Escopo dos serviços".
 *
 * Objeto e contexto vêm como parágrafo; as etapas viram subtítulo com as
 * atividades embaixo; os entregáveis fecham o bloco. É a ordem em que o
 * cliente lê a proposta.
 */
export function montarEscopo(g: EscopoGerado): string {
  const partes: Array<string | null> = [
    g.objetoProposta || null,
    g.contextoJustificativa || null,
    ...g.escopoDetalhado.map((e) => bloco(e.etapa || 'Escopo', comHifen(e.atividades))),
    bloco('Entregáveis', comHifen(g.entregaveis)),
    // normas e ART fecham o escopo: é onde o cliente procura o respaldo
    bloco('Normas e referências técnicas', comHifen(g.normasReferencias)),
    g.responsabilidadeTecnica
      ? bloco('Responsabilidade técnica', [g.responsabilidadeTecnica])
      : null,
  ];
  return partes.filter((p): p is string => Boolean(p)).join('\n\n');
}

/** Premissas do orçamento mais o que cabe ao contratante fazer. */
export function montarPremissas(g: EscopoGerado): string {
  const partes: Array<string | null> = [
    comHifen(g.premissas).join('\n') || null,
    bloco('Responsabilidades do contratante', comHifen(g.responsabilidadesContratante)),
    g.revisoes ? bloco('Revisões', [`- ${g.revisoes}`]) : null,
  ];
  return partes.filter((p): p is string => Boolean(p)).join('\n\n');
}

/**
 * Prazo em uma linha, com o marco inicial junto.
 *
 * O marco é o que evita a discussão depois: "30 dias" a partir de quando.
 */
export function montarPrazo(g: EscopoGerado): string {
  const { duracao, marcoInicial, observacoes } = g.prazo;
  if (!duracao && !marcoInicial && !observacoes) return '';
  const partes = [duracao];
  if (marcoInicial) partes.push(`contados a partir de: ${marcoInicial}`);
  if (observacoes) partes.push(observacoes);
  return partes.filter((p) => p.trim() !== '').join(' — ');
}

/**
 * Itens faturáveis a partir das etapas do escopo.
 *
 * O JSON não traz preço nem quantidade de propósito — quem precifica é a
 * equipe comercial. Cada etapa vira uma linha em verba, para o orçamento já
 * nascer com a estrutura do serviço.
 */
export function montarItens(g: EscopoGerado): GeneratedScope['items'] {
  return g.escopoDetalhado
    .map((e) => e.etapa.trim())
    .filter((e) => e !== '')
    .map((description) => ({ description, unit: 'vb', quantity: '1' }));
}

export function extrairAnalise(g: EscopoGerado): AnaliseComercial {
  return {
    status: g.status,
    titulo: g.tituloServico,
    resumoExecutivo: g.resumoExecutivo,
    perguntas: g.perguntasNecessarias,
    pontosAConfirmar: g.pontosAConfirmar,
    informacoesInferidas: g.informacoesInferidas,
    riscos: g.riscosOrcamentarios,
    servicosOpcionais: g.servicosOpcionais,
    beneficios: g.beneficiosContratante,
    resumoWhatsapp: g.resumoWhatsapp,
    observacoesInternas: g.observacoesInternas,
  };
}

/** Converte a resposta da IA no que o editor de orçamento consome. */
export function paraOrcamento(g: EscopoGerado): GeneratedScope {
  return {
    scope: montarEscopo(g),
    premises: montarPremissas(g),
    exclusions: comHifen(g.exclusoes).join('\n'),
    executionDeadline: montarPrazo(g),
    items: montarItens(g),
    analise: extrairAnalise(g),
  };
}
