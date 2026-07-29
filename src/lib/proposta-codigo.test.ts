import { describe, expect, it } from 'vitest';
import { arquivoProposta, codigoProposta } from './proposta-codigo';

describe('codigoProposta', () => {
  it('mostra só o número na oferta original', () => {
    expect(codigoProposta('PROP-2026-013', 0)).toBe('PROP-2026-013');
  });

  it('mantém o número e acrescenta a revisão após renegociar', () => {
    expect(codigoProposta('PROP-2026-013', 1)).toBe('PROP-2026-013 Rev. 01');
  });

  it('usa dois dígitos até a revisão 99', () => {
    expect(codigoProposta('PROP-2026-013', 9)).toBe('PROP-2026-013 Rev. 09');
    expect(codigoProposta('PROP-2026-013', 12)).toBe('PROP-2026-013 Rev. 12');
  });

  it('não trunca revisões acima de 99', () => {
    expect(codigoProposta('PROP-2026-013', 100)).toBe('PROP-2026-013 Rev. 100');
  });
});

describe('arquivoProposta', () => {
  it('não põe espaço nem ponto no nome do arquivo', () => {
    expect(arquivoProposta('PROP-2026-013', 2)).toBe('PROP-2026-013-rev02');
  });

  it('mantém o nome limpo quando não há revisão', () => {
    expect(arquivoProposta('PROP-2026-013', 0)).toBe('PROP-2026-013');
  });
});
