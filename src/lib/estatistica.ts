/**
 * Mediana de uma lista de valores.
 *
 * Escolhida em vez da média para sugerir preço: com poucos orçamentos, um
 * valor fora da curva (um desconto grande, uma obra atípica) puxaria a média
 * e distorceria a sugestão.
 */
export function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[meio - 1] + ordenados[meio]) / 2
    : ordenados[meio];
}
