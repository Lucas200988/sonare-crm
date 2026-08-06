import { describe, expect, it } from 'vitest';
import { isEmptyRich, isHtml } from './html-text';

/**
 * O que conta como "campo vazio" decide se um título de seção aparece na
 * proposta enviada ao cliente. O editor rico não deixa a string vazia: um
 * campo em que se digitou e apagou vira um parágrafo sem conteúdo.
 */
describe('isEmptyRich', () => {
  it('trata ausência de valor como vazio', () => {
    expect(isEmptyRich(null)).toBe(true);
    expect(isEmptyRich(undefined)).toBe(true);
    expect(isEmptyRich('')).toBe(true);
  });

  it('trata o parágrafo sem conteúdo como vazio', () => {
    // é o que o editor deixa quando se digita e apaga tudo
    expect(isEmptyRich('<p></p>')).toBe(true);
    expect(isEmptyRich('<p><br></p>')).toBe(true);
    expect(isEmptyRich('<p>   </p>')).toBe(true);
  });

  it('lista sem itens também é vazio', () => {
    expect(isEmptyRich('<ul><li></li></ul>')).toBe(true);
  });

  it('não descarta conteúdo de verdade', () => {
    expect(isEmptyRich('<p>Acesso às instalações garantido pelo contratante.</p>')).toBe(false);
    expect(isEmptyRich('- Execução de obras')).toBe(false);
  });
});

describe('isHtml', () => {
  it('reconhece o conteúdo do editor rico', () => {
    expect(isHtml('<p>texto</p>')).toBe(true);
    expect(isHtml('<ul><li>item</li></ul>')).toBe(true);
  });

  it('texto puro dos orçamentos antigos segue pelo outro caminho', () => {
    expect(isHtml('- Execução de obras\n- Fornecimento de materiais')).toBe(false);
  });
});
