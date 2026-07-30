/**
 * Como a proposta se identifica em tela, no PDF e no nome do arquivo.
 *
 * O número nunca muda dentro de uma mesma negociação: uma renegociação
 * comercial vira "PROP-2026-013 Rev. 01". Assim o cliente reconhece que é a
 * mesma proposta, e o arquivo não acumula números diferentes para o mesmo
 * assunto.
 */
export function codigoProposta(code: string, revision: number): string {
  return revision > 0 ? `${code} Rev. ${String(revision).padStart(2, '0')}` : code;
}

/** Mesma identificação, mas segura para nome de arquivo. */
export function arquivoProposta(code: string, revision: number): string {
  return revision > 0 ? `${code}-rev${String(revision).padStart(2, '0')}` : code;
}

/**
 * Limpa um nome para uso em arquivo do Windows.
 *
 * Tira os caracteres que o Explorador recusa (\ / : * ? " < > |), colapsa
 * espaços e corta o comprimento — razão social costuma ser longa demais para
 * caber junto do número.
 */
function nomeSeguro(texto: string, maximo = 45): string {
  const limpo = texto
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return limpo.length > maximo ? `${limpo.slice(0, maximo).trimEnd()}` : limpo;
}

/**
 * Nome do arquivo da proposta, pronto para salvar sem renomear: número da
 * proposta seguido do cliente — "PROP-2026-013 - DCCO Solucoes.pdf".
 */
export function nomeArquivoProposta(
  code: string, revision: number, cliente: string | null | undefined,
): string {
  const numero = arquivoProposta(code, revision);
  const nome = nomeSeguro(cliente ?? '');
  return nome ? `${numero} - ${nome}.pdf` : `${numero}.pdf`;
}

/** Nome do arquivo da pré-visualização, que ainda não tem número de proposta. */
export function nomeArquivoPrevia(budgetCode: string, cliente: string | null | undefined): string {
  const nome = nomeSeguro(cliente ?? '');
  return nome ? `Previa ${budgetCode} - ${nome}.pdf` : `Previa ${budgetCode}.pdf`;
}
