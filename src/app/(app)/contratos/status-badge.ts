export const CONTRACT_STATUS_BADGE: Record<string, { color: string; label: string }> = {
  MINUTA: { color: 'slate', label: 'Minuta' },
  EM_REVISAO_INTERNA: { color: 'amber', label: 'Revisão interna' },
  AGUARDANDO_APROVACAO: { color: 'violet', label: 'Aguardando aprovação' },
  ENVIADO_AO_CLIENTE: { color: 'blue', label: 'Enviado ao cliente' },
  EM_NEGOCIACAO: { color: 'amber', label: 'Em negociação' },
  AGUARDANDO_ASSINATURA: { color: 'amber', label: 'Aguardando assinatura' },
  ASSINADO: { color: 'green', label: 'Assinado' },
  VIGENTE: { color: 'green', label: 'Vigente' },
  SUSPENSO: { color: 'slate', label: 'Suspenso' },
  ENCERRADO: { color: 'slate', label: 'Encerrado' },
  RESCINDIDO: { color: 'red', label: 'Rescindido' },
  CANCELADO: { color: 'red', label: 'Cancelado' },
};

export const AMENDMENT_TYPE_LABEL: Record<string, string> = {
  VALOR: 'Valor',
  PRAZO: 'Prazo',
  ESCOPO: 'Escopo',
  FORMA_PAGAMENTO: 'Forma de pagamento',
  RESPONSABILIDADE: 'Responsabilidade',
  SUSPENSAO: 'Suspensão',
  RETOMADA: 'Retomada',
  RESCISAO: 'Rescisão',
};
