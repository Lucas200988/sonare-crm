import { describe, expect, it } from 'vitest';
import { htmlToBlocks } from './html-blocks';
import { htmlToText, textToHtml, isHtml, isEmptyRich, appendTextToHtml } from './html-text';

describe('htmlToBlocks', () => {
  it('separa parágrafo com negrito', () => {
    const [b] = htmlToBlocks('<p>Prazo de <strong>15 dias</strong> úteis</p>');
    expect(b.kind).toBe('paragraph');
    expect(b.runs).toEqual([
      { text: 'Prazo de ', bold: false, italic: false, underline: false },
      { text: '15 dias', bold: true, italic: false, underline: false },
      { text: ' úteis', bold: false, italic: false, underline: false },
    ]);
  });

  it('reconhece itálico e sublinhado', () => {
    const [b] = htmlToBlocks('<p><em>norma</em> e <u>anexo</u></p>');
    expect(b.runs[0]).toMatchObject({ text: 'norma', italic: true });
    expect(b.runs[2]).toMatchObject({ text: 'anexo', underline: true });
  });

  it('preserva o alinhamento', () => {
    const [b] = htmlToBlocks('<p style="text-align: center;">Centro</p>');
    expect(b.align).toBe('center');
    expect(htmlToBlocks('<p style="text-align:justify">X</p>')[0].align).toBe('justify');
  });

  it('numera itens de lista ordenada', () => {
    const blocks = htmlToBlocks('<ol><li>um</li><li>dois</li></ol>');
    expect(blocks.map((b) => (b.kind === 'listItem' ? b.marker : null))).toEqual(['1.', '2.']);
  });

  it('usa traço em lista com marcadores', () => {
    const [b] = htmlToBlocks('<ul><li>item</li></ul>');
    expect(b).toMatchObject({ kind: 'listItem', marker: '-' });
  });

  it('reconhece títulos', () => {
    expect(htmlToBlocks('<h2>ESCOPO</h2>')[0]).toMatchObject({ kind: 'heading', level: 2 });
  });

  it('decodifica entidades', () => {
    const [b] = htmlToBlocks('<p>Instala&ccedil;&atilde;o de 10 m&sup2;</p>');
    expect(b.runs[0].text).toBe('Instalação de 10 m²');
  });

  it('descarta blocos vazios', () => {
    expect(htmlToBlocks('<p></p><p>  </p>')).toHaveLength(0);
  });
});

describe('conversões de texto e HTML', () => {
  it('detecta conteúdo já formatado', () => {
    expect(isHtml('<p>oi</p>')).toBe(true);
    expect(isHtml('texto simples')).toBe(false);
  });

  it('converte texto puro em HTML agrupando a lista', () => {
    expect(textToHtml('Título\n- a\n- b')).toBe('<p>Título</p><ul><li>a</li><li>b</li></ul>');
  });

  it('volta de HTML para texto legível', () => {
    expect(htmlToText('<p>Escopo</p><ul><li>item um</li></ul>')).toBe('Escopo\n- item um');
  });

  it('trata editor vazio como campo vazio', () => {
    expect(isEmptyRich('<p></p>')).toBe(true);
    expect(isEmptyRich('<p>algo</p>')).toBe(false);
    expect(isEmptyRich(null)).toBe(true);
  });

  it('acrescenta bloco sem destruir a formatação existente', () => {
    const atual = '<p style="text-align: center;"><strong>SPDA</strong></p>';
    const resultado = appendTextToHtml(atual, '- nova linha');
    expect(resultado).toContain('text-align: center');
    expect(resultado).toContain('<strong>SPDA</strong>');
    expect(resultado).toContain('<li>nova linha</li>');
  });

  it('escapa caracteres perigosos ao converter texto', () => {
    expect(textToHtml('a < b & c')).toBe('<p>a &lt; b &amp; c</p>');
  });

  it('converte "**" da IA em negrito de verdade', () => {
    expect(textToHtml('**Entregáveis**\n- Laudo **assinado**'))
      .toBe('<p><strong>Entregáveis</strong></p><ul><li>Laudo <strong>assinado</strong></li></ul>');
  });

  it('asterisco desacompanhado fica literal', () => {
    expect(textToHtml('2 ** 3 = 8')).toBe('<p>2 ** 3 = 8</p>');
    expect(textToHtml('nota*')).toBe('<p>nota*</p>');
  });

  it('negrito escapa junto com o resto', () => {
    expect(textToHtml('**a < b**')).toBe('<p><strong>a &lt; b</strong></p>');
  });

  it('negrito sobrevive à ida e volta', () => {
    const html = '<p>Prazo de <strong>15 dias</strong></p>';
    expect(htmlToText(html)).toBe('Prazo de **15 dias**');
    expect(textToHtml(htmlToText(html))).toBe(html);
  });

  it('strong vazio não vira asteriscos soltos', () => {
    expect(htmlToText('<p>a<strong></strong>b</p>')).toBe('ab');
  });
});
