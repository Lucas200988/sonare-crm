/**
 * Regras do documento RDO — prazos, papéis de assinatura e rótulos.
 *
 * Puras de propósito: é o que o PDF e a tela imprimem, e erro de contagem de
 * prazo em diário de obra vira discussão de aditivo. Fica testável.
 */

export type PrazosDaObra = {
  contratual: number | null;
  decorrido: number | null;
  aVencer: number | null;
};

/** Dias corridos entre duas datas de calendário (YYYY-MM-DD), fim − início. */
function diasEntre(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Date (ou null) → YYYY-MM-DD em UTC; datas de projeto são gravadas à meia-noite. */
export function dataCalendario(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/**
 * Prazos do cabeçalho do RDO, em contagem inclusiva: o dia do início é o
 * dia 1 — no primeiro relatório, "decorrido: 1" e não "0". É como fiscais
 * contam, e é o formato consagrado nos diários de obra.
 */
export function prazosDaObra(
  inicio: string | null,
  previsaoTermino: string | null,
  diaRelatorio: string,
): PrazosDaObra {
  const contratual = inicio && previsaoTermino && previsaoTermino >= inicio
    ? diasEntre(inicio, previsaoTermino) + 1
    : null;

  let decorrido: number | null = null;
  if (inicio && diaRelatorio >= inicio) {
    decorrido = diasEntre(inicio, diaRelatorio) + 1;
    if (contratual !== null && decorrido > contratual) decorrido = contratual;
  }

  const aVencer = contratual !== null && decorrido !== null
    ? Math.max(0, contratual - decorrido)
    : null;

  return { contratual, decorrido, aVencer };
}

/** "Segunda-Feira" para uma data de calendário, sem depender de fuso do servidor. */
export function diaDaSemana(diaryDate: string): string {
  const nome = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' })
    .format(new Date(`${diaryDate}T12:00:00Z`));
  // "segunda-feira" → "Segunda-Feira", "sábado" → "Sábado"
  return nome.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('-');
}

// ---------- Assinaturas ----------

export type PapelRdo = 'GERENCIA' | 'RESIDENTE' | 'FISCALIZACAO';

/** Os três papéis clássicos do documento, na ordem em que aparecem no rodapé. */
export const PAPEIS_RDO: Array<{ papel: PapelRdo; rotulo: string }> = [
  { papel: 'GERENCIA', rotulo: 'Gerência de Engenharia' },
  { papel: 'RESIDENTE', rotulo: 'Engenheiro(a) Residente' },
  { papel: 'FISCALIZACAO', rotulo: 'Fiscalização' },
];

export function rotuloDoPapel(papel: string): string {
  return PAPEIS_RDO.find((p) => p.papel === papel)?.rotulo ?? papel;
}

export function ehPapelRdo(v: string): v is PapelRdo {
  return PAPEIS_RDO.some((p) => p.papel === v);
}

// ---------- Blocos do relatório ----------

/** Percentual de andamento vindo do payload da atividade, quando registrado. */
export function percentualDaAtividade(payload: unknown): number | null {
  const p = payload as { percentual?: unknown } | null;
  const n = Number(p?.percentual);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) : null;
}

/** Mão de obra somada por origem — o total que fecha a tabela do RDO. */
export function totaisDaEquipe(
  workforce: Array<{ kind: string; quantity: number }>,
): { propria: number; terceiros: number; total: number } {
  let propria = 0;
  let terceiros = 0;
  for (const w of workforce) {
    if (w.kind === 'TERCEIRO') terceiros += w.quantity;
    else propria += w.quantity;
  }
  return { propria, terceiros, total: propria + terceiros };
}
