/**
 * Formatação leve dos campos de texto das propostas.
 *
 * O conteúdo continua sendo texto puro (compatível com o que já está salvo,
 * com a revisão por IA e com a busca), e apenas dois marcadores são
 * interpretados na hora de gerar o PDF:
 *   **negrito**   _itálico_
 *
 * Estrutura de linha: "- " vira marcador, "1. " vira lista numerada e linhas
 * curtas em CAIXA ALTA viram subtítulo.
 */

export type Segment = { text: string; bold: boolean; italic: boolean };

const TOKEN = /(\*\*[^*]+\*\*|_[^_]+_)/g;

/** Divide a linha em trechos com/sem negrito e itálico. */
export function parseInline(line: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;

  for (const match of line.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      segments.push({ text: line.slice(lastIndex, start), bold: false, italic: false });
    }
    const token = match[0];
    if (token.startsWith('**')) {
      segments.push({ text: token.slice(2, -2), bold: true, italic: false });
    } else {
      segments.push({ text: token.slice(1, -1), bold: false, italic: true });
    }
    lastIndex = start + token.length;
  }

  if (lastIndex < line.length) {
    segments.push({ text: line.slice(lastIndex), bold: false, italic: false });
  }
  return segments.length > 0 ? segments : [{ text: line, bold: false, italic: false }];
}

/** Remove os marcadores — para contagem de caracteres e pré-visualização simples. */
export function stripMarkers(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/_([^_]+)_/g, '$1');
}

export type LineKind = 'bullet' | 'numbered' | 'heading' | 'paragraph';

/** Classifica a linha para decidir como renderizá-la. */
export function classifyLine(line: string): { kind: LineKind; content: string; marker?: string } {
  const trimmed = line.trim();

  const numbered = /^(\d+)[.)]\s+(.*)$/.exec(trimmed);
  if (numbered) return { kind: 'numbered', content: numbered[2], marker: `${numbered[1]}.` };

  if (trimmed.startsWith('-')) return { kind: 'bullet', content: trimmed.replace(/^-\s*/, '') };

  const semMarcadores = stripMarkers(trimmed);
  const ehTitulo = semMarcadores.length > 0
    && semMarcadores.length <= 80
    && !semMarcadores.endsWith('.')
    && semMarcadores === semMarcadores.toUpperCase()
    && /[A-ZÀ-Ú]/.test(semMarcadores);
  if (ehTitulo) return { kind: 'heading', content: trimmed };

  return { kind: 'paragraph', content: trimmed };
}
