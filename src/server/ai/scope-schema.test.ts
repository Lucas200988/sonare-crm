import { describe, expect, it } from 'vitest';
import {
  montarEscopo, montarItens, montarPrazo, montarPremissas,
  paraOrcamento, parseEscopo, type EscopoGerado,
} from './scope-schema';

const COMPLETO = {
  status: 'pronto_com_premissas',
  titulo_servico: 'PROJETO EXECUTIVO DE INSTALAÇÕES ELÉTRICAS EM BAIXA TENSÃO',
  resumo_executivo: 'Projeto elétrico para galpão industrial de 1.200 m².',
  objeto_proposta: 'Elaboração do projeto executivo de instalações elétricas do galpão.',
  contexto_justificativa: 'A unidade opera com quadro sobrecarregado desde a ampliação.',
  escopo_detalhado: [
    { etapa: 'Levantamento de informações', atividades: ['Coleta de plantas', 'Relação de cargas'] },
    { etapa: 'Estudos e cálculos', atividades: ['Dimensionamento dos alimentadores'] },
  ],
  entregaveis: ['Memorial descritivo', 'Diagramas unifilares'],
  premissas: ['Plantas arquitetônicas serão fornecidas em DWG'],
  responsabilidades_contratante: ['Garantir acesso às instalações'],
  exclusoes: ['Execução de obras', 'Fornecimento de materiais'],
  normas_referencias: ['ABNT NBR 5410'],
  responsabilidade_tecnica: 'Será emitida ART junto ao CREA competente.',
  prazo: { duracao: '30 dias corridos', marco_inicial: 'aprovação da proposta', observacoes: '' },
  revisoes: 'Dois ciclos de revisão contemplados.',
  beneficios_contratante: ['Redução de retrabalhos'],
  informacoes_confirmadas: ['Área de 1.200 m²'],
  informacoes_inferidas: ['Tensão de atendimento 380/220 V'],
  pontos_a_confirmar: ['Existe projeto anterior?'],
  riscos_orcamentarios: [
    { item: 'Ampliação futura', impacto: 'alto', justificativa: 'Muda o dimensionamento.' },
  ],
  servicos_opcionais: [{ servico: 'Estudo de seletividade', motivo: 'Recomendado com a nova carga.' }],
  perguntas_necessarias: ['O escopo inclui aprovação na concessionária?'],
  resumo_whatsapp: 'Segue proposta do projeto elétrico do galpão.',
  observacoes_internas: ['Cliente já recusou visita adicional.'],
};

const g = () => parseEscopo(JSON.stringify(COMPLETO));

describe('parseEscopo', () => {
  it('lê a resposta completa', () => {
    const r = g();
    expect(r.status).toBe('pronto_com_premissas');
    expect(r.escopoDetalhado).toHaveLength(2);
    expect(r.riscosOrcamentarios[0].impacto).toBe('alto');
  });

  it('aceita o JSON embrulhado em bloco markdown', () => {
    // o prompt proíbe, mas alguns modelos insistem — perder tudo por três crases seria burrice
    const r = parseEscopo('```json\n' + JSON.stringify(COMPLETO) + '\n```');
    expect(r.tituloServico).toContain('PROJETO EXECUTIVO');
  });

  it('não quebra com campos ausentes', () => {
    const r = parseEscopo('{"objeto_proposta":"Só isso."}');
    expect(r.objetoProposta).toBe('Só isso.');
    expect(r.entregaveis).toEqual([]);
    expect(r.prazo.duracao).toBe('');
  });

  it('status desconhecido vira "pronto_com_premissas"', () => {
    // nunca assumir "pronto": o comercial precisa conferir antes de mandar
    expect(parseEscopo('{"status":"qualquer"}').status).toBe('pronto_com_premissas');
  });

  it('impacto fora da escala vira médio', () => {
    const r = parseEscopo('{"riscos_orcamentarios":[{"item":"X","impacto":"gigante"}]}');
    expect(r.riscosOrcamentarios[0].impacto).toBe('medio');
  });

  it('corta em cinco perguntas mesmo se o modelo exagerar', () => {
    const muitas = JSON.stringify({ perguntas_necessarias: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] });
    expect(parseEscopo(muitas).perguntasNecessarias).toHaveLength(5);
  });

  it('descarta risco e serviço opcional sem nome', () => {
    const r = parseEscopo('{"riscos_orcamentarios":[{"item":""}],"servicos_opcionais":[{"servico":""}]}');
    expect(r.riscosOrcamentarios).toEqual([]);
    expect(r.servicosOpcionais).toEqual([]);
  });
});

describe('montarEscopo', () => {
  it('põe objeto, contexto, etapas, entregáveis e normas na ordem de leitura', () => {
    const texto = montarEscopo(g());
    const pos = (s: string) => texto.indexOf(s);
    expect(pos('Elaboração do projeto executivo')).toBeGreaterThanOrEqual(0);
    expect(pos('A unidade opera')).toBeGreaterThan(pos('Elaboração do projeto executivo'));
    expect(pos('Levantamento de informações')).toBeGreaterThan(pos('A unidade opera'));
    expect(pos('Entregáveis')).toBeGreaterThan(pos('Estudos e cálculos'));
    expect(pos('Responsabilidade técnica')).toBeGreaterThan(pos('Entregáveis'));
  });

  it('cada atividade vira uma linha com hífen', () => {
    expect(montarEscopo(g())).toContain('- Coleta de plantas');
  });

  it('não deixa título de bloco vazio quando a lista não veio', () => {
    const vazio = parseEscopo('{"objeto_proposta":"Apenas o objeto."}');
    const texto = montarEscopo(vazio);
    expect(texto).toBe('Apenas o objeto.');
    expect(texto).not.toContain('Entregáveis');
  });
});

describe('montarPremissas', () => {
  it('junta premissas, responsabilidades do contratante e revisões', () => {
    const texto = montarPremissas(g());
    expect(texto).toContain('- Plantas arquitetônicas');
    expect(texto).toContain('Responsabilidades do contratante');
    expect(texto).toContain('- Garantir acesso');
    expect(texto).toContain('Dois ciclos de revisão');
  });
});

describe('montarPrazo', () => {
  it('mantém o marco inicial junto da duração', () => {
    // "30 dias" sem marco inicial é a origem da discussão depois
    expect(montarPrazo(g())).toBe('30 dias corridos — contados a partir de: aprovação da proposta');
  });

  it('devolve vazio quando não há prazo, em vez de inventar', () => {
    expect(montarPrazo(parseEscopo('{}'))).toBe('');
  });
});

describe('montarItens', () => {
  it('cria uma linha em verba por etapa, sem preço', () => {
    const itens = montarItens(g());
    expect(itens).toEqual([
      { description: 'Levantamento de informações', unit: 'vb', quantity: '1' },
      { description: 'Estudos e cálculos', unit: 'vb', quantity: '1' },
    ]);
  });

  it('ignora etapa sem nome', () => {
    const semNome = { escopoDetalhado: [{ etapa: '', atividades: ['x'] }] } as EscopoGerado;
    expect(montarItens(semNome)).toEqual([]);
  });
});

describe('paraOrcamento', () => {
  it('separa o que vai ao cliente do que fica com o comercial', () => {
    const r = paraOrcamento(g());
    // dúvidas e riscos não podem vazar para o texto da proposta
    expect(r.scope).not.toContain('O escopo inclui aprovação na concessionária?');
    expect(r.scope).not.toContain('Cliente já recusou visita adicional');
    expect(r.premises).not.toContain('Ampliação futura');
    expect(r.analise.perguntas).toHaveLength(1);
    expect(r.analise.observacoesInternas[0]).toContain('recusou visita');
    expect(r.analise.riscos[0].item).toBe('Ampliação futura');
  });

  it('exclusões saem como lista com hífen', () => {
    expect(paraOrcamento(g()).exclusions).toBe('- Execução de obras\n- Fornecimento de materiais');
  });
});
