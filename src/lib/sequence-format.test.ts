import { describe, expect, it } from 'vitest';

/**
 * O gerador de códigos vive no servidor (depende do banco), mas a regra de
 * "avançar até achar um número livre" é aritmética e pode ser verificada aqui.
 * Foi ela que faltou quando o contador ficou atrás dos códigos já gravados e
 * a geração de proposta passou a quebrar com violação de chave única.
 */

function formatar(tipo: string, ano: number, numero: number): string {
  return `${tipo}-${ano}-${String(numero).padStart(3, '0')}`;
}

/** Simula a busca por um número livre a partir do contador. */
function proximoLivre(inicio: number, ocupados: Set<number>, limite = 50): number {
  let numero = inicio;
  for (let i = 0; i < limite && ocupados.has(numero); i++) numero += 1;
  return numero;
}

describe('numeração de documentos', () => {
  it('formata com três dígitos', () => {
    expect(formatar('PROP', 2026, 1)).toBe('PROP-2026-001');
    expect(formatar('PROP', 2026, 13)).toBe('PROP-2026-013');
    expect(formatar('PROP', 2026, 137)).toBe('PROP-2026-137');
  });

  it('usa o número do contador quando está livre', () => {
    expect(proximoLivre(5, new Set([1, 2, 3]))).toBe(5);
  });

  it('avança quando o contador aponta para número já ocupado', () => {
    // contador atrasado em 2: códigos 2 a 12 existem, o livre é o 13
    const ocupados = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(proximoLivre(2, ocupados)).toBe(13);
  });

  it('não entra em laço infinito quando tudo está ocupado', () => {
    const ocupados = new Set(Array.from({ length: 200 }, (_, i) => i + 1));
    expect(proximoLivre(1, ocupados, 50)).toBe(51);
  });
});
