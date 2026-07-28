/** Tamanho de bloco que cabe com folga na janela de resposta do modelo. */
export const REVIEW_CHUNK_CHARS = 3500;

/**
 * Quebra o texto em blocos que respeitam parágrafos e linhas, para que a revisão
 * de textos longos não estoure o limite de saída do modelo (que truncaria o final).
 */
export function splitForReview(text: string, maxChars = REVIEW_CHUNK_CHARS): string[] {
  if (text.length <= maxChars) return [text];

  const blocos: string[] = [];
  let atual = '';
  for (const paragrafo of text.split(/\n{2,}/)) {
    const candidato = atual ? `${atual}\n\n${paragrafo}` : paragrafo;
    if (candidato.length <= maxChars) {
      atual = candidato;
      continue;
    }
    if (atual) { blocos.push(atual); atual = ''; }

    // Parágrafo isolado ainda grande: quebra por linhas
    if (paragrafo.length <= maxChars) { atual = paragrafo; continue; }
    let linhaAcc = '';
    for (const linha of paragrafo.split('\n')) {
      const cand = linhaAcc ? `${linhaAcc}\n${linha}` : linha;
      if (cand.length <= maxChars) linhaAcc = cand;
      else { if (linhaAcc) blocos.push(linhaAcc); linhaAcc = linha; }
    }
    atual = linhaAcc;
  }
  if (atual) blocos.push(atual);
  return blocos;
}
