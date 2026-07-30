import { describe, expect, it } from 'vitest';
import { ouNegociar } from './proposal-pdf';

/**
 * Prazo e forma de pagamento em branco não podem sair como seção vazia: o
 * cliente lê como esquecimento, não como condição em aberto.
 */
describe('ouNegociar', () => {
  it('preserva o que foi escrito', () => {
    expect(ouNegociar('- 30% na assinatura, 70% na entrega.'))
      .toBe('- 30% na assinatura, 70% na entrega.');
  });

  it('preenche quando o campo está vazio ou ausente', () => {
    expect(ouNegociar(null)).toBe('A negociar.');
    expect(ouNegociar(undefined)).toBe('A negociar.');
    expect(ouNegociar('')).toBe('A negociar.');
    expect(ouNegociar('   \n  ')).toBe('A negociar.');
  });

  it('reconhece o HTML vazio que o editor rico grava', () => {
    expect(ouNegociar('<p></p>')).toBe('A negociar.');
    expect(ouNegociar('<p><br></p>')).toBe('A negociar.');
    expect(ouNegociar('<p>&nbsp;</p>')).toBe('A negociar.');
  });

  it('mantém o HTML que tem conteúdo de verdade', () => {
    const html = '<p>Pagamento em <strong>30 dias</strong>.</p>';
    expect(ouNegociar(html)).toBe(html);
  });
});
