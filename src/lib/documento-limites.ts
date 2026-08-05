/**
 * Limites e limpeza do texto extraído de um documento anexado.
 *
 * Separado da extração porque aqui não há dependência de biblioteca nem de
 * servidor — é só regra, e é onde mora o risco de mandar lixo (ou uma conta
 * alta) para a IA.
 */

/** Tipos que sabemos ler. Qualquer outro é recusado com nome claro. */
export const TIPOS_ACEITOS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word (.docx)',
  'text/plain': 'texto',
  'text/markdown': 'texto',
};

/** Arquivo maior que isto não é termo de referência, é projeto inteiro. */
export const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;

/**
 * Teto de caracteres enviados à IA.
 *
 * Edital de 300 páginas não cabe no contexto nem no tempo da requisição, e
 * o que importa costuma estar no começo. Cortar com aviso é melhor que
 * falhar depois de trinta segundos de espera.
 */
export const CARACTERES_MAXIMOS = 60_000;

export function tipoAceito(mime: string, nome: string): boolean {
  if (TIPOS_ACEITOS[mime]) return true;
  // alguns navegadores mandam mime vazio ou genérico; o nome desempata
  return /\.(pdf|docx|txt|md)$/i.test(nome);
}

/**
 * Normaliza o texto vindo do documento.
 *
 * PDF extraído vem com quebras de linha no meio das frases, espaços duplos
 * e linhas em branco em excesso — tudo isso é token pago que não informa
 * nada.
 */
export function limparTexto(bruto: string): string {
  return bruto
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export type TextoExtraido = {
  texto: string;
  /** Passou do teto e foi cortado? A tela precisa dizer isso ao usuário. */
  cortado: boolean;
  caracteres: number;
};

export function aplicarLimite(texto: string): TextoExtraido {
  const limpo = limparTexto(texto);
  if (limpo.length <= CARACTERES_MAXIMOS) {
    return { texto: limpo, cortado: false, caracteres: limpo.length };
  }
  return {
    texto: limpo.slice(0, CARACTERES_MAXIMOS),
    cortado: true,
    caracteres: limpo.length,
  };
}
