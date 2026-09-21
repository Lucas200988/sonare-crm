import { describe, expect, it } from 'vitest';
import {
  RascunhoSchema, aplicarOperacoes, avisosComerciais, faltantesDoRascunho,
  resumoDoRascunho, totaisDoRascunho, type Rascunho,
} from './orcamento-rascunho';

/**
 * Cada comando de conversa da spec vira uma operação determinística. Aqui
 * eles são testados como o código os executa — sem LLM no caminho.
 */

const base = (): Rascunho => RascunhoSchema.parse({
  clienteId: 'c1', clienteNome: 'Indústria X',
  itens: [
    { descricao: 'Projeto elétrico', precoUnitario: 18_500, origemDoPreco: 'historico' },
    { descricao: 'Projeto de SPDA', precoUnitario: 6_500, origemDoPreco: 'catalogo' },
    { descricao: 'Cabeamento estruturado', precoUnitario: 4_800, origemDoPreco: 'catalogo' },
  ],
  escopo: '- Projeto elétrico.',
  prazoExecucao: '30 dias', formaPagamento: '30% + 40% + 30%', validadeDias: 15,
});

describe('rascunho de orçamento — totais pelo motor do módulo', () => {
  it('soma itens, desconto e acréscimo com o budget-calc', () => {
    const t = totaisDoRascunho(base());
    expect(t.subtotal).toBe(29_800);
    expect(t.total).toBe(29_800);
    expect(t.desconto).toBe(0);
  });

  it('o resumo é o texto do cartão e da conversa', () => {
    const r = resumoDoRascunho(base());
    expect(r).toContain('Cliente: Indústria X');
    expect(r).toContain('Total: R$');
    expect(r).toContain('29.800,00');
    expect(r).toContain('Prazo: 30 dias');
  });
});

describe('comandos de conversa → operações', () => {
  it('"SPDA ficou barato, coloca 8 mil" → definir_preco por parte do nome', () => {
    const r = aplicarOperacoes(base(), [{ op: 'definir_preco', item: 'SPDA', precoUnitario: 8_000 }]);
    if ('error' in r) throw new Error(r.error);
    expect(r.rascunho.itens[1].precoUnitario).toBe(8_000);
    expect(r.rascunho.itens[1].origemDoPreco).toBe('usuario');
    expect(totaisDoRascunho(r.rascunho).total).toBe(31_300);
  });

  it('"Retire o SPDA" → remover_item', () => {
    const r = aplicarOperacoes(base(), [{ op: 'remover_item', item: 'spda' }]);
    if ('error' in r) throw new Error(r.error);
    expect(r.rascunho.itens.map((i) => i.descricao)).toEqual(['Projeto elétrico', 'Cabeamento estruturado']);
  });

  it('"Adicione CFTV por 4.500" → adicionar_item', () => {
    const r = aplicarOperacoes(base(), [{
      op: 'adicionar_item', item: { descricao: 'Projeto de CFTV', precoUnitario: 4_500, quantidade: 1, origemDoPreco: 'usuario' },
    }]);
    if ('error' in r) throw new Error(r.error);
    expect(r.rascunho.itens).toHaveLength(4);
    expect(totaisDoRascunho(r.rascunho).total).toBe(34_300);
  });

  it('"Aumente 10%" → aumentar_percentual em todos; "aumente o elétrico 10%" → só no item', () => {
    const todos = aplicarOperacoes(base(), [{ op: 'aumentar_percentual', percentual: 10 }]);
    if ('error' in todos) throw new Error(todos.error);
    expect(totaisDoRascunho(todos.rascunho).subtotal).toBe(32_780);

    const um = aplicarOperacoes(base(), [{ op: 'aumentar_percentual', item: 'elétrico', percentual: 10 }]);
    if ('error' in um) throw new Error(um.error);
    expect(um.rascunho.itens[0].precoUnitario).toBe(20_350);
    expect(um.rascunho.itens[1].precoUnitario).toBe(6_500);
  });

  it('"Arredonde para 30 mil" → definir_total vira acréscimo/desconto global, itens intactos', () => {
    const r = aplicarOperacoes(base(), [{ op: 'definir_total', total: 30_000 }]);
    if ('error' in r) throw new Error(r.error);
    expect(r.rascunho.itens[0].precoUnitario).toBe(18_500);
    expect(r.rascunho.acrescimoReais).toBe(200);
    expect(totaisDoRascunho(r.rascunho).total).toBe(30_000);

    const menor = aplicarOperacoes(base(), [{ op: 'definir_total', total: 28_000 }]);
    if ('error' in menor) throw new Error(menor.error);
    expect(menor.rascunho.descontoReais).toBe(1_800);
    expect(totaisDoRascunho(menor.rascunho).total).toBe(28_000);
  });

  it('"Dê 5% de desconto" → desconto sobre o subtotal', () => {
    const r = aplicarOperacoes(base(), [{ op: 'desconto_percentual', percentual: 5 }]);
    if ('error' in r) throw new Error(r.error);
    expect(r.rascunho.descontoReais).toBe(1_490);
    expect(totaisDoRascunho(r.rascunho).total).toBe(28_310);
  });

  it('"Pagamento 30% de entrada e restante na entrega" / "prazo 45 dias" / "validade 15 dias"', () => {
    const r = aplicarOperacoes(base(), [
      { op: 'definir_pagamento', texto: '30% de entrada e 70% na entrega' },
      { op: 'definir_prazo', texto: '45 dias corridos' },
      { op: 'definir_validade', dias: 15 },
    ]);
    if ('error' in r) throw new Error(r.error);
    expect(r.rascunho.formaPagamento).toBe('30% de entrada e 70% na entrega');
    expect(r.rascunho.prazoExecucao).toBe('45 dias corridos');
    expect(r.rascunho.validadeDias).toBe(15);
    expect(r.alteracoes).toHaveLength(3);
  });

  it('item inexistente ou ambíguo não altera nada e explica', () => {
    const nada = aplicarOperacoes(base(), [{ op: 'definir_preco', item: 'hidráulico', precoUnitario: 1 }]);
    expect('error' in nada && nada.error).toContain('Não há item');
    const ambiguo = aplicarOperacoes(base(), [{ op: 'remover_item', item: 'projeto' }]);
    expect('error' in ambiguo && ambiguo.error).toContain('mais de um item');
  });

  it('não deixa o rascunho sem itens', () => {
    const so = RascunhoSchema.parse({ ...base(), itens: [base().itens[0]] });
    const r = aplicarOperacoes(so, [{ op: 'remover_item', item: 'elétrico' }]);
    expect('error' in r && r.error).toContain('ao menos um item');
  });
});

describe('guardrails e faltantes', () => {
  const regras = { maxDiscountPercent: 10, minMarginPercent: 20, maxValueWithoutApproval: 100_000 };

  it('"Dê 20%" com máximo de 10% → aviso de aprovação interna, não bloqueio silencioso', () => {
    const r = aplicarOperacoes(base(), [{ op: 'desconto_percentual', percentual: 20 }]);
    if ('error' in r) throw new Error(r.error);
    const avisos = avisosComerciais(r.rascunho, regras);
    expect(avisos.some((a) => a.includes('desconto acima do máximo comercial (10%)'))).toBe(true);
    expect(avisosComerciais(base(), regras)).toEqual([]);
  });

  it('classifica faltantes em obrigatórios e recomendáveis', () => {
    const semNada = RascunhoSchema.parse({
      clienteId: 'c1', clienteNome: 'X',
      itens: [{ descricao: 'Serviço', precoUnitario: 0, origemDoPreco: 'sem_referencia' }],
    });
    const f = faltantesDoRascunho(semNada);
    expect(f.obrigatorios).toEqual(['preço de todos os itens', 'escopo dos serviços']);
    expect(f.recomendaveis).toEqual(['prazo de execução', 'forma de pagamento', 'exclusões']);
    expect(faltantesDoRascunho(base()).obrigatorios).toEqual([]);
  });

  it('o schema recusa preço inventado fora do domínio e itens vazios', () => {
    expect(RascunhoSchema.safeParse({ clienteId: 'c1', clienteNome: 'X', itens: [] }).success).toBe(false);
    expect(RascunhoSchema.safeParse({
      clienteId: 'c1', clienteNome: 'X',
      itens: [{ descricao: 'S', precoUnitario: -5, origemDoPreco: 'usuario' }],
    }).success).toBe(false);
  });
});
