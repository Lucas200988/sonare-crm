import { describe, expect, it } from 'vitest';
import { custoEstimadoUsd, formatUsd } from './ia-custo';

describe('custoEstimadoUsd', () => {
  it('calcula pelo preço do modelo', () => {
    // gpt-4o: 2.50/M entrada + 10/M saída
    expect(custoEstimadoUsd('gpt-4o', 1_000_000, 0)).toBe(2.5);
    expect(custoEstimadoUsd('gpt-4o', 0, 1_000_000)).toBe(10);
    expect(custoEstimadoUsd('gpt-4o-mini', 1_000_000, 1_000_000)).toBe(0.75);
  });

  it('o mini não cai na regra do modelo cheio', () => {
    expect(custoEstimadoUsd('gpt-4o-mini', 1_000_000, 0)).toBe(0.15);
    expect(custoEstimadoUsd('gpt-5.5-mini', 1_000_000, 0)).toBe(0.25);
    expect(custoEstimadoUsd('gpt-5.5', 1_000_000, 0)).toBe(1.25);
  });

  it('modelo desconhecido devolve null — melhor sem número que número inventado', () => {
    expect(custoEstimadoUsd('claude-sonnet-4-5', 1000, 1000)).toBeNull();
    expect(custoEstimadoUsd('modelo-futuro', 1000, 1000)).toBeNull();
  });

  it('formata em dólar com quatro casas', () => {
    expect(formatUsd(0.0231)).toBe('US$ 0,0231');
  });
});
