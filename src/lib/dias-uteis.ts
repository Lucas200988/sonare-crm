/**
 * Calendário de trabalho da SONARE: segunda a sexta.
 *
 * O modelo de IA não deve deduzir "hoje", "amanhã" ou "próximo dia útil" —
 * erra (chamou sábado de "amanhã" num fechamento de sexta). O código calcula
 * e entrega pronto. Feriados ainda não são considerados.
 */

const DIAS = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado',
];

function meioDia(diaISO: string): Date {
  return new Date(`${diaISO}T12:00:00Z`);
}

/** Dia de calendário em Cuiabá, no formato YYYY-MM-DD. */
export function hojeEmCuiaba(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cuiaba' }).format(agora);
}

export function diaDaSemana(diaISO: string): string {
  return DIAS[meioDia(diaISO).getUTCDay()];
}

export function ehDiaUtil(diaISO: string): boolean {
  const d = meioDia(diaISO).getUTCDay();
  return d !== 0 && d !== 6;
}

/** O próximo dia útil DEPOIS de diaISO (sexta → segunda). */
export function proximoDiaUtil(diaISO: string): string {
  let d = meioDia(diaISO);
  do {
    d = new Date(d.getTime() + 86_400_000);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

/** O dia útil ANTERIOR a diaISO (segunda → sexta). */
export function diaUtilAnterior(diaISO: string): string {
  let d = meioDia(diaISO);
  do {
    d = new Date(d.getTime() - 86_400_000);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

/** Início do dia (00:00 em Cuiabá) como instante. */
export function inicioDoDia(diaISO: string): Date {
  return new Date(`${diaISO}T00:00:00-04:00`);
}

/** "18/09/2026" */
export function dataBR(diaISO: string): string {
  const [a, m, d] = diaISO.split('-');
  return `${d}/${m}/${a}`;
}

/** "sexta-feira, 18/09/2026" — a forma que vai para o prompt. */
export function diaPorExtenso(diaISO: string): string {
  return `${diaDaSemana(diaISO)}, ${dataBR(diaISO)}`;
}

/**
 * Bloco de calendário para qualquer prompt do Jarvis: hoje, o próximo dia
 * útil e a regra de fim de semana, já resolvidos.
 */
export function contextoDeCalendario(diaISO: string): string {
  const proximo = proximoDiaUtil(diaISO);
  return [
    `Hoje é ${diaPorExtenso(diaISO)} (fuso America/Cuiaba).`,
    `O próximo dia útil é ${diaPorExtenso(proximo)}.`,
    'A SONARE trabalha de segunda a sexta. Sábado e domingo não são dias de trabalho: '
      + 'nunca chame sábado ou domingo de "amanhã" em tom de trabalho — fale do próximo dia útil pelo nome.',
    'As datas das memórias e dos registros são absolutas: compare-as com a data de hoje antes de usar '
      + '"hoje", "amanhã" ou "ontem". Informação cuja data já passou é passado, não futuro.',
  ].join('\n');
}
