import { describe, expect, it } from 'vitest';
import { parseInline, stripMarkers, classifyLine } from './rich-text';

describe('parseInline', () => {
  it('mantém texto sem marcadores como um único trecho', () => {
    expect(parseInline('Projeto elétrico')).toEqual([
      { text: 'Projeto elétrico', bold: false, italic: false },
    ]);
  });

  it('separa negrito no meio da frase', () => {
    expect(parseInline('Prazo de **15 dias** úteis')).toEqual([
      { text: 'Prazo de ', bold: false, italic: false },
      { text: '15 dias', bold: true, italic: false },
      { text: ' úteis', bold: false, italic: false },
    ]);
  });

  it('reconhece itálico', () => {
    expect(parseInline('conforme _ABNT NBR 5410_')).toEqual([
      { text: 'conforme ', bold: false, italic: false },
      { text: 'ABNT NBR 5410', bold: false, italic: true },
    ]);
  });

  it('não quebra em asterisco solto', () => {
    const segs = parseInline('cálculo 3 * 4 = 12');
    expect(segs).toHaveLength(1);
    expect(segs[0].bold).toBe(false);
  });
});

describe('stripMarkers', () => {
  it('remove negrito e itálico', () => {
    expect(stripMarkers('**Escopo** do _projeto_')).toBe('Escopo do projeto');
  });
});

describe('classifyLine', () => {
  it('detecta marcador', () => {
    expect(classifyLine('- Levantamento em campo')).toEqual({
      kind: 'bullet', content: 'Levantamento em campo',
    });
  });

  it('detecta lista numerada preservando o número', () => {
    expect(classifyLine('2. Elaboração do memorial')).toEqual({
      kind: 'numbered', content: 'Elaboração do memorial', marker: '2.',
    });
  });

  it('detecta subtítulo em caixa alta', () => {
    expect(classifyLine('PROJETO DE SPDA').kind).toBe('heading');
  });

  it('não confunde frase comum com subtítulo', () => {
    expect(classifyLine('Elaboração do projeto executivo.').kind).toBe('paragraph');
  });

  it('reconhece subtítulo mesmo com negrito', () => {
    expect(classifyLine('**PROJETO ELÉTRICO**').kind).toBe('heading');
  });
});
