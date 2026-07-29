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
