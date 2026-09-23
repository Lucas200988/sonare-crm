/**
 * Status de projeto em que o TRABALHO já acabou — entregue, encerrado,
 * cancelado ou só esperando o cliente pagar. Fora deles, o projeto está
 * em andamento e vale cobrar prazo contratual e ART.
 *
 * "Aguardando recebimento" existe para o caso comum: etapas concluídas,
 * prazo contratual passado, dinheiro ainda não entrou. Não é "concluído"
 * (isso é depois de receber), mas também não pode seguir acusando prazo
 * vencido para um trabalho que já foi entregue.
 */
export const STATUS_TRABALHO_ENCERRADO = [
  'AGUARDANDO_RECEBIMENTO', 'CONCLUIDO', 'ENCERRADO', 'CANCELADO',
] as const;

export type StatusTrabalhoEncerrado = (typeof STATUS_TRABALHO_ENCERRADO)[number];

/** Data real de término: gravada quando o trabalho termina, receba ou não. */
export function encerraTrabalho(status: string): boolean {
  return (STATUS_TRABALHO_ENCERRADO as readonly string[]).includes(status);
}
