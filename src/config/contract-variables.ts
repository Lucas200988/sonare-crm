/**
 * Variáveis que podem ser usadas nas cláusulas dos modelos de contrato.
 *
 * Espelham o objeto montado em `buildContractValues`. Ficam aqui para o editor
 * poder listá-las e para a validação avisar quando alguém digitar um nome que
 * não existe — evitando descobrir o erro só ao gerar a minuta.
 */

export type VariavelContrato = {
  caminho: string;
  descricao: string;
  exemplo: string;
};

export const VARIAVEIS_CONTRATO: Array<{ grupo: string; itens: VariavelContrato[] }> = [
  {
    grupo: 'Contrato',
    itens: [
      { caminho: 'contrato.codigo', descricao: 'Código interno', exemplo: 'CTR-2026-001' },
      { caminho: 'contrato.numero', descricao: 'Número externo (ou o código)', exemplo: '2026/014' },
      { caminho: 'contrato.objeto', descricao: 'Objeto do contrato', exemplo: 'Projeto elétrico predial' },
      { caminho: 'contrato.escopo', descricao: 'Escopo detalhado', exemplo: 'Levantamento, projeto e ART' },
      { caminho: 'contrato.valorTotal', descricao: 'Valor total formatado', exemplo: 'R$ 25.500,00' },
      { caminho: 'contrato.valorPorExtenso', descricao: 'Valor por extenso', exemplo: 'vinte e cinco mil e quinhentos reais' },
      { caminho: 'contrato.formaPagamento', descricao: 'Condições de pagamento', exemplo: '50% na assinatura e 50% na entrega' },
      { caminho: 'contrato.prazoExecucao', descricao: 'Prazo de execução', exemplo: '30 (trinta) dias' },
      { caminho: 'contrato.formatosEntrega', descricao: 'Formatos de entrega', exemplo: 'PDF e DWG' },
      { caminho: 'contrato.localExecucao', descricao: 'Local de execução', exemplo: 'Av. Historiador Rubens de Mendonça, 1000' },
      { caminho: 'contrato.revisoesIncluidas', descricao: 'Revisões inclusas', exemplo: '02 (duas)' },
      { caminho: 'contrato.valorRevisaoExcedente', descricao: 'Valor da revisão excedente', exemplo: 'R$ 500,00' },
      { caminho: 'contrato.foro', descricao: 'Comarca do foro', exemplo: 'Cuiabá, MT' },
      { caminho: 'contrato.dataInicio', descricao: 'Início da vigência', exemplo: '01/08/2026' },
      { caminho: 'contrato.dataFim', descricao: 'Fim da vigência', exemplo: '30/10/2026' },
      { caminho: 'contrato.indiceReajuste', descricao: 'Índice de reajuste', exemplo: 'IGP-M' },
    ],
  },
  {
    grupo: 'Cliente (contratante)',
    itens: [
      { caminho: 'cliente.razaoSocial', descricao: 'Razão social ou nome', exemplo: 'Construtora Alfa Ltda' },
      { caminho: 'cliente.nomeFantasia', descricao: 'Nome fantasia', exemplo: 'Alfa Engenharia' },
      { caminho: 'cliente.documento', descricao: 'CNPJ ou CPF formatado', exemplo: '12.345.678/0001-90' },
      { caminho: 'cliente.endereco', descricao: 'Endereço completo', exemplo: 'Rua das Palmeiras, 120 — Centro' },
      { caminho: 'cliente.cidade', descricao: 'Cidade', exemplo: 'Cuiabá' },
      { caminho: 'cliente.unidade', descricao: 'Unidade/obra vinculada', exemplo: 'Filial Várzea Grande' },
    ],
  },
  {
    grupo: 'SONARE (contratada)',
    itens: [
      { caminho: 'empresa.razaoSocial', descricao: 'Razão social da SONARE', exemplo: 'SONARE CONSTRUCOES E SOLUCOES TECNICAS LTDA' },
      { caminho: 'empresa.cnpj', descricao: 'CNPJ da SONARE', exemplo: '00.000.000/0001-00' },
      { caminho: 'empresa.endereco', descricao: 'Endereço da SONARE', exemplo: 'Av. Exemplo, 500 — Cuiabá/MT' },
      { caminho: 'empresa.crea', descricao: 'CREA da empresa', exemplo: 'MT 029137' },
      { caminho: 'empresa.dadosPagamento', descricao: 'Dados para pagamento', exemplo: 'transferência via Pix para a chave CNPJ…' },
    ],
  },
];

/** Todos os caminhos válidos, para validar o que foi digitado. */
export const CAMINHOS_VALIDOS: string[] = VARIAVEIS_CONTRATO
  .flatMap((g) => g.itens.map((i) => i.caminho));

/** Variáveis citadas num texto que não existem — devolve os nomes errados. */
export function variaveisInvalidas(texto: string): string[] {
  const usadas = [...texto.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]);
  return [...new Set(usadas.filter((v) => !CAMINHOS_VALIDOS.includes(v)))];
}
