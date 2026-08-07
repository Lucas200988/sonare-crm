'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Clock, HelpCircle, Stamp } from 'lucide-react';
import { setProjectArtAction } from '@/actions/projects';
import { emitirTechRespAction } from '@/actions/tech-resp';
import { inputCls, FormError, SubmitButton } from '@/components/ui';
import { situacaoArt, type ArtRegistrada, type ArtStatus } from '@/lib/art-projeto';
import { formatDateBR } from '@/lib/dates';

const ESTILO = {
  ok: { classe: 'border-green-200 bg-green-50 text-green-900', Icone: CheckCircle2 },
  emitindo: { classe: 'border-amber-200 bg-amber-50 text-amber-900', Icone: Clock },
  pendente: { classe: 'border-red-200 bg-red-50 text-red-900', Icone: AlertTriangle },
  indefinido: { classe: 'border-amber-200 bg-amber-50 text-amber-900', Icone: HelpCircle },
};

const STATUS_ART: Record<string, string> = {
  PENDENTE: 'pendente de emissão',
  EMITIDA: 'emitida',
  BAIXADA: 'baixada',
  CANCELADA: 'cancelada',
};

export type ArtDoProjeto = ArtRegistrada & {
  id: string;
  docType: string;
  issuedAt: string | null;
};

/**
 * Responsabilidade técnica do projeto, no cartão.
 *
 * A pergunta "precisa de ART?" mora aqui porque quem sabe responder é quem
 * conduz o projeto. O número continua no módulo de ART — este painel só
 * cruza a decisão com o que foi registrado lá e cobra quando falta.
 */
export function ArtPanel({
  projectId, status, notes, arts, canWrite,
}: {
  projectId: string;
  status: ArtStatus;
  notes: string | null;
  arts: ArtDoProjeto[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const action = setProjectArtAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, {});
  const [escolha, setEscolha] = useState<ArtStatus>(status);

  useEffect(() => {
    if (state.info) { setEditando(false); router.refresh(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const situacao = situacaoArt(status, arts);
  const s = ESTILO[situacao.nivel];

  return (
    <div className={`rounded-lg border p-3 ${s.classe}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <s.Icone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="text-sm font-semibold">{situacao.rotulo}</p>
            <p className="text-xs opacity-90">{situacao.detalhe}</p>
            {status === 'DISPENSADA' && notes ? (
              <p className="mt-1 text-xs italic opacity-80">Motivo: {notes}</p>
            ) : null}
          </div>
        </div>

        {canWrite && !editando ? (
          <button
            type="button"
            onClick={() => { setEscolha(status); setEditando(true); }}
            className="rounded-lg border border-current/30 bg-white/70 px-2.5 py-1 text-xs font-medium hover:bg-white"
          >
            {status === 'NAO_INFORMADO' ? 'Informar' : 'Alterar'}
          </button>
        ) : null}
      </div>

      {arts.length > 0 ? (
        <ul className="mt-2 space-y-1 border-t border-current/20 pt-2">
          {arts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-1.5 text-xs">
              <Stamp className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
              <span className="font-medium">{a.docType} {a.numero}</span>
              <span className="opacity-70">
                · {STATUS_ART[a.status] ?? a.status.toLowerCase()}
                {a.issuedAt ? ` · ${formatDateBR(a.issuedAt)}` : ''}
              </span>
              {canWrite && a.status === 'PENDENTE' ? (
                <EmitirArt artId={a.id} projectId={projectId} />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {editando ? (
        <form action={formAction} className="mt-3 space-y-2 border-t border-current/20 pt-3">
          <div className="flex flex-wrap gap-2">
            {(['NECESSARIA', 'DISPENSADA'] as const).map((v) => (
              <label
                key={v}
                className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-xs font-medium ${
                  escolha === v ? 'border-slate-800 bg-white' : 'border-slate-300 bg-white/60'
                }`}
              >
                <input
                  type="radio" name="status" value={v} checked={escolha === v}
                  onChange={() => setEscolha(v)} className="mr-1.5"
                />
                {v === 'NECESSARIA' ? 'Precisa de ART' : 'Não precisa de ART'}
              </label>
            ))}
          </div>

          {escolha === 'DISPENSADA' ? (
            <div>
              <input
                name="notes" defaultValue={notes ?? ''} required
                placeholder="Por que dispensa? Ex.: consultoria sem projeto executivo"
                className={inputCls}
                aria-label="Motivo da dispensa"
              />
              <p className="mt-1 text-[11px] opacity-75">
                Fica registrado com seu nome — é a decisão que alguém vai precisar defender.
              </p>
            </div>
          ) : (
            <p className="text-[11px] opacity-75">
              O número é registrado em{' '}
              <Link href="/art" className="underline">ART / RRT</Link>, vinculado a este projeto.
            </p>
          )}

          <FormError message={state.error} />
          <div className="flex gap-2">
            <SubmitButton pending={pending}>Salvar</SubmitButton>
            <button
              type="button" onClick={() => setEditando(false)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

/**
 * Passa a ART de "pendente" para "emitida", sem sair do projeto.
 *
 * Faltava esse caminho: o registro nascia pendente e só dava para cancelar,
 * então o projeto ficava marcado como coberto por um documento que ainda
 * não existia no conselho.
 */
function EmitirArt({ artId, projectId }: { artId: string; projectId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const acao = emitirTechRespAction.bind(null, artId, projectId);
  const [state, formAction, pending] = useActionState(acao, {});

  useEffect(() => {
    if (state.info) { setAberto(false); router.refresh(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded border border-current/30 bg-white/70 px-1.5 py-0.5 text-[11px] font-medium hover:bg-white"
      >
        Marcar como emitida
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1.5">
      <input
        name="issuedAt" type="date" required
        defaultValue={new Date().toISOString().slice(0, 10)}
        aria-label="Data de emissão"
        className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px]"
      />
      <button
        type="submit" disabled={pending}
        className="rounded bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-slate-700 disabled:opacity-60"
      >
        {pending ? 'Salvando…' : 'Confirmar'}
      </button>
      <button
        type="button" onClick={() => setAberto(false)}
        className="text-[11px] underline opacity-70"
      >
        Cancelar
      </button>
      {state.error ? <span className="text-[11px] text-red-700">{state.error}</span> : null}
    </form>
  );
}
