/**
 * Situação de entrega de um e-mail, e como resumir várias em uma só.
 *
 * Um orçamento pode ter mandado a proposta duas vezes, para três endereços:
 * são seis registros de entrega para uma linha no cartão do pipeline. Aqui
 * fica a regra de qual deles a linha mostra.
 */

export type StatusEntrega =
  | 'ENVIADO' | 'ATRASADO' | 'ENTREGUE' | 'ABERTO' | 'CLIQUE' | 'REJEITADO' | 'SPAM';

/**
 * Progressão normal de uma mensagem. Serve para o histórico não andar para
 * trás quando o provedor manda os eventos fora de ordem — a rede não garante
 * ordem — e para escolher o mais avançado entre vários destinatários.
 */
export const ORDEM_ENTREGA: StatusEntrega[] = [
  'ENVIADO', 'ATRASADO', 'ENTREGUE', 'ABERTO', 'CLIQUE',
];

/** Rejeição e spam são desfecho: sobrepõem qualquer avanço. */
export function ehFalha(status: StatusEntrega): boolean {
  return status === 'REJEITADO' || status === 'SPAM';
}

/** O novo status substitui o atual? */
export function avancaEntrega(atual: StatusEntrega, novo: StatusEntrega): boolean {
  if (ehFalha(novo)) return true;
  if (ehFalha(atual)) return false;
  return ORDEM_ENTREGA.indexOf(novo) > ORDEM_ENTREGA.indexOf(atual);
}

export type Entrega = { status: StatusEntrega; sentAt: Date | string };

/**
 * A entrega que resume o conjunto.
 *
 * Falha vence tudo: se um dos destinatários não recebeu, é isso que precisa
 * de ação. Fora isso vence o estágio mais avançado — se alguém do outro lado
 * abriu, a mensagem chegou, e é esse o sinal que interessa. Empate fica com
 * a mais recente.
 */
export function resumoEntrega<T extends Entrega>(entregas: T[]): T | null {
  let melhor: T | null = null;
  for (const e of entregas) {
    if (!melhor) { melhor = e; continue; }
    if (avancaEntrega(melhor.status, e.status)) { melhor = e; continue; }
    const mesmoEstagio = melhor.status === e.status;
    if (mesmoEstagio && new Date(e.sentAt) > new Date(melhor.sentAt)) melhor = e;
  }
  return melhor;
}

/**
 * O cliente abriu a proposta depois deste envio?
 *
 * Vale mais que o rastreio do provedor: a abertura é registrada quando o PDF
 * é carregado do nosso servidor — é fato, não pixel que o Gmail carrega
 * sozinho. Uma abertura anterior a um reenvio não conta: se a proposta foi
 * renegociada e mandada de novo, o que interessa é se voltaram a olhar.
 * Meia hora de folga cobre o relógio do servidor e o intervalo entre o envio
 * ser gravado e o cliente clicar.
 */
export function abriuDepois(lastViewedAt: Date | null, sentAt: Date): boolean {
  if (!lastViewedAt) return false;
  return lastViewedAt.getTime() > sentAt.getTime() - 30 * 60_000;
}

/** Rótulos curtos, do tamanho de um cartão de pipeline. */
export const ROTULO_ENTREGA: Record<StatusEntrega, string> = {
  ENVIADO: 'E-mail enviado',
  ATRASADO: 'Tentando entregar',
  ENTREGUE: 'Entregue na caixa',
  ABERTO: 'Aberto pelo cliente',
  CLIQUE: 'Abriu a proposta',
  REJEITADO: 'Não chegou',
  SPAM: 'Caiu em spam',
};

/** Dias inteiros entre a data e agora — "há 3 dias" no cartão. */
export function diasDesde(data: Date | string, agora: Date): number {
  const ms = agora.getTime() - new Date(data).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}
