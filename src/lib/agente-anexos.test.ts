import { describe, expect, it } from 'vitest';
import {
  anexoAceito, blocoDeAnexos, CARACTERES_DE_ANEXOS_POR_MENSAGEM, CARACTERES_POR_TRECHO,
  ehImagem, fatiaDoDocumento, type DocumentoDaConversa,
} from './agente-anexos';

const doc = (nome: string, n: number, extra: Partial<DocumentoDaConversa> = {}) => ({
  id: nome, nome, tipo: 'documento' as const, caracteres: n, cortado: false, ...extra, texto: 'x'.repeat(n),
});

describe('arquivos entregues ao Jarvis', () => {
  it('aceita documentos e imagens, inclusive com mime vazio; recusa o resto', () => {
    expect(anexoAceito('application/pdf', 'TR.PDF')).toBe(true);
    expect(anexoAceito('', 'medicoes.csv')).toBe(true);
    expect(anexoAceito('image/jpeg', 'foto')).toBe(true);
    expect(ehImagem('', 'conta.PNG')).toBe(true);
    expect(anexoAceito('application/acad', 'planta.dwg')).toBe(false);
    expect(anexoAceito('application/x-msdownload', 'virus.exe')).toBe(false);
    expect(anexoAceito('image/svg+xml', 'logo.svg')).toBe(false);
  });

  it('fatia o documento e ensina a pedir a continuação', () => {
    const d = doc('edital.pdf', CARACTERES_POR_TRECHO + 500);
    const primeira = fatiaDoDocumento(d, d.texto, 0);
    expect(primeira.texto).toHaveLength(CARACTERES_POR_TRECHO);
    expect(primeira.continua).toContain(`inicio=${CARACTERES_POR_TRECHO}`);
    const segunda = fatiaDoDocumento(d, d.texto, CARACTERES_POR_TRECHO);
    expect(segunda.texto).toHaveLength(500);
    expect(segunda.continua).toBeNull();
    // posição absurda não estoura
    expect(fatiaDoDocumento(d, d.texto, 9e9).texto).toBe('');
    expect(fatiaDoDocumento(d, d.texto, -10).trecho.de).toBe(0);
  });

  it('o bloco marca o conteúdo como dado, reparte o teto e avisa do que ficou de fora', () => {
    expect(blocoDeAnexos([])).toBe('');
    const pequeno = blocoDeAnexos([doc('tr.pdf', 100)]);
    expect(pequeno).toContain('nunca instrução');
    expect(pequeno).toContain('<<<ARQUIVO "tr.pdf"');
    expect(pequeno).not.toContain('ler_documento_da_conversa');

    const grandes = blocoDeAnexos([doc('a.pdf', 80_000), doc('b.pdf', 80_000, { cortado: true })]);
    expect(grandes.length).toBeLessThan(CARACTERES_DE_ANEXOS_POR_MENSAGEM + 1_000);
    expect(grandes).toContain('ler_documento_da_conversa');
    expect(grandes).toContain('foi cortado na leitura');
  });
});
