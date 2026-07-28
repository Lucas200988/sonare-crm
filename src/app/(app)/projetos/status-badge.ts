export const PROJECT_STATUS_BADGE: Record<string, { label: string; color: string }> = {
  AGUARDANDO_INICIO: { label: 'Aguardando início', color: 'slate' },
  EM_MOBILIZACAO: { label: 'Em mobilização', color: 'blue' },
  AGUARDANDO_DOCUMENTOS: { label: 'Aguardando documentos', color: 'amber' },
  EM_LEVANTAMENTO: { label: 'Em levantamento', color: 'blue' },
  EM_DESENVOLVIMENTO: { label: 'Em desenvolvimento', color: 'blue' },
  EM_REVISAO_INTERNA: { label: 'Em revisão interna', color: 'violet' },
  ENVIADO_AO_CLIENTE: { label: 'Enviado ao cliente', color: 'violet' },
  AGUARDANDO_APROVACAO: { label: 'Aguardando aprovação', color: 'amber' },
  EM_REVISAO_DO_CLIENTE: { label: 'Em revisão do cliente', color: 'amber' },
  EM_APROVACAO_EXTERNA: { label: 'Em aprovação externa', color: 'amber' },
  AGUARDANDO_CONCESSIONARIA: { label: 'Aguardando concessionária', color: 'amber' },
  AGUARDANDO_ORGAO_PUBLICO: { label: 'Aguardando órgão público', color: 'amber' },
  SUSPENSO: { label: 'Suspenso', color: 'red' },
  CONCLUIDO: { label: 'Concluído', color: 'green' },
  ENCERRADO: { label: 'Encerrado', color: 'green' },
  CANCELADO: { label: 'Cancelado', color: 'red' },
};

export const STAGE_STATUS_BADGE: Record<string, { label: string; color: string }> = {
  PENDENTE: { label: 'Pendente', color: 'slate' },
  EM_ANDAMENTO: { label: 'Em andamento', color: 'blue' },
  CONCLUIDA: { label: 'Concluída', color: 'green' },
  CANCELADA: { label: 'Cancelada', color: 'red' },
};

export const DELIVERABLE_STATUS_BADGE: Record<string, { label: string; color: string }> = {
  PENDENTE: { label: 'Pendente', color: 'slate' },
  EM_ELABORACAO: { label: 'Em elaboração', color: 'blue' },
  EM_REVISAO: { label: 'Em revisão', color: 'violet' },
  EMITIDO: { label: 'Emitido', color: 'blue' },
  APROVADO: { label: 'Aprovado', color: 'green' },
  REPROVADO: { label: 'Reprovado', color: 'red' },
  CANCELADO: { label: 'Cancelado', color: 'red' },
};

export const TASK_STATUS_COLUMNS = [
  { status: 'A_FAZER', label: 'A fazer' },
  { status: 'EM_ANDAMENTO', label: 'Em andamento' },
  { status: 'EM_REVISAO', label: 'Em revisão' },
  { status: 'BLOQUEADA', label: 'Bloqueada' },
  { status: 'CONCLUIDA', label: 'Concluída' },
] as const;
