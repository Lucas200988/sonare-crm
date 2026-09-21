/**
 * Passos da régua de cobrança. Módulo neutro de propósito: a página
 * (servidor) e os botões (cliente) usam a mesma lista — constante exportada
 * de arquivo 'use client' vira referência opaca no servidor e quebra o .find.
 */
export const TIPOS_COBRANCA: Array<[string, string]> = [
  ['LEMBRETE_PRE_VENCIMENTO', 'Lembrete antes do vencimento'],
  ['AVISO_VENCIMENTO', 'Aviso de vencimento'],
  ['PRIMEIRO_AVISO_ATRASO', '1º aviso de atraso'],
  ['SEGUNDO_AVISO_ATRASO', '2º aviso de atraso'],
  ['COBRANCA_FORMAL', 'Cobrança formal'],
  ['RENEGOCIACAO', 'Renegociação'],
  ['ENCAMINHAMENTO_JURIDICO', 'Encaminhado ao jurídico'],
];
