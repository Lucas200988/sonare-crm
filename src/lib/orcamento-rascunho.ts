import { z } from 'zod';
import { approvalTriggers, computeBudgetTotals, type ApprovalRules } from './budget-calc';
import { formatBRL } from './money';

/**
 * O rascunho de orçamento que o Jarvis monta em conversa.
 *
 * É a estrutura tipada da "intenção de orçamento" (QuoteIntent): tudo que o
 * modelo extrai passa por este schema antes de existir. Nada aqui calcula
 * preço — quem soma é o motor do módulo (budget-calc), quem decide preço é
 * o catálogo, o histórico ou a pessoa. O LLM só preenche e explica.
 *
 * Puro e testável: sem banco, sem rede.
 */

export const ORIGENS_DE_PRECO = ['catalogo', 'historico', 'usuario', 'sem_referencia'] as const;
export type OrigemDePreco = (typeof ORIGENS_DE_PRECO)[number];

export const ItemDoRascunhoSchema = z.object({
  descricao: z.string().trim().min(2).max(300),
  serviceCatalogId: z.string().nullable().optional(),
  codigoServico: z.string().nullable().optional(),
  disciplina: z.string().max(60).nullable().optional(),
  unidade: z.string().max(20).nullable().optional(),
  quantidade: z.number().positive().max(1_000_000).default(1),
  precoUnitario: z.number().min(0).max(100_000_000),
  custoUnitario: z.number().min(0).max(100_000_000).nullable().optional(),
  /** De onde veio o preço — a rastreabilidade que a explicação usa. */
  origemDoPreco: z.enum(ORIGENS_DE_PRECO).default('sem_referencia'),
});
export type ItemDoRascunho = z.infer<typeof ItemDoRascunhoSchema>;

export const ReferenciaSchema = z.object({
  tipo: z.enum(['orcamento_historico', 'preco_catalogo', 'parametro_padrao', 'declaracao_usuario']),
  codigo: z.string().nullable().optional(),
  descricao: z.string().max(300),
  valor: z.string().nullable().optional(),
});
export type Referencia = z.infer<typeof ReferenciaSchema>;

export const RascunhoSchema = z.object({
  clienteId: z.string().min(1),
  clienteNome: z.string().min(1),
  contatoId: z.string().nullable().optional(),
  unidadeId: z.string().nullable().optional(),
  tipoDeServico: z.string().max(120).nullable().optional(),
  itens: z.array(ItemDoRascunhoSchema).min(1).max(50),
  descontoReais: z.number().min(0).default(0),
  acrescimoReais: z.number().min(0).default(0),
  escopo: z.string().max(20_000).default(''),
  premissas: z.string().max(10_000).default(''),
  exclusoes: z.string().max(10_000).default(''),
  prazoExecucao: z.string().max(300).default(''),
  formaPagamento: z.string().max(500).default(''),
  validadeDias: z.number().int().positive().max(365).default(60),
  observacoes: z.string().max(2_000).default(''),
  /** Evidências usadas — a base do "por que sugeriu esse valor?". */
  referencias: z.array(ReferenciaSchema).max(40).default([]),
});
export type Rascunho = z.infer<typeof RascunhoSchema>;

// ---------- Operações de edição por conversa ----------

/**
 * Cada frase de alteração vira UMA operação determinística. O modelo
 * escolhe a operação; o código aplica. "Aumente 10%" não é o LLM
 * recalculando preço de cabeça — é `aumentar_percentual`.
 */
export const OperacaoSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('adicionar_item'), item: ItemDoRascunhoSchema }),
  z.object({ op: z.literal('remover_item'), item: z.string().min(1) }),
  z.object({ op: z.literal('definir_preco'), item: z.string().min(1), precoUnitario: z.number().min(0) }),
  z.object({ op: z.literal('definir_quantidade'), item: z.string().min(1), quantidade: z.number().positive() }),
  z.object({ op: z.literal('aumentar_percentual'), item: z.string().nullable().optional(), percentual: z.number().gt(-100).lte(1000) }),
  z.object({ op: z.literal('definir_total'), total: z.number().positive() }),
  z.object({ op: z.literal('desconto_percentual'), percentual: z.number().min(0).max(100) }),
  z.object({ op: z.literal('desconto_reais'), valor: z.number().min(0) }),
  z.object({ op: z.literal('acrescimo_reais'), valor: z.number().min(0) }),
  z.object({ op: z.literal('definir_pagamento'), texto: z.string().max(500) }),
  z.object({ op: z.literal('definir_prazo'), texto: z.string().max(300) }),
  z.object({ op: z.literal('definir_validade'), dias: z.number().int().positive().max(365) }),
  z.object({ op: z.literal('definir_escopo'), texto: z.string().max(20_000) }),
  z.object({ op: z.literal('definir_premissas'), texto: z.string().max(10_000) }),
  z.object({ op: z.literal('definir_exclusoes'), texto: z.string().max(10_000) }),
  z.object({ op: z.literal('definir_tipo_servico'), texto: z.string().max(120) }),
  z.object({ op: z.literal('definir_contato'), contatoId: z.string().nullable() }),
  z.object({ op: z.literal('definir_observacoes'), texto: z.string().max(2_000) }),
  z.object({ op: z.literal('adicionar_referencia'), referencia: ReferenciaSchema }),
]);
export type Operacao = z.infer<typeof OperacaoSchema>;

const dinheiro = (n: number) => Math.round(n * 100) / 100;

/** Item pelo nome (parcial, sem acento/caixa) — "SPDA" acha "Projeto de SPDA". */
function acharItem(itens: ItemDoRascunho[], termo: string): number {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const t = norm(termo.trim());
  const exato = itens.findIndex((i) => norm(i.descricao) === t || (i.codigoServico && norm(i.codigoServico) === t));
  if (exato >= 0) return exato;
  const candidatos = itens.map((i, idx) => ({ idx, ok: norm(i.descricao).includes(t) })).filter((c) => c.ok);
  if (candidatos.length === 1) return candidatos[0].idx;
  return candidatos.length === 0 ? -1 : -2; // -2 = ambíguo
}

export type ResultadoOperacao = { rascunho: Rascunho; alteracao: string } | { error: string };

export function aplicarOperacao(rascunho: Rascunho, operacao: Operacao): ResultadoOperacao {
  const r: Rascunho = { ...rascunho, itens: rascunho.itens.map((i) => ({ ...i })), referencias: [...rascunho.referencias] };

  const localizar = (termo: string): number | { error: string } => {
    const idx = acharItem(r.itens, termo);
    if (idx === -1) return { error: `Não há item "${termo}" no rascunho. Itens: ${r.itens.map((i) => i.descricao).join('; ')}.` };
    if (idx === -2) return { error: `"${termo}" combina com mais de um item — seja mais específico. Itens: ${r.itens.map((i) => i.descricao).join('; ')}.` };
    return idx;
  };

  switch (operacao.op) {
    case 'adicionar_item': {
      r.itens.push({ ...operacao.item, precoUnitario: dinheiro(operacao.item.precoUnitario) });
      return { rascunho: r, alteracao: `Item adicionado: ${operacao.item.descricao} (${formatBRL(operacao.item.precoUnitario.toFixed(2))}).` };
    }
    case 'remover_item': {
      const idx = localizar(operacao.item);
      if (typeof idx !== 'number') return idx;
      if (r.itens.length === 1) return { error: 'O rascunho precisa de ao menos um item — cancele o rascunho se quiser descartá-lo.' };
      const [removido] = r.itens.splice(idx, 1);
      return { rascunho: r, alteracao: `Item removido: ${removido.descricao}.` };
    }
    case 'definir_preco': {
      const idx = localizar(operacao.item);
      if (typeof idx !== 'number') return idx;
      const antes = r.itens[idx].precoUnitario;
      r.itens[idx] = { ...r.itens[idx], precoUnitario: dinheiro(operacao.precoUnitario), origemDoPreco: 'usuario' };
      return { rascunho: r, alteracao: `${r.itens[idx].descricao}: ${formatBRL(antes.toFixed(2))} → ${formatBRL(operacao.precoUnitario.toFixed(2))}.` };
    }
    case 'definir_quantidade': {
      const idx = localizar(operacao.item);
      if (typeof idx !== 'number') return idx;
      r.itens[idx] = { ...r.itens[idx], quantidade: operacao.quantidade };
      return { rascunho: r, alteracao: `${r.itens[idx].descricao}: quantidade ${operacao.quantidade}.` };
    }
    case 'aumentar_percentual': {
      const fator = 1 + operacao.percentual / 100;
      if (operacao.item) {
        const idx = localizar(operacao.item);
        if (typeof idx !== 'number') return idx;
        r.itens[idx] = { ...r.itens[idx], precoUnitario: dinheiro(r.itens[idx].precoUnitario * fator), origemDoPreco: 'usuario' };
        return { rascunho: r, alteracao: `${r.itens[idx].descricao}: ${operacao.percentual > 0 ? '+' : ''}${operacao.percentual}%.` };
      }
      r.itens = r.itens.map((i) => ({ ...i, precoUnitario: dinheiro(i.precoUnitario * fator), origemDoPreco: 'usuario' }));
      return { rascunho: r, alteracao: `Todos os itens: ${operacao.percentual > 0 ? '+' : ''}${operacao.percentual}%.` };
    }
    case 'definir_total': {
      // "arredonde para 30 mil": a diferença vira desconto ou acréscimo global,
      // sem mexer no preço de cada item — o cliente vê a composição íntegra
      const t = totaisDoRascunho({ ...r, descontoReais: 0, acrescimoReais: 0 });
      const alvo = dinheiro(operacao.total);
      const delta = dinheiro(alvo - t.subtotal);
      r.descontoReais = delta < 0 ? -delta : 0;
      r.acrescimoReais = delta > 0 ? delta : 0;
      return { rascunho: r, alteracao: `Total ajustado para ${formatBRL(alvo.toFixed(2))} (${delta < 0 ? 'desconto' : 'acréscimo'} de ${formatBRL(Math.abs(delta).toFixed(2))}).` };
    }
    case 'desconto_percentual': {
      const t = totaisDoRascunho({ ...r, descontoReais: 0 });
      r.descontoReais = dinheiro(t.subtotal * operacao.percentual / 100);
      return { rascunho: r, alteracao: `Desconto de ${operacao.percentual}% (${formatBRL(r.descontoReais.toFixed(2))}).` };
    }
    case 'desconto_reais':
      r.descontoReais = dinheiro(operacao.valor);
      return { rascunho: r, alteracao: `Desconto de ${formatBRL(r.descontoReais.toFixed(2))}.` };
    case 'acrescimo_reais':
      r.acrescimoReais = dinheiro(operacao.valor);
      return { rascunho: r, alteracao: `Acréscimo de ${formatBRL(r.acrescimoReais.toFixed(2))}.` };
    case 'definir_pagamento':
      r.formaPagamento = operacao.texto.trim();
      return { rascunho: r, alteracao: `Pagamento: ${r.formaPagamento}.` };
    case 'definir_prazo':
      r.prazoExecucao = operacao.texto.trim();
      return { rascunho: r, alteracao: `Prazo: ${r.prazoExecucao}.` };
    case 'definir_validade':
      r.validadeDias = operacao.dias;
      return { rascunho: r, alteracao: `Validade: ${operacao.dias} dias.` };
    case 'definir_escopo':
      r.escopo = operacao.texto.trim();
      return { rascunho: r, alteracao: 'Escopo atualizado.' };
    case 'definir_premissas':
      r.premissas = operacao.texto.trim();
      return { rascunho: r, alteracao: 'Premissas atualizadas.' };
    case 'definir_exclusoes':
      r.exclusoes = operacao.texto.trim();
      return { rascunho: r, alteracao: 'Exclusões atualizadas.' };
    case 'definir_tipo_servico':
      r.tipoDeServico = operacao.texto.trim();
      return { rascunho: r, alteracao: `Tipo de serviço: ${r.tipoDeServico}.` };
    case 'definir_contato':
      r.contatoId = operacao.contatoId;
      return { rascunho: r, alteracao: 'Solicitante definido.' };
    case 'definir_observacoes':
      r.observacoes = operacao.texto.trim();
      return { rascunho: r, alteracao: 'Observações atualizadas.' };
    case 'adicionar_referencia':
      r.referencias.push(operacao.referencia);
      return { rascunho: r, alteracao: 'Referência registrada.' };
  }
}

export function aplicarOperacoes(rascunho: Rascunho, operacoes: Operacao[]): { rascunho: Rascunho; alteracoes: string[] } | { error: string } {
  let atual = rascunho;
  const alteracoes: string[] = [];
  for (const op of operacoes) {
    const r = aplicarOperacao(atual, op);
    if ('error' in r) return r;
    atual = r.rascunho;
    alteracoes.push(r.alteracao);
  }
  return { rascunho: atual, alteracoes };
}

// ---------- Totais, avisos e faltantes ----------

export type TotaisDoRascunho = {
  subtotal: number; desconto: number; acrescimo: number; total: number;
  descontoPercentual: number; custoTotal: number; margemPercentual: number;
};

/** Soma pelo motor oficial do módulo — nunca por conta própria. */
export function totaisDoRascunho(r: Rascunho): TotaisDoRascunho {
  const t = computeBudgetTotals({
    items: r.itens.map((i) => ({
      quantity: i.quantidade, unitPrice: i.precoUnitario, unitCost: i.custoUnitario ?? 0,
    })),
    discount: r.descontoReais,
    surcharge: r.acrescimoReais,
  });
  return {
    subtotal: t.subtotal.toNumber(),
    desconto: t.discount.toNumber(),
    acrescimo: t.surcharge.toNumber(),
    total: t.total.toNumber(),
    descontoPercentual: t.discountPercent.toNumber(),
    custoTotal: t.totalCost.toNumber(),
    margemPercentual: t.marginPercent.toNumber(),
  };
}

const ROTULO_DA_REGRA: Record<string, (regras: ApprovalRules) => string> = {
  desconto_acima_maximo: (r) => `desconto acima do máximo comercial (${r.maxDiscountPercent}%)`,
  margem_abaixo_minima: (r) => `margem abaixo da mínima (${r.minMarginPercent}%)`,
  valor_acima_limite: (r) => `valor acima do limite sem aprovação (${formatBRL(String(r.maxValueWithoutApproval))})`,
};

/**
 * Guardrails comerciais em linguagem de gente: o que vai travar na
 * submissão e exigir aprovação interna. Mesma régua do módulo
 * (approvalTriggers) — o Jarvis avisa antes, o módulo cobra na hora.
 */
export function avisosComerciais(r: Rascunho, regras: ApprovalRules): string[] {
  const totais = computeBudgetTotals({
    items: r.itens.map((i) => ({ quantity: i.quantidade, unitPrice: i.precoUnitario, unitCost: i.custoUnitario ?? 0 })),
    discount: r.descontoReais,
    surcharge: r.acrescimoReais,
  });
  const avisos = approvalTriggers(totais, regras).map((t) => ROTULO_DA_REGRA[t]?.(regras) ?? t);
  for (const i of r.itens) {
    if (i.precoUnitario <= 0) avisos.push(`item sem preço: ${i.descricao}`);
  }
  return avisos;
}

export type Faltantes = { obrigatorios: string[]; recomendaveis: string[] };

/**
 * OBRIGATÓRIO trava a geração; RECOMENDÁVEL usa padrão quando existe e
 * avisa; opcional não bloqueia nada. É a classificação da spec, em código.
 */
export function faltantesDoRascunho(r: Rascunho): Faltantes {
  const obrigatorios: string[] = [];
  const recomendaveis: string[] = [];
  if (!r.clienteId) obrigatorios.push('cliente');
  if (r.itens.length === 0) obrigatorios.push('ao menos um serviço');
  if (r.itens.some((i) => i.precoUnitario <= 0)) obrigatorios.push('preço de todos os itens');
  if (!r.escopo.trim()) obrigatorios.push('escopo dos serviços');
  if (!r.prazoExecucao.trim()) recomendaveis.push('prazo de execução');
  if (!r.formaPagamento.trim()) recomendaveis.push('forma de pagamento');
  if (!r.exclusoes.trim()) recomendaveis.push('exclusões');
  return { obrigatorios, recomendaveis };
}

/** O resumo que vai para a conversa e para o cartão — sempre o mesmo texto. */
export function resumoDoRascunho(r: Rascunho): string {
  const t = totaisDoRascunho(r);
  const linhas = [`Cliente: ${r.clienteNome}`];
  for (const i of r.itens) {
    const qtd = i.quantidade !== 1 ? `${i.quantidade} ${i.unidade ?? 'un'} × ` : '';
    linhas.push(`${i.descricao}: ${qtd}${formatBRL(i.precoUnitario.toFixed(2))}${i.quantidade !== 1 ? ` = ${formatBRL((i.quantidade * i.precoUnitario).toFixed(2))}` : ''}`);
  }
  if (t.desconto > 0) linhas.push(`Desconto: - ${formatBRL(t.desconto.toFixed(2))} (${t.descontoPercentual.toFixed(1)}%)`);
  if (t.acrescimo > 0) linhas.push(`Acréscimo: ${formatBRL(t.acrescimo.toFixed(2))}`);
  linhas.push(`Total: ${formatBRL(t.total.toFixed(2))}`);
  if (r.prazoExecucao) linhas.push(`Prazo: ${r.prazoExecucao}`);
  if (r.formaPagamento) linhas.push(`Pagamento: ${r.formaPagamento}`);
  linhas.push(`Validade: ${r.validadeDias} dias`);
  return linhas.join('\n');
}
