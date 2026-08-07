/**
 * Fluxo de aprovação em órgão externo — hoje, a concessionária de energia.
 *
 * O processo tem prazos que correm contra a concessionária, não contra nós:
 * protocolou, ela tem um número de dias para responder. Perder esse prazo
 * sem cobrar é perder tempo de obra sem ter a quem reclamar depois — por
 * isso o sistema conta os dias e diz o que fazer quando estoura.
 */

export type StatusPasso =
  | 'PENDENTE'
  | 'AGUARDANDO_CONCESSIONARIA'
  | 'CONCLUIDO'
  | 'DISPENSADO';

export type CodigoPasso =
  | 'SOLICITAR_ORCAMENTO'
  | 'ORCAMENTO_RECEBIDO'
  | 'CONTRATO_CONEXAO'
  | 'PROTOCOLAR_PROJETO'
  | 'PARECER_ACESSO';

export type ModeloPasso = {
  codigo: CodigoPasso;
  nome: string;
  /** O que a pessoa faz neste passo, em uma frase. */
  instrucao: string;
  /** Dias corridos que a concessionária tem para responder. */
  prazoDias: number | null;
  /** O passo guarda número de protocolo? */
  temProtocolo: boolean;
  /** O passo termina com uma decisão nossa (aceitar/recusar)? */
  temDecisao: boolean;
};

/**
 * Passos do acesso à rede da concessionária, na ordem em que acontecem.
 *
 * Os 30 dias vêm do prazo de resposta ao pedido de orçamento de conexão.
 * Ficam aqui, e não no código da tela, porque prazo regulatório muda por
 * resolução e alguém vai precisar achar isto rápido.
 */
export const FLUXO_CONCESSIONARIA: ModeloPasso[] = [
  {
    codigo: 'SOLICITAR_ORCAMENTO',
    nome: 'Solicitar orçamento de conexão',
    instrucao: 'Envie a solicitação à concessionária e registre o protocolo que ela devolver.',
    prazoDias: 30,
    temProtocolo: true,
    temDecisao: false,
  },
  {
    codigo: 'ORCAMENTO_RECEBIDO',
    nome: 'Orçamento de conexão recebido',
    instrucao: 'Recebido o orçamento, informe se foi aceito ou recusado.',
    prazoDias: null,
    temProtocolo: false,
    temDecisao: true,
  },
  {
    codigo: 'CONTRATO_CONEXAO',
    nome: 'Contrato de conexão',
    instrucao: 'Informe se o aceite gera contrato de conexão e registre a assinatura.',
    prazoDias: null,
    temProtocolo: false,
    temDecisao: true,
  },
  {
    codigo: 'PROTOCOLAR_PROJETO',
    nome: 'Protocolar o projeto',
    instrucao: 'Protocole o projeto para análise e registre o número.',
    prazoDias: 30,
    temProtocolo: true,
    temDecisao: false,
  },
  {
    codigo: 'PARECER_ACESSO',
    nome: 'Parecer de acesso',
    instrucao: 'Registre o parecer: aprovado ou com exigências a atender.',
    prazoDias: null,
    temProtocolo: false,
    temDecisao: true,
  },
];

export const MODELO_POR_CODIGO = new Map(FLUXO_CONCESSIONARIA.map((p) => [p.codigo, p]));

// ---------- Prazo ----------

const DIA_MS = 86_400_000;

/** Data-limite da resposta: dias corridos a partir do protocolo. */
export function prazoDoPasso(protocoladoEm: Date, prazoDias: number): Date {
  return new Date(protocoladoEm.getTime() + prazoDias * DIA_MS);
}

/** Dias inteiros entre duas datas — negativo quando o limite já passou. */
export function diasAte(limite: Date, agora: Date): number {
  const a = new Date(limite); a.setHours(0, 0, 0, 0);
  const b = new Date(agora); b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / DIA_MS);
}

/**
 * Dias de atraso a partir dos quais insistir com o atendimento comum deixa
 * de fazer sentido. Uma semana é tempo de a cobrança ter sido lida e
 * respondida; passou disso, o caminho é a ouvidoria.
 */
const DIAS_ATE_OUVIDORIA = 7;

export type AcaoSugerida = 'aguardar' | 'cobrar' | 'ouvidoria' | null;

export type SituacaoPasso = {
  nivel: 'pendente' | 'aguardando' | 'atrasado' | 'concluido' | 'dispensado';
  /** Positivo: dias que faltam. Negativo: dias de atraso. Null: sem prazo. */
  diasRestantes: number | null;
  acao: AcaoSugerida;
  resumo: string;
};

export type PassoEmAndamento = {
  status: StatusPasso;
  prazoDias: number | null;
  protocoladoEm: Date | null;
  respondidoEm: Date | null;
  /** Já cobramos formalmente? Muda a sugestão de cobrar para ouvidoria. */
  cobradoEm: Date | null;
};

/**
 * O que fazer com este passo hoje.
 *
 * A sugestão sobe em degraus — aguardar, cobrar, ouvidoria — porque pular
 * direto para a ouvidoria queima uma relação que vai durar muitos projetos.
 */
export function situacaoPasso(passo: PassoEmAndamento, agora: Date): SituacaoPasso {
  if (passo.status === 'CONCLUIDO') {
    return { nivel: 'concluido', diasRestantes: null, acao: null, resumo: 'Concluído' };
  }
  if (passo.status === 'DISPENSADO') {
    return { nivel: 'dispensado', diasRestantes: null, acao: null, resumo: 'Não se aplica' };
  }
  if (passo.status === 'PENDENTE' || !passo.protocoladoEm) {
    return { nivel: 'pendente', diasRestantes: null, acao: null, resumo: 'A fazer' };
  }

  // Sem prazo definido, resta acompanhar — não há regra para cobrar.
  if (!passo.prazoDias) {
    return {
      nivel: 'aguardando',
      diasRestantes: null,
      acao: 'aguardar',
      resumo: 'Aguardando retorno',
    };
  }

  const limite = prazoDoPasso(passo.protocoladoEm, passo.prazoDias);
  const dias = diasAte(limite, agora);

  if (dias >= 0) {
    return {
      nivel: 'aguardando',
      diasRestantes: dias,
      acao: 'aguardar',
      resumo: dias === 0 ? 'Prazo vence hoje' : `Faltam ${dias} dia(s) para o prazo`,
    };
  }

  const atraso = Math.abs(dias);
  const jaCobrado = passo.cobradoEm !== null;
  const escalar = jaCobrado || atraso > DIAS_ATE_OUVIDORIA;

  return {
    nivel: 'atrasado',
    diasRestantes: dias,
    acao: escalar ? 'ouvidoria' : 'cobrar',
    resumo: `Prazo vencido há ${atraso} dia(s)`,
  };
}

/** Texto da ação sugerida, para o botão e para o alerta. */
export const TEXTO_ACAO: Record<Exclude<AcaoSugerida, null>, string> = {
  aguardar: 'Aguardando a concessionária',
  cobrar: 'Cobrar a concessionária',
  ouvidoria: 'Levar à ouvidoria',
};

/** O passo em que o processo está — o primeiro que ainda não terminou. */
export function passoAtual<T extends { status: StatusPasso; sortOrder: number }>(
  passos: T[],
): T | null {
  return [...passos]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .find((p) => p.status !== 'CONCLUIDO' && p.status !== 'DISPENSADO') ?? null;
}

/** O processo inteiro está encerrado? */
export function processoConcluido(passos: Array<{ status: StatusPasso }>): boolean {
  return passos.length > 0
    && passos.every((p) => p.status === 'CONCLUIDO' || p.status === 'DISPENSADO');
}
