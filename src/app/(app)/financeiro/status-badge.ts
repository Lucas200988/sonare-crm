export const RECEIVABLE_BADGE: Record<string, { label: string; color: string }> = {
  PREVISTO: { label: 'Previsto', color: 'slate' },
  A_FATURAR: { label: 'A faturar', color: 'blue' },
  AGUARDANDO_AUTORIZACAO: { label: 'Aguardando autorização', color: 'amber' },
  NF_EMITIDA: { label: 'NF emitida', color: 'blue' },
  ENVIADO_AO_CLIENTE: { label: 'Enviado ao cliente', color: 'blue' },
  A_VENCER: { label: 'A vencer', color: 'slate' },
  VENCIDO: { label: 'Vencida', color: 'red' },
  PARCIALMENTE_RECEBIDO: { label: 'Parcial', color: 'amber' },
  RECEBIDO: { label: 'Recebida', color: 'green' },
  RENEGOCIADO: { label: 'Renegociada', color: 'violet' },
  CANCELADO: { label: 'Cancelada', color: 'slate' },
  EM_COBRANCA: { label: 'Em cobrança', color: 'amber' },
  INADIMPLENTE: { label: 'Inadimplente', color: 'red' },
};

export const PAYABLE_BADGE: Record<string, { label: string; color: string }> = {
  A_PAGAR: { label: 'A pagar', color: 'slate' },
  PAGO: { label: 'Paga', color: 'green' },
  CANCELADO: { label: 'Cancelada', color: 'slate' },
};
