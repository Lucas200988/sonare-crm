import { htmlToText } from './html-text';

/**
 * Assunto curto de um orçamento, para o cartão do pipeline.
 *
 * O cartão nasce com o título "Orçamento — Nome do Cliente", então dois
 * orçamentos do mesmo cliente ficam idênticos e só se distinguem abrindo um
 * a um. Aqui o assunto é deduzido do que já foi preenchido, sem pedir mais
 * digitação de ninguém.
 */

export type FonteResumo = {
  /** Campo "Tipo de serviço" da versão atual. */
  serviceType?: string | null;
  /** Descrição do primeiro item da planilha de preços. */
  primeiroItem?: string | null;
  /** Escopo dos serviços, como HTML do editor ou texto puro. */
  escopo?: string | null;
};

const LIMITE = 72;

/**
 * Corta no espaço anterior ao limite, para não terminar no meio da palavra.
 * "Projeto elétrico de subest…" é pior que "Projeto elétrico de…".
 */
function encurtar(texto: string): string {
  const limpo = texto.replace(/\s+/g, ' ').trim();
  if (limpo.length <= LIMITE) return limpo;
  const corte = limpo.slice(0, LIMITE);
  const espaco = corte.lastIndexOf(' ');
  return `${(espaco > LIMITE * 0.6 ? corte.slice(0, espaco) : corte).replace(/[,;:.\-–—]$/, '')}…`;
}

/** Primeira linha com conteúdo do escopo, sem marcador de lista. */
function primeiraLinha(escopo: string): string {
  const texto = /<[a-z]/i.test(escopo) ? htmlToText(escopo) : escopo;
  for (const linha of texto.split('\n')) {
    const t = linha.replace(/^[-•]\s*/, '').trim();
    if (t) return t;
  }
  return '';
}

/**
 * Ordem de preferência: o que o usuário escreveu de propósito para nomear o
 * serviço vem primeiro; o escopo é o último recurso, porque a primeira linha
 * dele costuma ser um parágrafo de contexto, não um título.
 */
export function resumirOrcamento(fonte: FonteResumo): string {
  const tipo = fonte.serviceType?.trim();
  if (tipo) return encurtar(tipo);

  const item = fonte.primeiroItem?.trim();
  if (item) return encurtar(item);

  const escopo = fonte.escopo?.trim();
  if (escopo) {
    const linha = primeiraLinha(escopo);
    if (linha) return encurtar(linha);
  }
  return '';
}
