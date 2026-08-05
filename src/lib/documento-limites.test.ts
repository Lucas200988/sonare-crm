import { describe, expect, it } from 'vitest';
import {
  aplicarLimite, limparTexto, tipoAceito, CARACTERES_MAXIMOS,
} from './documento-limites';

describe('tipoAceito', () => {
  it('aceita os formatos que sabemos ler', () => {
    expect(tipoAceito('application/pdf', 'edital.pdf')).toBe(true);
    expect(tipoAceito('text/plain', 'notas.txt')).toBe(true);
  });

  it('aceita pelo nome quando o navegador não manda o tipo', () => {
    // acontece com .docx em alguns navegadores e no arrastar-e-soltar
    expect(tipoAceito('', 'termo-de-referencia.docx')).toBe(true);
    expect(tipoAceito('application/octet-stream', 'memorial.pdf')).toBe(true);
  });

  it('recusa o que não sabemos ler', () => {
    expect(tipoAceito('image/png', 'planta.png')).toBe(false);
    expect(tipoAceito('application/acad', 'projeto.dwg')).toBe(false);
  });
});

describe('limparTexto', () => {
  it('junta espaços e corta linhas em branco em excesso', () => {
    // PDF extraído vem cheio disso, e cada espaço a mais é token pago
    expect(limparTexto('a   b\n\n\n\nc')).toBe('a b\n\nc');
  });

  it('normaliza quebras de linha do Windows', () => {
    expect(limparTexto('linha1\r\nlinha2')).toBe('linha1\nlinha2');
  });

  it('tira espaço em volta das quebras', () => {
    expect(limparTexto('fim da linha   \n   início')).toBe('fim da linha\ninício');
  });
});

describe('aplicarLimite', () => {
  it('devolve o texto inteiro quando cabe', () => {
    const r = aplicarLimite('Objeto: projeto elétrico.');
    expect(r.cortado).toBe(false);
    expect(r.texto).toBe('Objeto: projeto elétrico.');
  });

  it('corta o excesso e avisa, com o tamanho original', () => {
    /*
     * Edital de trezentas páginas não cabe no contexto nem no tempo da
     * requisição. Cortar com aviso é melhor que falhar depois da espera.
     */
    const gigante = 'a'.repeat(CARACTERES_MAXIMOS + 5_000);
    const r = aplicarLimite(gigante);
    expect(r.cortado).toBe(true);
    expect(r.texto).toHaveLength(CARACTERES_MAXIMOS);
    expect(r.caracteres).toBe(CARACTERES_MAXIMOS + 5_000);
  });

  it('mede depois de limpar, não antes', () => {
    // senão um PDF cheio de espaços seria cortado sem necessidade
    const comLixo = `${'a '.repeat(100)}\n\n\n\n${'b '.repeat(100)}`;
    const r = aplicarLimite(comLixo);
    expect(r.caracteres).toBeLessThan(comLixo.length);
  });
});
