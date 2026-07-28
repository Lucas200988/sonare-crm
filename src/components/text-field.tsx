'use client';

import { useRef, useState, useTransition } from 'react';
import {
  Bold, Check, Heading, Italic, List, ListOrdered, RotateCcw, SpellCheck2,
} from 'lucide-react';
import { reviewTextAction } from '@/actions/ai';
import { inputCls } from '@/components/ui';

/**
 * Campo de texto longo com duas camadas de correção:
 *  1. corretor nativo do navegador (sublinhado vermelho, dicionário pt-BR);
 *  2. revisão por IA sob demanda — corrige ortografia, acentuação, pontuação
 *     e concordância sem reescrever o conteúdo técnico.
 *
 * A ação fica sobreposta ao canto do campo e só aparece ao focar ou passar o
 * mouse, para não poluir o formulário. O resultado é aplicado direto no texto,
 * com um "desfazer" temporário — sem caixas ou blocos extras.
 */
function ToolButton({ label, onClick, children }: {
  label: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // não perde a seleção do textarea
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded p-1.5 text-slate-500 transition hover:bg-white hover:text-slate-900"
    >
      {children}
    </button>
  );
}

export function ReviewableTextarea({
  id, value, onChange, rows = 4, placeholder, disabled, context, className = '',
  toolbar = false,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  /** Ajuda a IA a não "corrigir" jargão técnico. Ex.: "escopo de proposta de engenharia". */
  context?: string;
  className?: string;
  /** Exibe as ferramentas de formatação (negrito, itálico, listas, subtítulo). */
  toolbar?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [pending, startTransition] = useTransition();
  const [previous, setPrevious] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const temTexto = value.trim().length >= 3;
  // mostra a ação quando o campo está em uso; sempre visível enquanto há algo a desfazer
  const mostrarAcoes = !disabled && (focused || previous !== null || pending);

  function review() {
    setError(null);
    setHint(null);
    startTransition(async () => {
      const result = await reviewTextAction({ text: value, context });
      if ('error' in result) {
        setError(result.error);
        return;
      }
      if (!result.changed) {
        setHint('Sem correções');
        setTimeout(() => setHint(null), 2500);
        return;
      }
      setPrevious(value);
      onChange(result.text);
      setHint('Texto revisado');
    });
  }

  function undo() {
    if (previous === null) return;
    onChange(previous);
    setPrevious(null);
    setHint(null);
  }

  /** Aplica marcador ao redor da seleção; sem seleção, insere o par e posiciona o cursor no meio. */
  function wrapSelection(marker: string) {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const selecionado = value.slice(start, end);
    const novo = `${value.slice(0, start)}${marker}${selecionado}${marker}${value.slice(end)}`;
    onChange(novo);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + marker.length + selecionado.length;
      el.setSelectionRange(selecionado ? pos + marker.length : pos, selecionado ? pos + marker.length : pos);
    });
  }

  /** Aplica prefixo a cada linha selecionada — listas e subtítulo. */
  function prefixLines(mode: 'bullet' | 'numbered' | 'heading') {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
    const inicioLinha = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const fimBruto = value.indexOf('\n', selectionEnd);
    const fimLinha = fimBruto === -1 ? value.length : fimBruto;

    const linhas = value.slice(inicioLinha, fimLinha).split('\n');
    const transformadas = linhas.map((linha, i) => {
      const limpa = linha.replace(/^(\s*[-•]\s*|\s*\d+[.)]\s*)/, '');
      if (mode === 'bullet') return `- ${limpa}`;
      if (mode === 'numbered') return `${i + 1}. ${limpa}`;
      return limpa.toUpperCase();
    });

    const novo = value.slice(0, inicioLinha) + transformadas.join('\n') + value.slice(fimLinha);
    onChange(novo);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(inicioLinha, inicioLinha + transformadas.join('\n').length);
    });
  }

  return (
    <div
      className="relative"
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        // mantém visível enquanto o foco estiver dentro do bloco
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false);
      }}
      onMouseEnter={() => setFocused(true)}
      onMouseLeave={() => setFocused(false)}
    >
      {toolbar && !disabled ? (
        <div className="mb-1 flex flex-wrap items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 px-1 py-1">
          <ToolButton label="Negrito" onClick={() => wrapSelection('**')}><Bold className="h-3.5 w-3.5" aria-hidden /></ToolButton>
          <ToolButton label="Itálico" onClick={() => wrapSelection('_')}><Italic className="h-3.5 w-3.5" aria-hidden /></ToolButton>
          <span className="mx-1 h-4 w-px bg-slate-300" aria-hidden />
          <ToolButton label="Subtítulo" onClick={() => prefixLines('heading')}><Heading className="h-3.5 w-3.5" aria-hidden /></ToolButton>
          <ToolButton label="Lista com marcadores" onClick={() => prefixLines('bullet')}><List className="h-3.5 w-3.5" aria-hidden /></ToolButton>
          <ToolButton label="Lista numerada" onClick={() => prefixLines('numbered')}><ListOrdered className="h-3.5 w-3.5" aria-hidden /></ToolButton>
        </div>
      ) : null}

      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck
        lang="pt-BR"
        className={`${inputCls} ${mostrarAcoes ? 'pb-7' : ''} ${className}`}
      />

      {mostrarAcoes ? (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-end gap-1.5">
          {hint ? (
            <span className="pointer-events-none flex items-center gap-1 rounded bg-white/90 px-1.5 text-[11px] text-slate-500">
              {hint === 'Texto revisado' ? <Check className="h-3 w-3 text-green-600" aria-hidden /> : null}
              {hint}
            </span>
          ) : null}

          {previous !== null ? (
            <button
              type="button"
              onClick={undo}
              className="pointer-events-auto inline-flex items-center gap-1 rounded bg-white/95 px-1.5 py-0.5 text-[11px] text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:text-slate-800"
              title="Voltar ao texto anterior"
            >
              <RotateCcw className="h-3 w-3" aria-hidden /> Desfazer
            </button>
          ) : null}

          <button
            type="button"
            onClick={review}
            disabled={pending || !temTexto}
            title="Revisar ortografia e gramática"
            aria-label="Revisar ortografia e gramática"
            className="pointer-events-auto inline-flex items-center gap-1 rounded bg-white/95 px-1.5 py-0.5 text-[11px] text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:text-brand disabled:opacity-40"
          >
            <SpellCheck2 className={`h-3.5 w-3.5 ${pending ? 'animate-pulse text-brand' : ''}`} aria-hidden />
            {pending ? 'Revisando…' : 'Revisar'}
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-1 text-[11px] text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
