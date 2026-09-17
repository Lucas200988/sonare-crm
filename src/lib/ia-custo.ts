/**
 * Custo estimado de chamadas de IA, em dólares.
 *
 * A tabela cobre os modelos que a SONARE usa; modelo fora dela devolve null
 * e a tela diz "sem estimativa" — chutar preço de modelo desconhecido seria
 * inventar número em relatório financeiro. Preços por 1M de tokens (USD),
 * conferidos em 2026-09; atualizar aqui quando o provedor mudar.
 */

type Preco = { entradaPorMilhao: number; saidaPorMilhao: number };

const PRECOS: Array<{ padrao: RegExp; preco: Preco }> = [
  { padrao: /^gpt-4o-mini/i, preco: { entradaPorMilhao: 0.15, saidaPorMilhao: 0.6 } },
  { padrao: /^gpt-4o/i, preco: { entradaPorMilhao: 2.5, saidaPorMilhao: 10 } },
  { padrao: /^gpt-4\.1-mini/i, preco: { entradaPorMilhao: 0.4, saidaPorMilhao: 1.6 } },
  { padrao: /^gpt-4\.1/i, preco: { entradaPorMilhao: 2, saidaPorMilhao: 8 } },
  { padrao: /^o4-mini/i, preco: { entradaPorMilhao: 1.1, saidaPorMilhao: 4.4 } },
  { padrao: /^gpt-5.*-mini/i, preco: { entradaPorMilhao: 0.25, saidaPorMilhao: 2 } },
  { padrao: /^gpt-5/i, preco: { entradaPorMilhao: 1.25, saidaPorMilhao: 10 } },
];

/** Custo em USD, ou null quando o modelo não está na tabela. */
export function custoEstimadoUsd(
  model: string, tokensInput: number, tokensOutput: number,
): number | null {
  const preco = PRECOS.find((p) => p.padrao.test(model.trim()))?.preco;
  if (!preco) return null;
  const custo = (tokensInput / 1_000_000) * preco.entradaPorMilhao
    + (tokensOutput / 1_000_000) * preco.saidaPorMilhao;
  return Math.round(custo * 1_000_000) / 1_000_000;
}

/** "US$ 0,0231" — quatro casas porque conversa individual custa centavos. */
export function formatUsd(valor: number): string {
  return `US$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}
