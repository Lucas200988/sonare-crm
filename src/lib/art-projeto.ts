/**
 * Situação da responsabilidade técnica de um projeto.
 *
 * A decisão ("precisa de ART?") é do gestor e fica no projeto; o número fica
 * no módulo de ART. Cruzar os dois é o que revela o caso perigoso: projeto
 * que precisa de ART, está andando, e não tem ART registrada.
 */

export type ArtStatus = 'NAO_INFORMADO' | 'NECESSARIA' | 'DISPENSADA';

export type ArtRegistrada = {
  numero: string;
  status: string;
};

export type SituacaoArt = {
  /** 'ok' não pede ação; 'pendente' e 'indefinido' aparecem como alerta. */
  nivel: 'ok' | 'pendente' | 'indefinido';
  rotulo: string;
  detalhe: string;
};

/** ART cancelada não cobre nada — não conta como registrada. */
function valem(arts: ArtRegistrada[]): ArtRegistrada[] {
  return arts.filter((a) => a.status !== 'CANCELADA');
}

export function situacaoArt(status: ArtStatus, arts: ArtRegistrada[]): SituacaoArt {
  const validas = valem(arts);

  if (status === 'DISPENSADA') {
    return {
      nivel: 'ok',
      rotulo: 'ART dispensada',
      detalhe: 'O gestor registrou que este projeto não exige ART.',
    };
  }

  if (status === 'NECESSARIA') {
    if (validas.length === 0) {
      return {
        nivel: 'pendente',
        rotulo: 'ART pendente',
        detalhe: 'Este projeto exige ART e nenhuma foi registrada ainda.',
      };
    }
    const numeros = validas.map((a) => a.numero).join(', ');
    return {
      nivel: 'ok',
      rotulo: validas.length > 1 ? `${validas.length} ARTs registradas` : `ART ${numeros}`,
      detalhe: `Registrada${validas.length > 1 ? 's' : ''}: ${numeros}.`,
    };
  }

  /*
   * Não informado com ART registrada não é alerta: alguém já emitiu, a
   * necessidade está demonstrada na prática. Só falta o registro formal da
   * decisão, e cobrar isso seria burocracia.
   */
  if (validas.length > 0) {
    return {
      nivel: 'ok',
      rotulo: `ART ${validas.map((a) => a.numero).join(', ')}`,
      detalhe: 'Há ART registrada para este projeto.',
    };
  }

  return {
    nivel: 'indefinido',
    rotulo: 'ART não informada',
    detalhe: 'Ninguém informou se este projeto precisa de ART.',
  };
}

/** O projeto aparece na lista de pendências de responsabilidade técnica? */
export function exigeAtencao(status: ArtStatus, arts: ArtRegistrada[]): boolean {
  return situacaoArt(status, arts).nivel !== 'ok';
}

/**
 * O selo para o cartão do quadro: `null` quando não há o que cobrar, para a
 * tela não precisar decidir nada.
 */
export function alertaArt(
  status: ArtStatus,
  arts: Array<{ number: string; status: string }>,
): 'pendente' | 'indefinido' | null {
  const nivel = situacaoArt(status, arts.map((a) => ({ numero: a.number, status: a.status }))).nivel;
  return nivel === 'ok' ? null : nivel;
}

export const ROTULO_ART: Record<ArtStatus, string> = {
  NAO_INFORMADO: 'Não informado',
  NECESSARIA: 'Precisa de ART',
  DISPENSADA: 'Não precisa de ART',
};
