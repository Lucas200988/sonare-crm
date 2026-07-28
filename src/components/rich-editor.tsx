'use client';

import { useEffect, useState, useTransition } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Check, Heading2,
  Italic, List, ListOrdered, Redo2, RotateCcw, SpellCheck2, Underline as UnderlineIcon, Undo2,
} from 'lucide-react';
import { reviewTextAction } from '@/actions/ai';
import { htmlToText, toEditorHtml } from '@/lib/html-text';

/**
 * Editor de texto com as ferramentas essenciais do Word.
 *
 * Colar do Word/Google Docs preserva a estrutura (negrito, itálico, sublinhado,
 * listas, alinhamento e títulos), mas fonte, tamanho e cor são normalizados —
 * a proposta sai sempre com a identidade visual da SONARE, sem remendos.
 */
export function RichEditor({
  value, onChange, disabled, context, minHeight = 180,
}: {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  /** Ajuda a IA a não "corrigir" jargão técnico. */
  context?: string;
  minHeight?: number;
}) {
  const [pending, startTransition] = useTransition();
  const [previous, setPrevious] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false, // o conteúdo vem do servidor; evita divergência de hidratação
    editable: !disabled,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: toEditorHtml(value),
    editorProps: {
      attributes: {
        class: 'prose-sonare focus:outline-none',
        style: `min-height:${minHeight}px`,
      },
      // Descarta fonte, tamanho e cor do conteúdo colado; a estrutura é mantida
      transformPastedHTML: (html) => limparHtmlColado(html),
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  // Conteúdo trocado de fora (assistente de escopo, modelo aplicado)
  useEffect(() => {
    if (!editor) return;
    const atual = editor.getHTML();
    const novo = toEditorHtml(value);
    if (novo !== atual) editor.commands.setContent(novo, { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  function revisar() {
    if (!editor) return;
    setError(null);
    setHint(null);
    const texto = htmlToText(editor.getHTML());
    if (texto.trim().length < 3) return;

    startTransition(async () => {
      const result = await reviewTextAction({ text: texto, context });
      if ('error' in result) { setError(result.error); return; }
      if (!result.changed) {
        setHint('Sem correções');
        setTimeout(() => setHint(null), 2500);
        return;
      }
      setPrevious(editor.getHTML());
      // A revisão devolve texto puro; reaplica preservando a estrutura de listas
      editor.commands.setContent(toEditorHtml(result.text));
      onChange(editor.getHTML());
      setHint('Texto revisado');
    });
  }

  function desfazerRevisao() {
    if (!editor || previous === null) return;
    editor.commands.setContent(previous);
    onChange(previous);
    setPrevious(null);
    setHint(null);
  }

  if (!editor) {
    return <div className="rounded-lg border border-slate-300 bg-slate-50" style={{ minHeight }} />;
  }

  return (
    <div className={`rounded-lg border border-slate-300 bg-white ${disabled ? 'opacity-60' : ''}`}>
      {!disabled ? (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-1.5 py-1">
          <Tool editor={editor} label="Negrito" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="h-3.5 w-3.5" aria-hidden />
          </Tool>
          <Tool editor={editor} label="Itálico" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="h-3.5 w-3.5" aria-hidden />
          </Tool>
          <Tool editor={editor} label="Sublinhado" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <UnderlineIcon className="h-3.5 w-3.5" aria-hidden />
          </Tool>

          <Divider />

          <Tool editor={editor} label="Título" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 className="h-3.5 w-3.5" aria-hidden />
          </Tool>
          <Tool editor={editor} label="Lista com marcadores" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List className="h-3.5 w-3.5" aria-hidden />
          </Tool>
          <Tool editor={editor} label="Lista numerada" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered className="h-3.5 w-3.5" aria-hidden />
          </Tool>

          <Divider />

          <Tool editor={editor} label="Alinhar à esquerda" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
            <AlignLeft className="h-3.5 w-3.5" aria-hidden />
          </Tool>
          <Tool editor={editor} label="Centralizar" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
            <AlignCenter className="h-3.5 w-3.5" aria-hidden />
          </Tool>
          <Tool editor={editor} label="Alinhar à direita" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
            <AlignRight className="h-3.5 w-3.5" aria-hidden />
          </Tool>
          <Tool editor={editor} label="Justificar" active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}>
            <AlignJustify className="h-3.5 w-3.5" aria-hidden />
          </Tool>

          <Divider />

          <Tool editor={editor} label="Desfazer" onClick={() => editor.chain().focus().undo().run()}>
            <Undo2 className="h-3.5 w-3.5" aria-hidden />
          </Tool>
          <Tool editor={editor} label="Refazer" onClick={() => editor.chain().focus().redo().run()}>
            <Redo2 className="h-3.5 w-3.5" aria-hidden />
          </Tool>

          <div className="ml-auto flex items-center gap-1.5">
            {hint ? (
              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                {hint === 'Texto revisado' ? <Check className="h-3 w-3 text-green-600" aria-hidden /> : null}
                {hint}
              </span>
            ) : null}
            {previous !== null ? (
              <button
                type="button" onClick={desfazerRevisao}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-500 hover:text-slate-800"
                title="Voltar ao texto antes da revisão"
              >
                <RotateCcw className="h-3 w-3" aria-hidden /> Desfazer revisão
              </button>
            ) : null}
            <button
              type="button" onClick={revisar} disabled={pending}
              title="Revisar ortografia e gramática"
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-500 transition hover:text-brand disabled:opacity-40"
            >
              <SpellCheck2 className={`h-3.5 w-3.5 ${pending ? 'animate-pulse text-brand' : ''}`} aria-hidden />
              {pending ? 'Revisando…' : 'Revisar'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="px-3 py-2">
        <EditorContent editor={editor} />
      </div>

      {error ? <p role="alert" className="px-3 pb-2 text-[11px] text-red-600">{error}</p> : null}
    </div>
  );
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-slate-300" aria-hidden />;
}

function Tool({ label, active, onClick, children }: {
  editor: Editor;
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`rounded p-1.5 transition ${active ? 'bg-white text-brand shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:bg-white hover:text-slate-900'}`}
    >
      {children}
    </button>
  );
}

/**
 * Limpa o HTML vindo do Word/Docs: remove fonte, tamanho, cor e o lixo de
 * marcação do Office, mantendo apenas a estrutura que sabemos renderizar no PDF.
 */
export function limparHtmlColado(html: string): string {
  return html
    // comentários condicionais e metadados do Word
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(style|meta|link|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(meta|link)[^>]*>/gi, '')
    // tags proprietárias do Office (<o:p>, <w:...>)
    .replace(/<\/?[a-z]+:[^>]*>/gi, '')
    // atributos de aparência; o alinhamento é preservado logo abaixo
    .replace(/\s(class|face|color|bgcolor|width|height|lang|dir)="[^"]*"/gi, '')
    .replace(/\sstyle="([^"]*)"/gi, (_m, style: string) => {
      const align = /text-align:\s*(left|center|right|justify)/i.exec(style);
      return align ? ` style="text-align:${align[1].toLowerCase()}"` : '';
    })
    // <font> e <span> sem função após a limpeza
    .replace(/<\/?font[^>]*>/gi, '')
    .replace(/<span\s*>/gi, '')
    .replace(/<\/span>/gi, '');
}
