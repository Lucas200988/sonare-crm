export const BUDGET_STATUS_BADGE: Record<string, { color: string; label: string }> = {
  RASCUNHO: { color: 'slate', label: 'Rascunho' },
  EM_REVISAO: { color: 'amber', label: 'Em revisão' },
  APROVACAO_INTERNA: { color: 'violet', label: 'Aprovação interna' },
  APROVADO: { color: 'green', label: 'Aprovado' },
  RECUSADO: { color: 'red', label: 'Recusado' },
  EXPIRADO: { color: 'slate', label: 'Expirado' },
  CANCELADO: { color: 'slate', label: 'Cancelado' },
};

export const PROPOSAL_STATUS_BADGE: Record<string, { color: string; label: string }> = {
  RASCUNHO: { color: 'slate', label: 'Gerada' },
  ENVIADA: { color: 'blue', label: 'Enviada' },
  VISUALIZADA: { color: 'blue', label: 'Visualizada' },
  ACEITA: { color: 'green', label: 'Aceita' },
  RECUSADA: { color: 'red', label: 'Recusada' },
  EXPIRADA: { color: 'slate', label: 'Expirada' },
};
