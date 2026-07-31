/**
 * Regras de follow-up comercial: quando cobrar retorno de uma proposta.
 *
 * Toda a decisão de "cabe um toque hoje?" vive aqui, sem banco nem rede, para
 * poder ser conferida por teste. O serviço só traz os dados e aplica.
 */

export type NivelAutonomia =
  /** Só cria aviso interno para a equipe. */
  | 'avisar'
  /** Prepara o contato e espera alguém aprovar na fila. */
  | 'preparar'
  /** Dispara sozinho, respeitando as travas. */
  | 'automatico';

export type ConfigFollowUp = {
  /** Interruptor geral: desligado, nada acontece. */
  ativo: boolean;
  /** Dias úteis sem sinal do cliente antes do primeiro toque. */
  diasSemRetorno: number;
  /** Dias após o cliente visualizar, sem decisão, para o segundo toque. */
  diasVisualizadaSemDecisao: number;
  /** Quantos dias antes de expirar avisar o cliente. */
  diasAntesDaValidade: number;
  /** Silêncio mínimo entre dois toques sobre a MESMA proposta. */
  intervaloMinimoDias: number;
  /** Teto de contatos automáticos por cliente na semana. */
  maximoPorClienteSemana: number;
  nivel: NivelAutonomia;
};

export const CONFIG_PADRAO: ConfigFollowUp = {
  ativo: false, // nasce desligado: ninguém é surpreendido por e-mail ao cliente
  diasSemRetorno: 2,
  diasVisualizadaSemDecisao: 3,
  diasAntesDaValidade: 5,
  intervaloMinimoDias: 3,
  maximoPorClienteSemana: 2,
  nivel: 'preparar',
};

export type TipoToque = 'SEM_RETORNO' | 'VISUALIZADA_SEM_DECISAO' | 'VALIDADE_PROXIMA' | 'EXPIRADA';

/** O que se sabe de uma proposta na hora de decidir o toque. */
export type PropostaParaAvaliar = {
  proposalId: string;
  status: string;
  sentAt: Date | null;
  viewedAt: Date | null;
  validUntil: Date | null;
  /** Último toque já dado sobre esta proposta, de qualquer tipo. */
  ultimoToqueEm: Date | null;
  /** Tipos de toque já dados — cada um acontece uma vez só. */
  toquesJaDados: TipoToque[];
  /** Contatos automáticos feitos com este cliente nos últimos 7 dias. */
  contatosClienteNaSemana: number;
};

export type Decisao =
  | { agir: false; motivo: string }
  | { agir: true; tipo: TipoToque; diasDesde: number };

/** Dias corridos entre duas datas, sempre em dias inteiros. */
export function diasEntre(de: Date, ate: Date): number {
  const a = new Date(de.getFullYear(), de.getMonth(), de.getDate());
  const b = new Date(ate.getFullYear(), ate.getMonth(), ate.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Dias úteis entre duas datas (exclui sábado e domingo).
 *
 * Proposta enviada na sexta não pode ser cobrada na segunda como se três dias
 * tivessem passado — o cliente teve um dia útil para olhar.
 */
export function diasUteisEntre(de: Date, ate: Date): number {
  let dias = 0;
  const cursor = new Date(de.getFullYear(), de.getMonth(), de.getDate());
  const fim = new Date(ate.getFullYear(), ate.getMonth(), ate.getDate());
  while (cursor < fim) {
    cursor.setDate(cursor.getDate() + 1);
    const d = cursor.getDay();
    if (d !== 0 && d !== 6) dias += 1;
  }
  return dias;
}

/** Segunda a sexta, das 8h às 18h — quando um contato comercial é aceitável. */
export function emHorarioComercial(agora: Date): boolean {
  const dia = agora.getDay();
  if (dia === 0 || dia === 6) return false;
  const h = agora.getHours();
  return h >= 8 && h < 18;
}

/**
 * Decide se cabe um toque hoje, e qual.
 *
 * A ordem importa: expirada e validade próxima têm prazo real e vêm antes do
 * follow-up genérico, senão a proposta venceria enquanto se pedia retorno.
 */
export function avaliarProposta(
  p: PropostaParaAvaliar,
  cfg: ConfigFollowUp,
  agora: Date,
): Decisao {
  if (!cfg.ativo) return { agir: false, motivo: 'automação desligada' };

  // Qualquer decisão do cliente encerra o follow-up.
  if (p.status === 'ACEITA' || p.status === 'RECUSADA') {
    return { agir: false, motivo: 'proposta já decidida' };
  }
  if (!p.sentAt) return { agir: false, motivo: 'proposta ainda não enviada' };

  if (p.contatosClienteNaSemana >= cfg.maximoPorClienteSemana) {
    return { agir: false, motivo: 'teto de contatos com este cliente na semana' };
  }
  if (p.ultimoToqueEm && diasEntre(p.ultimoToqueEm, agora) < cfg.intervaloMinimoDias) {
    return { agir: false, motivo: 'toque recente demais sobre esta proposta' };
  }

  const jaFez = (t: TipoToque) => p.toquesJaDados.includes(t);

  if (p.validUntil && diasEntre(p.validUntil, agora) > 0 && !jaFez('EXPIRADA')) {
    return { agir: true, tipo: 'EXPIRADA', diasDesde: diasEntre(p.validUntil, agora) };
  }
  if (p.validUntil && !jaFez('VALIDADE_PROXIMA')) {
    const faltam = diasEntre(agora, p.validUntil);
    if (faltam >= 0 && faltam <= cfg.diasAntesDaValidade) {
      return { agir: true, tipo: 'VALIDADE_PROXIMA', diasDesde: faltam };
    }
  }
  if (p.viewedAt && !jaFez('VISUALIZADA_SEM_DECISAO')) {
    const dias = diasUteisEntre(p.viewedAt, agora);
    if (dias >= cfg.diasVisualizadaSemDecisao) {
      return { agir: true, tipo: 'VISUALIZADA_SEM_DECISAO', diasDesde: dias };
    }
  }
  if (!jaFez('SEM_RETORNO')) {
    const dias = diasUteisEntre(p.sentAt, agora);
    if (dias >= cfg.diasSemRetorno) {
      return { agir: true, tipo: 'SEM_RETORNO', diasDesde: dias };
    }
  }
  return { agir: false, motivo: 'nada a fazer hoje' };
}
