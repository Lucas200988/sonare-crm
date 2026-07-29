import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PmNode } from '@tiptap/pm/model';

/**
 * Sublinha em vermelho, enquanto se digita, as palavras que o dicionário do
 * sistema não reconhece — e abre as sugestões no botão direito.
 *
 * O corretor nativo do navegador depende do dicionário de português estar
 * instalado em cada máquina, o que não dá para garantir na equipe. Este roda
 * contra a API /api/ortografia e vale para todo mundo.
 */

export type PalavraErrada = {
  palavra: string;
  de: number;
  ate: number;
  sugestoes: string[];
};

export type MenuCorretor = {
  x: number;
  y: number;
  erro: PalavraErrada;
};

export type CorretorOptions = {
  /** Consulta o servidor; devolve só as erradas, com sugestões. */
  verificar: (palavras: string[]) => Promise<Record<string, string[]>>;
  /** Abre (ou fecha, com null) o menu de sugestões. */
  onMenu: (menu: MenuCorretor | null) => void;
};

export const corretorKey = new PluginKey<DecorationSet>('corretor');

/**
 * O que não vale a pena checar: palavras curtas, números e siglas em caixa
 * alta (SPDA, ABNT, QGBT). Marcá-las encheria o texto de vermelho à toa.
 */
function vale(palavra: string): boolean {
  if (palavra.length < 3) return false;
  if (/\d/.test(palavra)) return false;
  if (palavra === palavra.toUpperCase()) return false;
  return true;
}

const PALAVRA = /[\p{L}\p{M}][\p{L}\p{M}'-]*/gu;

/** Palavras do documento com a posição absoluta de cada uma. */
function extrairPalavras(doc: PmNode) {
  const achadas: Array<{ palavra: string; de: number; ate: number }> = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    for (const m of node.text.matchAll(PALAVRA)) {
      const limpa = m[0].replace(/^[-']+|[-']+$/g, '');
      if (!limpa || !vale(limpa)) continue;
      const desloc = m[0].indexOf(limpa);
      achadas.push({
        palavra: limpa,
        de: pos + (m.index ?? 0) + desloc,
        ate: pos + (m.index ?? 0) + desloc + limpa.length,
      });
    }
  });
  return achadas;
}

export const Corretor = Extension.create<CorretorOptions>({
  name: 'corretor',

  addOptions() {
    return {
      verificar: async () => ({}),
      onMenu: () => {},
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    // Cada palavra é perguntada ao servidor uma única vez por edição.
    const cache = new Map<string, string[] | null>();
    let erros: PalavraErrada[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    let vivo = true;

    return [
      new Plugin<DecorationSet>({
        key: corretorKey,

        state: {
          init: () => DecorationSet.empty,
          apply(tr, antigo) {
            const novo = tr.getMeta(corretorKey) as DecorationSet | undefined;
            if (novo) return novo;
            // Move as marcas junto com o texto; sem isto o sublinhado
            // ficaria deslocado a cada tecla até a próxima verificação.
            return antigo.map(tr.mapping, tr.doc);
          },
        },

        props: {
          decorations(state) {
            return corretorKey.getState(state);
          },
          handleDOMEvents: {
            contextmenu(view, event) {
              const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
              if (!pos) return false;
              const erro = erros.find((e) => pos.pos >= e.de && pos.pos <= e.ate);
              if (!erro) return false;
              event.preventDefault();
              options.onMenu({ x: event.clientX, y: event.clientY, erro });
              return true;
            },
          },
        },

        view(view) {
          async function revisar() {
            const palavras = extrairPalavras(view.state.doc);

            const novas = [...new Set(
              palavras.map((p) => p.palavra.toLowerCase()).filter((p) => !cache.has(p)),
            )];
            if (novas.length > 0) {
              try {
                const erradas = await options.verificar(novas);
                for (const p of novas) cache.set(p, erradas[p] ?? null);
              } catch {
                return; // sem servidor, o texto simplesmente não é marcado
              }
            }
            if (!vivo) return;

            erros = palavras
              .map((p) => ({ ...p, sugestoes: cache.get(p.palavra.toLowerCase()) }))
              .filter((p): p is PalavraErrada => Array.isArray(p.sugestoes));

            view.dispatch(view.state.tr.setMeta(
              corretorKey,
              DecorationSet.create(
                view.state.doc,
                erros.map((e) => Decoration.inline(e.de, e.ate, { class: 'erro-ortografico' })),
              ),
            ));
          }

          // Espera a pessoa parar de digitar; marcar a cada tecla piscaria.
          function agendar() {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => void revisar(), 600);
          }

          agendar();

          return {
            update(v, anterior) {
              if (!v.state.doc.eq(anterior.doc)) {
                options.onMenu(null);
                agendar();
              }
            },
            destroy() {
              vivo = false;
              if (timer) clearTimeout(timer);
            },
          };
        },
      }),
    ];
  },
});
