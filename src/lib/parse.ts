/**
 * Normaliza um número digitado no padrão brasileiro para string decimal com ponto.
 * "1.234,56" → "1234.56" · "1500,5" → "1500.5" · "1.500" → "1500" · "1500.50" → "1500.50"
 */
export function parseDecimalBR(value: string): string {
  const s = value.trim();
  if (s === '') return '0';
  if (s.includes(',')) return s.replace(/\./g, '').replace(',', '.');
  // sem vírgula: ponto só é separador de milhar se casar o padrão exato 1.234 / 12.345.678
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return s.replace(/\./g, '');
  return s;
}

/** Formata número decimal (string com ponto) para exibição pt-BR com 2 casas. */
export function formatDecimalBR(value: string | number, decimals = 2): string {
  const n = Number(value);
  if (Number.isNaN(n)) return '0,00';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
