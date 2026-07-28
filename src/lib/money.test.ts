import { describe, expect, it } from 'vitest';
import { dec, formatBRL, percentOf, sumMoney, toMoney, valorPorExtenso } from './money';

describe('money', () => {
  it('nunca perde precisão em somas de centavos', () => {
    // 0.1 + 0.2 em float = 0.30000000000000004
    expect(sumMoney(['0.1', '0.2']).toString()).toBe('0.3');
    expect(sumMoney(Array(100).fill('0.01')).toString()).toBe('1');
  });

  it('calcula percentuais com arredondamento de 2 casas', () => {
    expect(percentOf('1000', '5').toString()).toBe('50');
    expect(percentOf('333.33', '10').toString()).toBe('33.33');
    expect(percentOf('0.01', '50').toString()).toBe('0'); // 0.005 → half-even arredonda p/ par
    expect(percentOf('0.03', '50').toString()).toBe('0.02'); // 0.015 → 0.02
  });

  it('formata em reais no padrão brasileiro', () => {
    expect(formatBRL('1234.56')).toMatch(/R\$\s?1\.234,56/);
    expect(formatBRL(0)).toMatch(/R\$\s?0,00/);
  });

  it('trata nulos como zero', () => {
    expect(dec(null).toString()).toBe('0');
    expect(dec(undefined).toString()).toBe('0');
    expect(sumMoney([null, '10', undefined]).toString()).toBe('10');
  });

  it('arredonda para centavos', () => {
    expect(toMoney('10.005').toString()).toBe('10'); // half-even
    expect(toMoney('10.015').toString()).toBe('10.02');
    expect(toMoney('10.999').toString()).toBe('11');
  });

  it('gera valor por extenso', () => {
    expect(valorPorExtenso('1')).toBe('um real');
    expect(valorPorExtenso('100')).toBe('cem reais');
    expect(valorPorExtenso('1500')).toContain('mil');
    expect(valorPorExtenso('0.50')).toBe('cinquenta centavos');
    expect(valorPorExtenso('2.01')).toBe('dois reais e um centavo');
  });

  it('usa "e" conforme a norma culta ao ligar os grupos', () => {
    // centena redonda após milhar leva "e"
    expect(valorPorExtenso('8300')).toBe('oito mil e trezentos reais');
    expect(valorPorExtenso('2000')).toBe('dois mil reais');
    // resto menor que cem leva "e"
    expect(valorPorExtenso('1050')).toBe('mil e cinquenta reais');
    // resto com centena e dezena não leva "e" entre os grupos
    expect(valorPorExtenso('8350')).toBe('oito mil trezentos e cinquenta reais');
    expect(valorPorExtenso('12345')).toBe('doze mil trezentos e quarenta e cinco reais');
  });
});
