import { describe, expect, it } from 'vitest';
import {
  arquivoProposta, codigoProposta, nomeArquivoPrevia, nomeArquivoProposta,
} from './proposta-codigo';

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

describe('nomeArquivoProposta', () => {
  it('junta número e cliente, pronto para salvar sem renomear', () => {
    expect(nomeArquivoProposta('PROP-2026-013', 0, 'DCCO Soluções em Energia'))
      .toBe('PROP-2026-013 - DCCO Soluções em Energia.pdf');
  });

  it('mantém a revisão no nome', () => {
    expect(nomeArquivoProposta('PROP-2026-013', 2, 'Justiça Federal'))
      .toBe('PROP-2026-013-rev02 - Justiça Federal.pdf');
  });

  it('remove os caracteres que o Windows recusa em nome de arquivo', () => {
    expect(nomeArquivoProposta('PROP-2026-013', 0, 'Alfa/Beta: Engenharia * Ltda'))
      .toBe('PROP-2026-013 - Alfa Beta Engenharia Ltda.pdf');
  });

  it('corta razão social longa demais', () => {
    const nome = nomeArquivoProposta(
      'PROP-2026-013', 0,
      'CONSTRUTORA E INCORPORADORA MUITO LONGA DO ESTADO DE MATO GROSSO LTDA',
    );
    expect(nome.length).toBeLessThanOrEqual(80);
    expect(nome.endsWith('.pdf')).toBe(true);
  });

  it('usa só o número quando não há cliente', () => {
    expect(nomeArquivoProposta('PROP-2026-013', 0, null)).toBe('PROP-2026-013.pdf');
    expect(nomeArquivoProposta('PROP-2026-013', 0, '   ')).toBe('PROP-2026-013.pdf');
  });
});

describe('nomeArquivoPrevia', () => {
  it('identifica a prévia pelo orçamento e cliente', () => {
    expect(nomeArquivoPrevia('ORC-2026-004', 'DCCO Soluções'))
      .toBe('Previa ORC-2026-004 - DCCO Soluções.pdf');
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
