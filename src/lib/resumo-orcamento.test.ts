import { describe, expect, it } from 'vitest';
import { resumirOrcamento } from './resumo-orcamento';

describe('resumirOrcamento', () => {
  it('prefere o tipo de serviço, que é o campo escrito para nomear o serviço', () => {
    const r = resumirOrcamento({
      serviceType: 'Projeto elétrico de subestação',
      primeiroItem: 'Elaboração de projeto',
      escopo: '<p>Contexto qualquer.</p>',
    });
    expect(r).toBe('Projeto elétrico de subestação');
  });

  it('cai para o primeiro item quando não há tipo de serviço', () => {
    const r = resumirOrcamento({
      serviceType: '   ',
      primeiroItem: 'Laudo de SPDA do galpão 2',
      escopo: '<p>Outro texto.</p>',
    });
    expect(r).toBe('Laudo de SPDA do galpão 2');
  });

  it('usa o escopo só como último recurso', () => {
    // a primeira linha do escopo costuma ser contexto, não título
    const r = resumirOrcamento({
      escopo: '<p>Elaboração do projeto executivo das instalações elétricas.</p>',
    });
    expect(r).toBe('Elaboração do projeto executivo das instalações elétricas.');
  });

  it('tira o marcador da lista quando o escopo começa com tópicos', () => {
    const r = resumirOrcamento({ escopo: '<ul><li>Levantamento de cargas</li></ul>' });
    expect(r).toBe('Levantamento de cargas');
  });

  it('lê escopo antigo em texto puro', () => {
    const r = resumirOrcamento({ escopo: '- Dimensionamento dos alimentadores\n- Diagramas' });
    expect(r).toBe('Dimensionamento dos alimentadores');
  });

  it('pula linhas em branco do começo do escopo', () => {
    const r = resumirOrcamento({ escopo: '<p></p><p>Inspeção termográfica</p>' });
    expect(r).toBe('Inspeção termográfica');
  });

  it('devolve vazio quando não há nada preenchido', () => {
    // aí o cartão mantém o título da oportunidade
    expect(resumirOrcamento({})).toBe('');
    expect(resumirOrcamento({ serviceType: null, primeiroItem: '', escopo: '<p></p>' })).toBe('');
  });

  it('encurta texto longo sem cortar palavra ao meio', () => {
    const longo = 'Elaboração de projeto executivo de instalações elétricas de baixa tensão para o galpão industrial';
    const r = resumirOrcamento({ serviceType: longo });
    expect(r.length).toBeLessThanOrEqual(73);
    expect(r.endsWith('…')).toBe(true);
    // não termina no meio de uma palavra
    expect(longo.startsWith(r.slice(0, -1))).toBe(true);
    expect(r.slice(0, -1).endsWith(' ')).toBe(false);
  });

  it('junta espaços e quebras para caber numa linha do cartão', () => {
    const r = resumirOrcamento({ serviceType: 'Projeto\n\n  elétrico   executivo' });
    expect(r).toBe('Projeto elétrico executivo');
  });

  it('não deixa pontuação solta antes das reticências', () => {
    const r = resumirOrcamento({
      serviceType: 'Consultoria técnica especializada em sistemas de média tensão, com apoio',
    });
    expect(r).not.toContain(',…');
  });
});
