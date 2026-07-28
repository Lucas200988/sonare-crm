/**
 * Colunas do quadro de projetos.
 *
 * O banco guarda o status detalhado (útil em relatórios e no histórico), mas o
 * quadro trabalha com as quatro situações que a equipe usa no dia a dia. Cada
 * coluna absorve os status equivalentes; arrastar o cartão grava o `status`
 * principal da coluna de destino.
 */
export type BoardColumn = {
  id: string;
  label: string;
  /** Status gravado ao soltar o cartão nesta coluna. */
  status: string;
  /** Status que aparecem nesta coluna (inclui os detalhados e os legados). */
  absorbs: string[];
};

export const BOARD_COLUMNS: BoardColumn[] = [
  {
    id: 'desenvolvimento',
    label: 'Em desenvolvimento',
    status: 'EM_DESENVOLVIMENTO',
    absorbs: [
      'AGUARDANDO_INICIO', 'EM_MOBILIZACAO', 'AGUARDANDO_DOCUMENTOS',
      'EM_LEVANTAMENTO', 'EM_DESENVOLVIMENTO', 'EM_REVISAO_INTERNA',
    ],
  },
  {
    id: 'cliente',
    label: 'Em análise do cliente',
    status: 'EM_REVISAO_DO_CLIENTE',
    absorbs: [
      'ENVIADO_AO_CLIENTE', 'AGUARDANDO_APROVACAO', 'EM_REVISAO_DO_CLIENTE',
      'EM_APROVACAO_EXTERNA', 'AGUARDANDO_CONCESSIONARIA', 'AGUARDANDO_ORGAO_PUBLICO',
    ],
  },
  {
    id: 'suspenso',
    label: 'Suspenso',
    status: 'SUSPENSO',
    absorbs: ['SUSPENSO'],
  },
  {
    id: 'finalizado',
    label: 'Finalizado',
    status: 'CONCLUIDO',
    absorbs: ['CONCLUIDO', 'ENCERRADO'],
  },
];

/** Coluna onde o cartão deve aparecer — null se o status não vai ao quadro (ex.: cancelado). */
export function columnForStatus(status: string): BoardColumn | null {
  return BOARD_COLUMNS.find((c) => c.absorbs.includes(status)) ?? null;
}
