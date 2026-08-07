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
  /**
   * 'ok' não pede ação. 'emitindo' é a ART cadastrada que ainda não foi
   * emitida no conselho — tem número, mas ainda não cobre o serviço.
   */
  nivel: 'ok' | 'emitindo' | 'pendente' | 'indefinido';
  rotulo: string;
  detalhe: string;
};

/** ART cancelada não cobre nada — não conta como registrada. */
function valem(arts: ArtRegistrada[]): ArtRegistrada[] {
  return arts.filter((a) => a.status !== 'CANCELADA');
}

/** Só a ART emitida (ou já baixada) cobre o serviço de fato. */
function emitidas(arts: ArtRegistrada[]): ArtRegistrada[] {
  return arts.filter((a) => a.status === 'EMITIDA' || a.status === 'BAIXADA');
}

function numeros(arts: ArtRegistrada[]): string {
  return arts.map((a) => a.numero).join(', ');
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

  const prontas = emitidas(validas);

  if (status === 'NECESSARIA') {
    if (validas.length === 0) {
      return {
        nivel: 'pendente',
        rotulo: 'ART pendente',
        detalhe: 'Este projeto exige ART e nenhuma foi registrada ainda.',
      };
    }
    /*
     * Cadastrada mas ainda não emitida no conselho: o número existe, a
     * cobertura não. Mostrar isso como resolvido daria uma segurança que o
     * projeto ainda não tem.
     */
    if (prontas.length === 0) {
      return {
        nivel: 'emitindo',
        rotulo: `ART ${numeros(validas)} — falta emitir`,
        detalhe: 'A ART está cadastrada, mas ainda consta como pendente de emissão.',
      };
    }
    return {
      nivel: 'ok',
      rotulo: prontas.length > 1 ? `${prontas.length} ARTs emitidas` : `ART ${numeros(prontas)}`,
      detalhe: `Emitida${prontas.length > 1 ? 's' : ''}: ${numeros(prontas)}.`,
    };
  }

  /*
   * Não informado com ART emitida não é alerta: alguém já emitiu, a
   * necessidade está demonstrada na prática. Só falta o registro formal da
   * decisão, e cobrar isso seria burocracia.
   */
  if (prontas.length > 0) {
    return {
      nivel: 'ok',
      rotulo: `ART ${numeros(prontas)}`,
      detalhe: 'Há ART emitida para este projeto.',
    };
  }
  if (validas.length > 0) {
    return {
      nivel: 'emitindo',
      rotulo: `ART ${numeros(validas)} — falta emitir`,
      detalhe: 'A ART está cadastrada, mas ainda consta como pendente de emissão.',
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
  // "falta emitir" fica fora do quadro: o número existe e alguém está com
  // isso na mão — o lugar de resolver é dentro do cartão.
  if (nivel === 'ok' || nivel === 'emitindo') return null;
  return nivel;
}

export const ROTULO_ART: Record<ArtStatus, string> = {
  NAO_INFORMADO: 'Não informado',
  NECESSARIA: 'Precisa de ART',
  DISPENSADA: 'Não precisa de ART',
};
