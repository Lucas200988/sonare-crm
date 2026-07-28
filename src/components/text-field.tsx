'use client';

import { useState, useTransition } from 'react';
import { Check, RotateCcw, SpellCheck2 } from 'lucide-react';
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
export function ReviewableTextarea({
  id, value, onChange, rows = 4, placeholder, disabled, context, className = '',
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
}) {
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
      <textarea
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
