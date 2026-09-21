/**
 * Ranking híbrido de propostas semelhantes — a base de conhecimento
 * comercial do Jarvis.
 *
 * Similaridade textual sozinha engana: uma proposta de 2023 para outro
 * segmento pode ter texto parecido e preço irrelevante. Cada candidata
 * recebe uma nota composta, com pesos explícitos:
 *
 *   nota = 0,40 · semântica      (embedding, quando existe)
 *        + 0,30 · estrutural     (serviço, disciplina, segmento, região, porte)
 *        + 0,15 · recência       (decai ao longo de 3 anos)
 *        + 0,15 · relevância     (aprovada/convertida sobe; recusada desce ou sai)
 *
 * Sem embedding (IA desligada, item ainda não indexado), a parte semântica
 * cai para uma comparação de termos e o peso é redistribuído. Puro e
 * testável: o serviço só entrega os candidatos e a consulta.
 */

export type ConsultaSemelhante = {
  tipoDeServico?: string | null;
  disciplinas?: string[];
  segmento?: string | null;
  cidade?: string | null;
  estado?: string | null;
  area?: number | null;
  clienteId?: string | null;
  descricao?: string | null;
};

export type CandidataSemelhante = {
  id: string;
  serviceType: string | null;
  disciplines: string[];
  segment: string | null;
  city: string | null;
  state: string | null;
  area: number | null;
  clientId: string;
  issuedAt: Date | null;
  aprovada: boolean;
  convertida: boolean;
  recusada: boolean;
  texto: string;
  /** Similaridade de cosseno do banco (0..1), quando houve busca vetorial. */
  semantica?: number | null;
};

export type Pesos = { semantica: number; estrutural: number; recencia: number; relevancia: number };
export const PESOS_PADRAO: Pesos = { semantica: 0.4, estrutural: 0.3, recencia: 0.15, relevancia: 0.15 };

const norm = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Termos de 4+ letras — bom o bastante para "projeto eletrico galpao 5000". */
function termos(s: string | null | undefined): Set<string> {
  return new Set(norm(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 4));
}

/** Jaccard sobre termos: o substituto da semântica quando não há embedding. */
export function similaridadeDeTermos(a: string | null | undefined, b: string | null | undefined): number {
  const ta = termos(a);
  const tb = termos(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let comuns = 0;
  for (const t of ta) if (tb.has(t)) comuns += 1;
  return comuns / (ta.size + tb.size - comuns);
}

/** Proximidade de porte: 5.000 m² vs 4.800 m² ≈ 0,96; vs 500 m² ≈ 0,1. */
export function proximidadeDePorte(a: number | null | undefined, b: number | null | undefined): number | null {
  if (!a || !b || a <= 0 || b <= 0) return null;
  const razao = Math.min(a, b) / Math.max(a, b);
  return razao;
}

export function notaEstrutural(c: CandidataSemelhante, q: ConsultaSemelhante): number {
  const partes: number[] = [];
  if (q.tipoDeServico) {
    const mesmo = norm(c.serviceType) === norm(q.tipoDeServico);
    const parecido = !mesmo && similaridadeDeTermos(c.serviceType, q.tipoDeServico) > 0;
    partes.push(mesmo ? 1 : parecido ? 0.5 : 0);
  }
  if (q.disciplinas && q.disciplinas.length > 0) {
    const dc = new Set(c.disciplines.map(norm));
    const comuns = q.disciplinas.map(norm).filter((d) => dc.has(d)).length;
    partes.push(comuns / q.disciplinas.length);
  }
  if (q.segmento) partes.push(norm(c.segment) === norm(q.segmento) ? 1 : 0);
  if (q.estado) {
    const mesmoEstado = norm(c.state) === norm(q.estado);
    const mesmaCidade = mesmoEstado && !!q.cidade && norm(c.city) === norm(q.cidade);
    partes.push(mesmaCidade ? 1 : mesmoEstado ? 0.6 : 0);
  } else if (q.cidade) {
    partes.push(norm(c.city) === norm(q.cidade) ? 1 : 0);
  }
  const porte = proximidadeDePorte(c.area, q.area);
  if (porte !== null) partes.push(porte);
  if (q.clienteId) partes.push(c.clientId === q.clienteId ? 1 : 0);
  if (partes.length === 0) return 0;
  return partes.reduce((a, b) => a + b, 0) / partes.length;
}

/** 1,0 hoje → ~0,5 em 18 meses → 0 aos 3 anos; sem data = 0. */
export function notaDeRecencia(issuedAt: Date | null, agora: Date = new Date()): number {
  if (!issuedAt) return 0;
  const meses = (agora.getTime() - issuedAt.getTime()) / (30.4375 * 86_400_000);
  if (meses <= 0) return 1;
  return Math.max(0, 1 - meses / 36);
}

export function notaDeRelevancia(c: CandidataSemelhante): number {
  if (c.convertida) return 1;
  if (c.aprovada) return 0.85;
  if (c.recusada) return 0.15;
  return 0.5; // enviada sem desfecho: referência de preço, sem validação
}

export type Ranqueada<T> = T & { nota: number; componentes: { semantica: number; estrutural: number; recencia: number; relevancia: number } };

export function ranquear<T extends CandidataSemelhante>(
  candidatas: T[], consulta: ConsultaSemelhante, pesos: Pesos = PESOS_PADRAO, agora: Date = new Date(),
): Ranqueada<T>[] {
  return candidatas
    .map((c) => {
      const temEmbedding = typeof c.semantica === 'number';
      const semantica = temEmbedding ? Math.max(0, c.semantica as number) : similaridadeDeTermos(c.texto, consulta.descricao);
      // sem vetor, a semântica por termos é fraca: parte do peso vai ao estrutural
      const p = temEmbedding ? pesos : { ...pesos, semantica: pesos.semantica * 0.5, estrutural: pesos.estrutural + pesos.semantica * 0.5 };
      const componentes = {
        semantica, estrutural: notaEstrutural(c, consulta),
        recencia: notaDeRecencia(c.issuedAt, agora), relevancia: notaDeRelevancia(c),
      };
      const nota = p.semantica * componentes.semantica + p.estrutural * componentes.estrutural
        + p.recencia * componentes.recencia + p.relevancia * componentes.relevancia;
      return { ...c, nota: Math.round(nota * 1000) / 1000, componentes };
    })
    .sort((a, b) => b.nota - a.nota);
}

/**
 * Extrai o porte (m², kWp, kVA, unidades) de um texto livre, para o filtro
 * estrutural. "galpão de 4.500 m²" → { area: 4500 }.
 */
export function extrairPorte(texto: string): { area?: number; potenciaKwp?: number; potenciaKva?: number } {
  const t = texto.replace(/\./g, '').replace(',', '.');
  const out: { area?: number; potenciaKwp?: number; potenciaKva?: number } = {};
  const area = t.match(/(\d+(?:\.\d+)?)\s*(?:m²|m2|metros? quadrados?|mil metros)/i);
  if (area) out.area = Number(area[1]) * (/mil metros/i.test(area[0]) ? 1000 : 1);
  const kwp = t.match(/(\d+(?:\.\d+)?)\s*kwp/i);
  if (kwp) out.potenciaKwp = Number(kwp[1]);
  const kva = t.match(/(\d+(?:\.\d+)?)\s*kva/i);
  if (kva) out.potenciaKva = Number(kva[1]);
  return out;
}
