'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { moveStageAction } from '@/actions/opportunities';

type Stage = { id: string; name: string; kind: string };
type LossReason = { id: string; name: string };

export function StageSelect({
  opportunityId, currentStageId, stages, lossReasons,
}: {
  opportunityId: string;
  currentStageId: string;
  stages: Stage[];
  lossReasons: LossReason[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingLoss, setPendingLoss] = useState<string | null>(null);
  const [reasonId, setReasonId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  function move(targetStageId: string, lossReasonId?: string, lossNotes?: string) {
    setError(null);
    startTransition(async () => {
      const result = await moveStageAction({ opportunityId, targetStageId, lossReasonId, lossNotes });
      if (result.needsLossReason) {
        setPendingLoss(targetStageId);
        return;
      }
      if (result.error) {
        setError(result.error);
        return;
      }
      setPendingLoss(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <label htmlFor="stage-select" className="block text-xs font-medium uppercase tracking-wide text-slate-500">
        Etapa do pipeline
      </label>
      <select
        id="stage-select"
        value={pendingLoss ?? currentStageId}
        disabled={pending}
        onChange={(e) => move(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium"
      >
        {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>

      {pendingLoss ? (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-xs font-semibold text-red-800">Informe o motivo da perda:</p>
          <select
            value={reasonId}
            onChange={(e) => setReasonId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            aria-label="Motivo da perda"
          >
            <option value="">Selecione…</option>
            {lossReasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Observações (opcional)"
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!reasonId || pending}
              onClick={() => move(pendingLoss, reasonId, notes)}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
            >
              Confirmar perda
            </button>
            <button
              type="button"
              onClick={() => setPendingLoss(null)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-white"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
