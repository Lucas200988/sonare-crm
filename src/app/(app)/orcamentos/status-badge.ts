export const BUDGET_STATUS_BADGE: Record<string, { color: string; label: string }> = {
  RASCUNHO: { color: 'slate', label: 'Rascunho' },
  EM_REVISAO: { color: 'amber', label: 'Em revisão' },
  APROVACAO_INTERNA: { color: 'violet', label: 'Aprovação interna' },
  // Aprovação INTERNA: o cliente ainda nem viu. "Aprovado" aqui parecia
  // negócio fechado.
  APROVADO: { color: 'teal', label: 'Liberado para envio' },
  RECUSADO: { color: 'red', label: 'Recusado pelo cliente' },
  EXPIRADO: { color: 'slate', label: 'Expirado' },
  CANCELADO: { color: 'slate', label: 'Cancelado' },
};

/**
 * Status exibido do orçamento, acompanhando a negociação.
 *
 * Depois da aprovação interna, o que importa é o andamento com o cliente —
 * então a proposta emitida passa a mandar no rótulo: enviada, visualizada,
 * aceita. Os demais status (rascunho, revisão, recusado…) seguem os do banco.
 */
export function badgeDoOrcamento(
  status: string,
  propostas: Array<{ status: string }> = [],
): { color: string; label: string } {
  if (status === 'APROVADO' && propostas.length > 0) {
    const p = propostas[0]; // a mais recente da versão corrente
    const porProposta: Record<string, { color: string; label: string }> = {
      RASCUNHO: { color: 'teal', label: 'Proposta gerada' },
      ENVIADA: { color: 'blue', label: 'Proposta enviada' },
      VISUALIZADA: { color: 'blue', label: 'Cliente visualizou' },
      ACEITA: { color: 'green', label: 'Aceito pelo cliente' },
      EXPIRADA: { color: 'slate', label: 'Proposta expirada' },
    };
    const badge = porProposta[p.status];
    if (badge) return badge;
  }
  return BUDGET_STATUS_BADGE[status] ?? BUDGET_STATUS_BADGE.RASCUNHO;
}

export const PROPOSAL_STATUS_BADGE: Record<string, { color: string; label: string }> = {
  RASCUNHO: { color: 'slate', label: 'Gerada' },
  ENVIADA: { color: 'blue', label: 'Enviada' },
  VISUALIZADA: { color: 'blue', label: 'Visualizada' },
  ACEITA: { color: 'green', label: 'Aceita' },
  RECUSADA: { color: 'red', label: 'Recusada' },
  EXPIRADA: { color: 'slate', label: 'Expirada' },
};
