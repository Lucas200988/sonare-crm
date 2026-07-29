/**
 * Ajustes de digitação aplicados na hora, sem depender de IA.
 *
 * São correções mecânicas e seguras — as que aparecem em quase todo texto
 * escrito com pressa. O que exige julgamento (concordância, regência) continua
 * a cargo da revisão por IA.
 */

/** Trocas frequentes em texto técnico de engenharia, sempre respeitando a caixa. */
const TROCAS: Array<[RegExp, string]> = [
  // unidades e abreviações
  [/\bm2\b/g, 'm²'],
  [/\bm3\b/g, 'm³'],
  [/\b(\d+)\s?m2\b/g, '$1 m²'],
  [/\bkva\b/gi, 'kVA'],
  [/\bkw\b/gi, 'kW'],
  [/\bkwh\b/gi, 'kWh'],
  [/\bcv\b/g, 'CV'],
  // normas e conselhos
  [/\babnt\s*nbr\b/gi, 'ABNT NBR'],
  [/\bnbr\s*(\d)/gi, 'NBR $1'],
  [/\bcrea\b/gi, 'CREA'],
  [/\bcau\b/gi, 'CAU'],
  [/\bart\b(?=\s|,|\.|$)/g, 'ART'],
  [/\bspda\b/gi, 'SPDA'],
  [/\bqgbt\b/gi, 'QGBT'],
  [/\bufv\b/gi, 'UFV'],
  [/\bnr\s*10\b/gi, 'NR-10'],
  [/\bnr\s*35\b/gi, 'NR-35'],
  // erros de digitação comuns
  [/\bpra\b/g, 'para'],
  [/\bnao\b/g, 'não'],
  [/\bsao\b/g, 'são'],
  [/\bservico\b/gi, 'serviço'],
  [/\bservicos\b/gi, 'serviços'],
  [/\bprojeo\b/gi, 'projeto'],
  [/\beletrico\b/gi, 'elétrico'],
  [/\beletrica\b/gi, 'elétrica'],
  [/\btecnico\b/gi, 'técnico'],
  [/\btecnica\b/gi, 'técnica'],
  [/\brelatorio\b/gi, 'relatório'],
  [/\bmemoria\b(?=\s+de\s+c)/gi, 'memória'],
];

/** Aplica as trocas preservando maiúscula inicial da palavra original. */
function aplicarTrocas(texto: string): string {
  let saida = texto;
  for (const [de, para] of TROCAS) {
    saida = saida.replace(de, (encontrado, ...grupos) => {
      const substituto = para.replace(/\$(\d)/g, (_m, i) => String(grupos[Number(i) - 1] ?? ''));
      // "Servico" no início da frase continua "Serviço", não "serviço"
      if (/^[A-ZÀ-Ú]/.test(encontrado) && /^[a-zà-ú]/.test(substituto)) {
        return substituto.charAt(0).toUpperCase() + substituto.slice(1);
      }
      return substituto;
    });
  }
  return saida;
}

/**
 * Espaçamento e pontuação: tira espaço antes de vírgula, garante espaço
 * depois, remove espaços duplicados e fecha parênteses corretamente.
 */
function ajustarPontuacao(texto: string): string {
  return texto
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,;.!?:])/g, '$1')
    .replace(/([,;])(?=[^\s\d])/g, '$1 ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/[ \t]+$/gm, '');
}

/** Primeira letra da frase em maiúscula, sem estragar siglas nem decimais. */
function capitalizarFrases(texto: string): string {
  return texto.replace(
    /(^|[.!?]\s+|\n\s*)([a-zà-ú])/g,
    (_m, antes: string, letra: string) => antes + letra.toUpperCase(),
  );
}

export type OpcoesLimpeza = {
  trocas?: boolean;
  pontuacao?: boolean;
  capitalizar?: boolean;
};

/** Limpa uma linha de texto simples. */
export function limparTexto(texto: string, opcoes: OpcoesLimpeza = {}): string {
  const { trocas = true, pontuacao = true, capitalizar = true } = opcoes;
  let saida = texto;
  if (pontuacao) saida = ajustarPontuacao(saida);
  if (trocas) saida = aplicarTrocas(saida);
  if (capitalizar) saida = capitalizarFrases(saida);
  return saida;
}

/**
 * Limpa o HTML do editor sem tocar nas tags — só o texto entre elas. Assim a
 * formatação (negrito, listas, alinhamento) sobrevive à correção.
 */
export function limparHtml(html: string, opcoes: OpcoesLimpeza = {}): string {
  return html.replace(/>([^<]+)</g, (_m, conteudo: string) => {
    // espaços de indentação entre tags não são texto de verdade
    if (!conteudo.trim()) return `>${conteudo}<`;
    return `>${limparTexto(conteudo, opcoes)}<`;
  });
}

/**
 * Quantas palavras a limpeza mudou.
 *
 * A comparação é por multiconjunto, não por posição: uma palavra inserida no
 * início deslocaria todas as seguintes e faria a contagem explodir, dando a
 * impressão de que o texto inteiro foi reescrito.
 */
export function contarAjustes(original: string, limpo: string): number {
  if (original === limpo) return 0;

  const contar = (texto: string) => {
    const mapa = new Map<string, number>();
    for (const palavra of texto.split(/\s+/).filter(Boolean)) {
      mapa.set(palavra, (mapa.get(palavra) ?? 0) + 1);
    }
    return mapa;
  };

  const antes = contar(original);
  const depois = contar(limpo);

  // palavras que sumiram (foram corrigidas) contam como um ajuste cada
  let mudou = 0;
  for (const [palavra, quantidade] of antes) {
    const restante = depois.get(palavra) ?? 0;
    if (restante < quantidade) mudou += quantidade - restante;
  }
  return mudou;
}
