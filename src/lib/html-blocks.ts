/**
 * Converte o HTML restrito do editor em blocos simples, que o gerador de PDF
 * transforma em componentes. Sem dependência de DOM — roda no servidor.
 *
 * Suporta: <p>, <h2>, <h3>, <ul>/<ol> com <li>, <strong>/<b>, <em>/<i>, <u>,
 * <br> e alinhamento via style="text-align:…".
 */

export type InlineRun = { text: string; bold: boolean; italic: boolean; underline: boolean };
export type Align = 'left' | 'center' | 'right' | 'justify';

export type Block =
  | { kind: 'paragraph'; runs: InlineRun[]; align: Align }
  | { kind: 'heading'; runs: InlineRun[]; align: Align; level: 2 | 3 }
  | { kind: 'listItem'; runs: InlineRun[]; align: Align; marker: string };

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  '&aacute;': 'á', '&eacute;': 'é', '&iacute;': 'í', '&oacute;': 'ó', '&uacute;': 'ú',
  '&ccedil;': 'ç', '&atilde;': 'ã', '&otilde;': 'õ', '&acirc;': 'â', '&ecirc;': 'ê',
  '&ocirc;': 'ô', '&agrave;': 'à', '&ordm;': 'º', '&ordf;': 'ª', '&sup2;': '²',
};

function decode(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)))
    .replace(/&[a-z][a-z0-9]*;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e);
}

function alignOf(attrs: string): Align {
  const m = /text-align:\s*(left|center|right|justify)/i.exec(attrs);
  return (m ? m[1].toLowerCase() : 'left') as Align;
}

/** Quebra o conteúdo interno de um bloco em trechos com marcação inline. */
function parseRuns(html: string): InlineRun[] {
  const runs: InlineRun[] = [];
  let bold = 0, italic = 0, underline = 0;
  let buffer = '';

  const flush = () => {
    if (!buffer) return;
    const text = decode(buffer).replace(/\s+/g, ' ');
    if (text) runs.push({ text, bold: bold > 0, italic: italic > 0, underline: underline > 0 });
    buffer = '';
  };

  const tokens = html.split(/(<[^>]+>)/);
  for (const token of tokens) {
    if (!token) continue;
    if (!token.startsWith('<')) { buffer += token; continue; }

    const tag = /^<\/?\s*([a-z0-9]+)/i.exec(token)?.[1]?.toLowerCase();
    const closing = token.startsWith('</');
    if (!tag) continue;

    if (tag === 'br') { flush(); runs.push({ text: '\n', bold: false, italic: false, underline: false }); continue; }

    if (['strong', 'b', 'em', 'i', 'u'].includes(tag)) {
      flush();
      const delta = closing ? -1 : 1;
      if (tag === 'strong' || tag === 'b') bold += delta;
      else if (tag === 'em' || tag === 'i') italic += delta;
      else underline += delta;
    }
    // demais tags inline (span, a) são ignoradas, mantendo o texto
  }
  flush();
  return runs;
}

/** HTML do editor → lista achatada de blocos, na ordem do documento. */
export function htmlToBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  // captura blocos de topo e listas
  const re = /<(p|h2|h3|ul|ol)([^>]*)>([\s\S]*?)<\/\1>/gi;

  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const [, tag, attrs, inner] = match;
    const align = alignOf(attrs);
    const nome = tag.toLowerCase();

    if (nome === 'ul' || nome === 'ol') {
      const itens = [...inner.matchAll(/<li([^>]*)>([\s\S]*?)<\/li>/gi)];
      itens.forEach((li, i) => {
        const runs = parseRuns(li[2]);
        if (runs.length === 0) return;
        blocks.push({
          kind: 'listItem',
          runs,
          align: alignOf(li[1]) === 'left' ? align : alignOf(li[1]),
          marker: nome === 'ol' ? `${i + 1}.` : '-',
        });
      });
      continue;
    }

    const runs = parseRuns(inner);
    if (runs.length === 0 || runs.every((r) => !r.text.trim())) continue;

    if (nome === 'h2' || nome === 'h3') {
      blocks.push({ kind: 'heading', runs, align, level: nome === 'h2' ? 2 : 3 });
    } else {
      blocks.push({ kind: 'paragraph', runs, align });
    }
  }

  return blocks;
}
