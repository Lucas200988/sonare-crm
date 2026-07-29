import { describe, expect, it } from 'vitest';
import { limparTexto, limparHtml, contarAjustes } from './texto-limpo';

describe('limparTexto', () => {
  it('corrige espaço antes da pontuação', () => {
    expect(limparTexto('Projeto elétrico , conforme norma .'))
      .toBe('Projeto elétrico, conforme norma.');
  });

  it('remove espaços duplicados', () => {
    expect(limparTexto('Laudo  técnico   completo')).toBe('Laudo técnico completo');
  });

  it('acrescenta espaço depois da vírgula', () => {
    expect(limparTexto('Projeto,laudo,memorial')).toBe('Projeto, laudo, memorial');
  });

  it('não separa decimais escritos com vírgula', () => {
    expect(limparTexto('Valor de 1.250,50 reais')).toBe('Valor de 1.250,50 reais');
  });

  it('normaliza unidades', () => {
    expect(limparTexto('Área de 450 m2 e volume de 12 m3'))
      .toBe('Área de 450 m² e volume de 12 m³');
  });

  it('padroniza siglas do setor', () => {
    expect(limparTexto('conforme abnt nbr 5410 e registro no crea'))
      .toBe('Conforme ABNT NBR 5410 e registro no CREA');
  });

  it('corrige acentos esquecidos comuns', () => {
    expect(limparTexto('servico eletrico nao concluido'))
      .toBe('Serviço elétrico não concluido');
  });

  it('preserva a maiúscula da palavra original', () => {
    expect(limparTexto('Servico de manutenção')).toBe('Serviço de manutenção');
  });

  it('capitaliza o início de cada frase', () => {
    expect(limparTexto('primeiro item. segundo item. terceiro'))
      .toBe('Primeiro item. Segundo item. Terceiro');
  });

  it('não altera texto já correto', () => {
    const texto = 'Elaboração do projeto elétrico conforme ABNT NBR 5410.';
    expect(limparTexto(texto)).toBe(texto);
  });
});

describe('limparHtml', () => {
  it('corrige o texto sem tocar nas tags', () => {
    const html = '<p>projeto  eletrico , completo</p>';
    expect(limparHtml(html)).toBe('<p>Projeto elétrico, completo</p>');
  });

  it('preserva a formatação existente', () => {
    const html = '<p style="text-align: center;"><strong>servico</strong> de campo</p>';
    const saida = limparHtml(html);
    expect(saida).toContain('text-align: center');
    expect(saida).toContain('<strong>Serviço</strong>');
  });

  it('mantém listas intactas', () => {
    const html = '<ul><li>item  um</li><li>item  dois</li></ul>';
    expect(limparHtml(html)).toBe('<ul><li>Item um</li><li>Item dois</li></ul>');
  });
});

describe('contarAjustes', () => {
  it('devolve zero quando nada muda', () => {
    expect(contarAjustes('texto igual', 'texto igual')).toBe(0);
  });

  it('conta as palavras alteradas', () => {
    expect(contarAjustes('servico eletrico', 'Serviço elétrico')).toBe(2);
  });

  it('não infla a contagem quando o texto desloca', () => {
    // uma palavra corrigida no início não pode contar o texto inteiro
    const antes = 'servico de campo com equipe propria e prazo definido';
    const depois = 'Serviço de campo com equipe propria e prazo definido';
    expect(contarAjustes(antes, depois)).toBe(1);
  });
});
