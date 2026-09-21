import 'server-only';
import { z } from 'zod';
import {
  atualizarRascunho, buscarCliente, cancelarRascunho, catalogoDeServicos, criarRascunho,
  historicoDoCliente, parametrosComerciais, propostasSemelhantes, rascunhoAtivo,
} from '@/server/services/orcamento-ia';
import { proporCriarCliente, proporGerarProposta, type NovoClienteInput } from '@/server/services/agente-acoes';
import { ItemDoRascunhoSchema, OperacaoSchema, ReferenciaSchema } from '@/lib/orcamento-rascunho';
import type { Ferramenta } from './manager-tools';

/**
 * Ferramentas comerciais do Jarvis — orçamentos e propostas por conversa.
 *
 * Leitura: cliente, catálogo (preço atual + histórico praticado), histórico
 * do cliente, propostas semelhantes (base de conhecimento) e parâmetros.
 * Escrita: o RASCUNHO (nunca o orçamento oficial) e a PROPOSTA de gerar —
 * que só executa no clique de confirmação da pessoa.
 */

const objeto = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object', properties, required, additionalProperties: false,
});

const ITEM_JSON = objeto({
  descricao: { type: 'string', description: 'Nome do serviço como vai na proposta' },
  serviceCatalogId: { type: 'string', description: 'Id do serviço do catálogo, quando for um' },
  codigoServico: { type: 'string' },
  disciplina: { type: 'string' },
  unidade: { type: 'string', description: 'vb, un, m², h…' },
  quantidade: { type: 'number' },
  precoUnitario: { type: 'number', description: 'Em reais. Vem do catálogo, do histórico ou da pessoa — nunca inventado' },
  custoUnitario: { type: 'number' },
  origemDoPreco: { type: 'string', enum: ['catalogo', 'historico', 'usuario', 'sem_referencia'] },
}, ['descricao', 'precoUnitario', 'origemDoPreco']);

const REFERENCIA_JSON = objeto({
  tipo: { type: 'string', enum: ['orcamento_historico', 'preco_catalogo', 'parametro_padrao', 'declaracao_usuario'] },
  codigo: { type: 'string' },
  descricao: { type: 'string' },
  valor: { type: 'string' },
}, ['tipo', 'descricao']);

export const FERRAMENTAS_COMERCIAIS: Ferramenta[] = [
  {
    nome: 'buscar_cliente',
    descricao: 'Localiza o cliente pelo nome, razão social, CNPJ/CPF ou e-mail: id, segmento, cidade, contatos, unidades e quantos orçamentos já tem. Sempre o primeiro passo de um orçamento.',
    permissao: 'client:read',
    schema: z.object({ termo: z.string().min(2).max(120) }).strict() as z.ZodType<Record<string, unknown>>,
    parametros: objeto({ termo: { type: 'string' } }, ['termo']),
    executar: (user, args) => buscarCliente(user, String(args.termo)),
  },
  {
    nome: 'propor_criar_cliente',
    descricao: 'Propõe CADASTRAR um cliente novo (e o contato responsável, se houver). NADA é criado agora: a pessoa confirma (dupla confirmação). Antes, use buscar_cliente para garantir que não existe. Só o nome é obrigatório; NUNCA invente CNPJ/CPF, e-mail ou telefone — deixe vazio o que a pessoa não disse. Órgão, empresa ou entidade é JURIDICA. Depois de chamar, diga que aguarda a confirmação.',
    permissao: 'client:write',
    tipo: 'escrita',
    schema: z.object({
      tipoPessoa: z.enum(['JURIDICA', 'FISICA']),
      nome: z.string().min(2).max(200),
      nomeFantasia: z.string().max(200).optional(),
      documento: z.string().max(20).optional(),
      email: z.string().email().max(200).optional(),
      telefone: z.string().max(30).optional(),
      cidade: z.string().max(80).optional(),
      estado: z.string().length(2).optional(),
      segmento: z.string().max(80).optional(),
      contatoNome: z.string().min(2).max(120).optional(),
      contatoCargo: z.string().max(120).optional(),
      contatoEmail: z.string().email().max(200).optional(),
      contatoTelefone: z.string().max(30).optional(),
    }).strict() as z.ZodType<Record<string, unknown>>,
    parametros: objeto({
      tipoPessoa: { type: 'string', enum: ['JURIDICA', 'FISICA'] },
      nome: { type: 'string', description: 'Razão social ou nome completo' },
      nomeFantasia: { type: 'string' },
      documento: { type: 'string', description: 'CNPJ ou CPF, só se a pessoa informou' },
      email: { type: 'string' },
      telefone: { type: 'string' },
      cidade: { type: 'string' },
      estado: { type: 'string', description: 'UF, 2 letras' },
      segmento: { type: 'string' },
      contatoNome: { type: 'string', description: 'Pessoa responsável no cliente' },
      contatoCargo: { type: 'string' },
      contatoEmail: { type: 'string' },
      contatoTelefone: { type: 'string' },
    }, ['tipoPessoa', 'nome']),
    executar: (user, args, ctx) => proporCriarCliente(user, ctx.threadId, args as NovoClienteInput),
  },
  {
    nome: 'catalogo_de_servicos',
    descricao: 'Serviços do catálogo com PREÇO DE TABELA ATUAL (fato), HISTÓRICO PRATICADO (referência: mediana/último/menor/maior e nº de amostras) e os modelos oficiais de escopo, premissas e exclusões. Sem termo, lista tudo.',
    permissao: 'budget:read',
    schema: z.object({ termo: z.string().max(120).optional() }).strict() as z.ZodType<Record<string, unknown>>,
    parametros: objeto({ termo: { type: 'string', description: 'Parte do nome, código, categoria ou disciplina (opcional)' } }),
    executar: (user, args) => catalogoDeServicos(user, args.termo ? String(args.termo) : undefined),
  },
  {
    nome: 'historico_do_cliente',
    descricao: 'Orçamentos e propostas anteriores de um cliente: itens, preços, prazo, pagamento e desfecho. Use para "quanto cobramos da última vez" e para manter coerência de preço com o mesmo cliente.',
    permissao: 'budget:read',
    schema: z.object({ clienteId: z.string().min(1) }).strict() as z.ZodType<Record<string, unknown>>,
    parametros: objeto({ clienteId: { type: 'string' } }, ['clienteId']),
    executar: (user, args) => historicoDoCliente(user, String(args.clienteId)),
  },
  {
    nome: 'propostas_semelhantes',
    descricao: 'Base de conhecimento comercial: propostas passadas parecidas com o pedido (busca semântica + serviço, segmento, região, porte, recência e desfecho). Cada resultado traz valor, data e desfecho — REFERÊNCIA HISTÓRICA, não preço atual. Use para fundamentar a sugestão de preço e para "por que esse valor?".',
    permissao: 'budget:read',
    schema: z.object({
      descricao: z.string().min(5).max(600),
      tipoDeServico: z.string().max(120).optional(),
      segmento: z.string().max(80).optional(),
      cidade: z.string().max(80).optional(),
      estado: z.string().max(2).optional(),
      area: z.number().positive().optional(),
      clienteId: z.string().optional(),
      disciplinas: z.array(z.string().max(60)).max(10).optional(),
    }).strict() as z.ZodType<Record<string, unknown>>,
    parametros: objeto({
      descricao: { type: 'string', description: 'O pedido em uma frase, ex.: "projeto elétrico galpão industrial 4.500 m² Rondonópolis"' },
      tipoDeServico: { type: 'string' },
      segmento: { type: 'string' },
      cidade: { type: 'string' },
      estado: { type: 'string', description: 'UF' },
      area: { type: 'number', description: 'm²' },
      clienteId: { type: 'string' },
      disciplinas: { type: 'array', items: { type: 'string' } },
    }, ['descricao']),
    executar: (user, args) => propostasSemelhantes(user, {
      descricao: String(args.descricao),
      tipoDeServico: args.tipoDeServico ? String(args.tipoDeServico) : undefined,
      segmento: args.segmento ? String(args.segmento) : undefined,
      cidade: args.cidade ? String(args.cidade) : undefined,
      estado: args.estado ? String(args.estado) : undefined,
      area: typeof args.area === 'number' ? args.area : undefined,
      clienteId: args.clienteId ? String(args.clienteId) : undefined,
      disciplinas: Array.isArray(args.disciplinas) ? (args.disciplinas as string[]) : undefined,
    }),
  },
  {
    nome: 'parametros_comerciais',
    descricao: 'Regras comerciais configuradas: desconto máximo, margem mínima, valor limite sem aprovação, validade padrão, prazo e pagamento padrão. Use os padrões em vez de perguntar.',
    permissao: 'budget:read',
    schema: z.object({}).strict() as z.ZodType<Record<string, unknown>>,
    parametros: objeto({}),
    executar: (user) => parametrosComerciais(user.companyId),
  },
  {
    nome: 'ver_rascunho_de_orcamento',
    descricao: 'O rascunho em elaboração nesta conversa: itens, totais, avisos comerciais, faltantes e as referências usadas (para explicar o preço).',
    permissao: 'budget:read',
    tipo: 'escrita', // precisa da conversa (threadId), embora só leia
    schema: z.object({}).strict() as z.ZodType<Record<string, unknown>>,
    parametros: objeto({}),
    executar: async (user, _args, ctx) => (await rascunhoAtivo(user, ctx.threadId)) ?? { semRascunho: true },
  },
  {
    nome: 'criar_rascunho_de_orcamento',
    descricao: 'Cria o RASCUNHO do orçamento nesta conversa (não é o orçamento oficial). Exige clienteId (de buscar_cliente) e itens com preço rotulado. Prazo, pagamento e validade sem valor caem nos padrões configurados. Substitui o rascunho anterior da conversa. Depois, apresente o resumo e pergunte se gera a proposta.',
    permissao: 'budget:write',
    tipo: 'escrita',
    schema: z.object({
      clienteId: z.string().min(1),
      clienteNome: z.string().min(1),
      contatoId: z.string().nullable().optional(),
      unidadeId: z.string().nullable().optional(),
      tipoDeServico: z.string().max(120).optional(),
      itens: z.array(ItemDoRascunhoSchema).min(1).max(50),
      descontoReais: z.number().min(0).optional(),
      escopo: z.string().max(20_000).optional(),
      premissas: z.string().max(10_000).optional(),
      exclusoes: z.string().max(10_000).optional(),
      prazoExecucao: z.string().max(300).optional(),
      formaPagamento: z.string().max(500).optional(),
      validadeDias: z.number().int().positive().max(365).optional(),
      observacoes: z.string().max(2_000).optional(),
      referencias: z.array(ReferenciaSchema).max(40).optional(),
    }).strict() as z.ZodType<Record<string, unknown>>,
    parametros: objeto({
      clienteId: { type: 'string' },
      clienteNome: { type: 'string' },
      contatoId: { type: 'string' },
      unidadeId: { type: 'string' },
      tipoDeServico: { type: 'string', description: 'Ex.: Projeto elétrico industrial' },
      itens: { type: 'array', items: ITEM_JSON },
      descontoReais: { type: 'number' },
      escopo: { type: 'string', description: 'Texto do escopo, uma linha por item começando com "- ". Redija a partir do modelo do catálogo; NÃO acrescente serviços não contratados' },
      premissas: { type: 'string' },
      exclusoes: { type: 'string' },
      prazoExecucao: { type: 'string' },
      formaPagamento: { type: 'string' },
      validadeDias: { type: 'integer' },
      observacoes: { type: 'string' },
      referencias: { type: 'array', items: REFERENCIA_JSON, description: 'Evidências usadas na sugestão de preço' },
    }, ['clienteId', 'clienteNome', 'itens']),
    executar: (user, args, ctx) => criarRascunho(user, ctx.threadId, args),
  },
  {
    nome: 'alterar_rascunho_de_orcamento',
    descricao: 'Altera o MESMO rascunho da conversa por operações determinísticas: adicionar_item, remover_item, definir_preco, definir_quantidade, aumentar_percentual (item ou todos; negativo reduz), definir_total (arredondar), desconto_percentual, desconto_reais, acrescimo_reais, definir_pagamento, definir_prazo, definir_validade, definir_escopo, definir_premissas, definir_exclusoes, definir_tipo_servico, definir_contato, definir_observacoes, adicionar_referencia. "item" aceita parte do nome.',
    permissao: 'budget:write',
    tipo: 'escrita',
    schema: z.object({ operacoes: z.array(OperacaoSchema).min(1).max(20) }).strict() as z.ZodType<Record<string, unknown>>,
    parametros: objeto({
      operacoes: {
        type: 'array',
        items: objeto({
          op: { type: 'string', enum: ['adicionar_item', 'remover_item', 'definir_preco', 'definir_quantidade', 'aumentar_percentual', 'definir_total', 'desconto_percentual', 'desconto_reais', 'acrescimo_reais', 'definir_pagamento', 'definir_prazo', 'definir_validade', 'definir_escopo', 'definir_premissas', 'definir_exclusoes', 'definir_tipo_servico', 'definir_contato', 'definir_observacoes', 'adicionar_referencia'] },
          item: { description: 'Nome (ou parte) do item alvo, ou o item completo em adicionar_item', anyOf: [{ type: 'string' }, ITEM_JSON] },
          precoUnitario: { type: 'number' },
          quantidade: { type: 'number' },
          percentual: { type: 'number' },
          total: { type: 'number' },
          valor: { type: 'number' },
          texto: { type: 'string' },
          dias: { type: 'integer' },
          contatoId: { type: 'string' },
          referencia: REFERENCIA_JSON,
        }, ['op']),
      },
    }, ['operacoes']),
    executar: (user, args, ctx) => atualizarRascunho(user, ctx.threadId, args.operacoes as never),
  },
  {
    nome: 'cancelar_rascunho_de_orcamento',
    descricao: 'Descarta o rascunho em elaboração nesta conversa.',
    permissao: 'budget:write',
    tipo: 'escrita',
    schema: z.object({}).strict() as z.ZodType<Record<string, unknown>>,
    parametros: objeto({}),
    executar: (user, _args, ctx) => cancelarRascunho(user, ctx.threadId),
  },
  {
    nome: 'propor_gerar_proposta',
    descricao: 'Propõe transformar o rascunho desta conversa em orçamento oficial + proposta em PDF. NADA é gerado agora: a pessoa confirma no cartão (dupla confirmação). Só chame quando o rascunho não tiver faltantes obrigatórios e a pessoa pedir para gerar. Depois de chamar, diga que aguarda a confirmação.',
    permissao: 'proposal:write',
    tipo: 'escrita',
    schema: z.object({}).strict() as z.ZodType<Record<string, unknown>>,
    parametros: objeto({}),
    executar: (user, _args, ctx) => proporGerarProposta(user, ctx.threadId),
  },
];
