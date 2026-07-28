import { describe, expect, it } from 'vitest';
import { mergeTextBlocks, normalizeLine } from './merge-text';

describe('normalizeLine', () => {
  it('ignora acento, bullet, caixa e pontuação final', () => {
    expect(normalizeLine('- Execução da obra;')).toBe('execucao da obra');
    expect(normalizeLine('EXECUCAO DA OBRA.')).toBe('execucao da obra');
    expect(normalizeLine('  • Execução da obra  ')).toBe('execucao da obra');
  });
});

describe('mergeTextBlocks — escopo (sem dedupe)', () => {
  it('acrescenta bloco com subtítulo, preservando o anterior', () => {
    const atual = 'PROJETO ELÉTRICO\n- Dimensionamento de cargas;';
    const out = mergeTextBlocks(atual, '- Inspeção do SPDA;', 'append', 'PROJETO DE SPDA');
    expect(out).toBe('PROJETO ELÉTRICO\n- Dimensionamento de cargas;\n\nPROJETO DE SPDA\n- Inspeção do SPDA;');
  });

  it('substitui descartando o conteúdo atual', () => {
    const out = mergeTextBlocks('conteúdo antigo', '- Novo item;', 'replace', 'NOVO SERVIÇO');
    expect(out).toBe('NOVO SERVIÇO\n- Novo item;');
  });

  it('mantém linhas repetidas quando dedupe está desligado', () => {
    const atual = '- Levantamento de campo;';
    const out = mergeTextBlocks(atual, '- Levantamento de campo;', 'append', 'OUTRO SERVIÇO');
    expect(out).toContain('OUTRO SERVIÇO');
    expect(out.match(/Levantamento de campo/g)).toHaveLength(2);
  });

  it('não altera nada quando o bloco novo está vazio', () => {
    expect(mergeTextBlocks('atual', '', 'append', 'X')).toBe('atual');
    expect(mergeTextBlocks('atual', '   \n  ', 'replace', null)).toBe('atual');
  });

  it('parte do zero quando não há conteúdo', () => {
    expect(mergeTextBlocks('', '- Item;', 'append', null)).toBe('- Item;');
  });
});

describe('mergeTextBlocks — premissas e exclusões (com dedupe)', () => {
  const premissasEletrico = [
    '- A CONTRATANTE fornecerá o projeto arquitetônico atualizado;',
    '- As aprovações serão feitas nos prazos acordados;',
  ].join('\n');

  it('não repete linhas iguais entre serviços', () => {
    const out = mergeTextBlocks(premissasEletrico, premissasEletrico, 'append', null, true);
    expect(out).toBe(premissasEletrico);
  });

  it('acrescenta apenas o que é novo', () => {
    const premissasCftv = [
      '- A CONTRATANTE fornecerá o projeto arquitetônico atualizado;',
      '- Designar responsável técnico para acompanhamento;',
    ].join('\n');
    const out = mergeTextBlocks(premissasEletrico, premissasCftv, 'append', null, true);

    expect(out.match(/projeto arquitetônico atualizado/g)).toHaveLength(1);
    expect(out).toContain('Designar responsável técnico');
    expect(out.split('\n').filter(Boolean)).toHaveLength(3);
  });

  it('trata variações de acento e pontuação como a mesma linha', () => {
    const out = mergeTextBlocks(
      '- Execução da obra e fornecimento de materiais;',
      '- Execucao da obra e fornecimento de materiais.',
      'append', null, true,
    );
    expect(out.split('\n').filter(Boolean)).toHaveLength(1);
  });

  it('remove duplicatas dentro do próprio bloco novo', () => {
    const out = mergeTextBlocks('', '- Item A;\n- Item A;\n- Item B;', 'append', null, true);
    expect(out.split('\n').filter(Boolean)).toHaveLength(2);
  });
});
