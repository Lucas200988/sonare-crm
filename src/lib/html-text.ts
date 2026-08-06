/**
 * Conversões entre o HTML do editor e texto puro.
 *
 * Os campos do orçamento passaram a guardar um HTML restrito (negrito, itálico,
 * sublinhado, listas, alinhamento e títulos). O texto puro continua sendo usado
 * pela revisão por IA e pelos orçamentos antigos, que foram salvos sem marcação.
 */

/**
 * Campo sem conteúdo real.
 *
 * O editor guarda "<p></p>" quando está vazio, e um item de lista sem texto
 * vira só o marcador — que renderizaria um traço solto embaixo do título da
 * seção, na proposta que vai para o cliente. Marcador sem texto não é
 * conteúdo.
 */
export function isEmptyRich(value: string | null | undefined): boolean {
  if (!value) return true;
  return htmlToText(value).replace(/^[-•]\s*$/gm, '').trim() === '';
}

/** Um valor salvo antes do editor rico não tem tags — é tratado como texto puro. */
export function isHtml(value: string): boolean {
  return /<(p|ul|ol|li|h[1-6]|strong|em|u|br)\b/i.test(value);
}

/** Texto puro → HTML, preservando linhas e transformando "- " em lista. */
export function textToHtml(text: string): string {
  const linhas = text.split('\n');
  const partes: string[] = [];
  let lista: string[] = [];

  const fecharLista = () => {
    if (lista.length > 0) {
      partes.push(`<ul>${lista.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`);
      lista = [];
    }
  };

  for (const linha of linhas) {
    const t = linha.trim();
    if (t.startsWith('-') || t.startsWith('•')) {
      lista.push(t.replace(/^[-•]\s*/, ''));
      continue;
    }
    fecharLista();
    if (t) partes.push(`<p>${escapeHtml(t)}</p>`);
  }
  fecharLista();
  return partes.join('') || '<p></p>';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** HTML → texto puro legível (usado na revisão por IA e em buscas). */
export function htmlToText(html: string): string {
  return html
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|h[1-6]|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .split('\n').map((l) => l.trim()).join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Acrescenta um bloco de texto puro (vindo do assistente de escopo) a um campo
 * que pode conter HTML formatado — sem desmontar a formatação já existente.
 */
export function appendTextToHtml(currentHtml: string, block: string): string {
  const novo = textToHtml(block);
  const atual = currentHtml.trim();
  if (!atual || atual === '<p></p>') return novo;
  return isHtml(atual) ? atual + novo : textToHtml(htmlToText(atual)) + novo;
}

/** Conteúdo pronto para o editor, venha ele do formato antigo ou do novo. */
export function toEditorHtml(value: string): string {
  const v = value.trim();
  if (!v) return '<p></p>';
  return isHtml(v) ? v : textToHtml(v);
}
