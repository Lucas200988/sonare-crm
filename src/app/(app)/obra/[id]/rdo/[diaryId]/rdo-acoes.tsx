'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PenLine, RotateCcw } from 'lucide-react';
import { assinarRdoAction, reabrirDiarioAction, legendarFotoAction } from '@/actions/diario-relatorio';
import { inputCls } from '@/components/ui';

/** Botão de assinar um papel do RDO, com campo opcional de registro (CREA/CAU). */
export function AssinarPapel({ diaryId, projectId, papel, rotulo }: {
  diaryId: string; projectId: string; papel: string; rotulo: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [registro, setRegistro] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function assinar() {
    startTransition(async () => {
      setErro(null);
      const r = await assinarRdoAction(diaryId, projectId, papel, registro.trim() || null);
      if (r.error) { setErro(r.error); return; }
      setAberto(false);
      router.refresh();
    });
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-brand/40 px-2.5 py-1 text-[11px] font-medium text-brand hover:bg-brand-light"
      >
        <PenLine className="h-3 w-3" aria-hidden /> Assinar
      </button>
    );
  }

  return (
    <div className="mt-1 space-y-1.5">
      <p className="text-[11px] text-slate-600">
        Assinar como <strong>{rotulo}</strong> com seu usuário — fica registrado nome, data e hora.
      </p>
      <input
        value={registro}
        onChange={(e) => setRegistro(e.target.value)}
        placeholder="Registro profissional (opcional)"
        className={`${inputCls} py-1 text-xs`}
      />
      <div className="flex justify-center gap-1.5">
        <button
          type="button" disabled={pending} onClick={assinar}
          className="rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : 'Confirmar assinatura'}
        </button>
        <button
          type="button" onClick={() => setAberto(false)}
          className="rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] text-slate-600"
        >
          Cancelar
        </button>
      </div>
      {erro ? <p className="text-[11px] text-red-700">{erro}</p> : null}
    </div>
  );
}

export function ReabrirRelatorio({ diaryId, projectId }: { diaryId: string; projectId: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => {
          setErro(null);
          const r = await reabrirDiarioAction(diaryId, projectId);
          if (r.error) { setErro(r.error); return; }
          router.refresh();
        })}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        {pending ? 'Reabrindo…' : 'Reabrir para correção'}
      </button>
      {erro ? <span className="text-[11px] text-red-700">{erro}</span> : null}
    </span>
  );
}

/** Legenda da foto, editável enquanto o relatório está aberto. */
export function LegendaFoto({ fotoId, projectId, inicial, editavel }: {
  fotoId: string; projectId: string; inicial: string | null; editavel: boolean;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState(inicial ?? '');
  const [pending, startTransition] = useTransition();

  if (!editavel) {
    return inicial ? <p className="mt-1 text-[11px] text-slate-600">{inicial}</p> : null;
  }

  function salvar() {
    if (texto === (inicial ?? '')) return;
    startTransition(async () => {
      await legendarFotoAction(fotoId, projectId, texto);
      router.refresh();
    });
  }

  return (
    <input
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={salvar}
      placeholder="Legenda da foto…"
      disabled={pending}
      className="mt-1 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-700 placeholder:text-slate-400 focus:border-brand focus:outline-none disabled:opacity-60"
    />
  );
}
