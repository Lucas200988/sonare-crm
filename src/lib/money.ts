import Decimal from 'decimal.js';

// Regras financeiras: precisão decimal, arredondamento bancário nas somas finais.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });

export { Decimal };

export type DecimalInput = Decimal.Value;

/** Converte com segurança para Decimal (aceita string, number, Decimal, Prisma.Decimal). */
export function dec(value: DecimalInput | null | undefined): Decimal {
  if (value === null || value === undefined || value === '') return new Decimal(0);
  return new Decimal(value.toString());
}

/** Arredonda para 2 casas (centavos). */
export function toMoney(value: DecimalInput): Decimal {
  return dec(value).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
}

/** Formata como R$ 1.234,56. */
export function formatBRL(value: DecimalInput | null | undefined): string {
  const n = dec(value).toNumber();
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

/** Formata percentual: 12,5%. */
export function formatPercent(value: DecimalInput | null | undefined, decimals = 2): string {
  const n = dec(value).toNumber();
  return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(n)}%`;
}

/** Aplica percentual sobre uma base: percentOf(1000, 5) = 50.00 */
export function percentOf(base: DecimalInput, percent: DecimalInput): Decimal {
  return toMoney(dec(base).mul(dec(percent)).div(100));
}

/** Soma uma lista de valores com precisão decimal. */
export function sumMoney(values: Array<DecimalInput | null | undefined>): Decimal {
  return toMoney(values.reduce<Decimal>((acc, v) => acc.plus(dec(v)), new Decimal(0)));
}

/** Valor por extenso em reais (para contratos). */
export function valorPorExtenso(value: DecimalInput): string {
  const v = toMoney(value);
  const inteiro = v.trunc().toNumber();
  const centavos = v.minus(v.trunc()).mul(100).round().toNumber();

  const um = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

  function ate999(n: number): string {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100);
    const resto = n % 100;
    const parts: string[] = [];
    if (c > 0) parts.push(centenas[c]);
    if (resto > 0) {
      if (resto < 20) parts.push(um[resto]);
      else {
        const d = Math.floor(resto / 10);
        const u = resto % 10;
        parts.push(u > 0 ? `${dezenas[d]} e ${um[u]}` : dezenas[d]);
      }
    }
    return parts.join(' e ');
  }

  function extenso(n: number): string {
    if (n === 0) return 'zero';
    const bilhoes = Math.floor(n / 1_000_000_000);
    const milhoes = Math.floor((n % 1_000_000_000) / 1_000_000);
    const milhares = Math.floor((n % 1_000_000) / 1000);
    const resto = n % 1000;
    const parts: string[] = [];
    if (bilhoes > 0) parts.push(`${ate999(bilhoes)} ${bilhoes === 1 ? 'bilhão' : 'bilhões'}`);
    if (milhoes > 0) parts.push(`${ate999(milhoes)} ${milhoes === 1 ? 'milhão' : 'milhões'}`);
    if (milhares > 0) parts.push(milhares === 1 ? 'mil' : `${ate999(milhares)} mil`);
    if (resto === 0) return parts.join(', ');

    // Norma culta: usa-se "e" antes do último grupo quando ele é menor que 100
    // (mil e cinquenta) ou é centena redonda (oito mil e trezentos);
    // caso contrário, apenas espaço (oito mil trezentos e cinquenta).
    const usaE = resto < 100 || resto % 100 === 0;
    const restoTexto = ate999(resto);
    if (parts.length === 0) return restoTexto;
    return `${parts.join(', ')}${usaE ? ' e ' : ' '}${restoTexto}`;
  }

  const reais = inteiro === 0 ? '' : `${extenso(inteiro)} ${inteiro === 1 ? 'real' : 'reais'}`;
  const cents = centavos === 0 ? '' : `${extenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`;
  if (reais && cents) return `${reais} e ${cents}`;
  return reais || cents || 'zero real';
}
