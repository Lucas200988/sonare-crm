import { describe, expect, it } from 'vitest';
import { mediana } from './estatistica';

describe('mediana', () => {
  it('devolve zero para lista vazia', () => {
    expect(mediana([])).toBe(0);
  });

  it('devolve o próprio valor com uma amostra', () => {
    expect(mediana([4500])).toBe(4500);
  });

  it('pega o valor do meio quando a quantidade é ímpar', () => {
    expect(mediana([7200, 4500, 5000])).toBe(5000);
  });

  it('faz a média dos dois do meio quando a quantidade é par', () => {
    expect(mediana([4000, 5000, 6000, 7000])).toBe(5500);
  });

  it('não se deixa levar por um valor fora da curva', () => {
    // a média daria 21.700; a mediana segue representando a prática
    expect(mediana([4500, 5000, 5200, 100000])).toBe(5100);
  });

  it('não depende da ordem de entrada', () => {
    expect(mediana([5200, 4500, 5000])).toBe(mediana([4500, 5000, 5200]));
  });
});
