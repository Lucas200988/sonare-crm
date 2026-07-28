// Junção de blocos de texto do assistente de escopo.
// Extraído do editor para poder ser testado isoladamente.

export type MergeMode = 'append' | 'replace';

/** Chave de comparação: sem acento, sem bullet, sem pontuação final, minúscula. */
export function normalizeLine(line: string): string {
  return line
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^[-•\s]+/, '')
    .replace(/[.;,\s]+$/, '');
}

/**
 * Junta um bloco novo ao texto existente.
 *
 * - `mode: 'append'` acrescenta após linha em branco; `'replace'` descarta o atual.
 * - `heading` insere um subtítulo antes do bloco (usado no escopo, um por serviço).
 * - `dedupe` remove linhas que já existem — premissas e exclusões costumam
 *   coincidir entre serviços e não devem ser repetidas na proposta.
 */
export function mergeTextBlocks(
  current: string,
  addition: string,
  mode: MergeMode,
  heading: string | null,
  dedupe = false,
): string {
  const atual = mode === 'replace' ? '' : current.trim();
  const bloco = additionBlock(atual, addition, heading, dedupe);

  if (bloco === null) return current;
  if (mode === 'replace') return bloco;
  return atual ? `${atual}\n\n${bloco}` : bloco;
}

/**
 * Apenas o bloco novo que sobrou depois do descarte de repetições — permite
 * acrescentar o conteúdo sem reescrever o que já está no campo (necessário
 * quando o campo guarda HTML formatado, que não pode ser remontado como texto).
 * Devolve null quando nada de novo restou.
 */
export function additionBlock(
  currentText: string,
  addition: string,
  heading: string | null,
  dedupe = false,
): string | null {
  const existentes = new Set(
    dedupe ? currentText.split('\n').map(normalizeLine).filter(Boolean) : [],
  );

  const linhasNovas = addition
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => {
      if (!dedupe) return true;
      const k = normalizeLine(l);
      if (!k || existentes.has(k)) return false;
      existentes.add(k);
      return true;
    });

  if (linhasNovas.length === 0) return null;

  const novo = linhasNovas.join('\n');
  return heading ? `${heading}\n${novo}` : novo;
}
