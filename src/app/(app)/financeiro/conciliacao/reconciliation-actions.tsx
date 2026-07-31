'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Link2, Upload } from 'lucide-react';
import {
  importOfxAction, matchCandidatesAction, matchTransactionAction,
  ignoreTransactionAction, type ActionState,
} from '@/actions/reconciliation';
import { inputCls, FormError, SubmitButton } from '@/components/ui';
import { formatBRL } from '@/lib/money';
import { formatDateBR } from '@/lib/dates';

/** Envio do extrato: o input aceita .ofx e o resultado aparece na hora. */
export function ImportOfxForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(importOfxAction, {});

  useEffect(() => {
    if (state.info) router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <Upload className="h-4 w-4 text-brand" aria-hidden /> Importar extrato (OFX)
      </p>
      <p className="mb-3 text-xs text-slate-500">
        No internet banking, exporte o extrato no formato OFX e envie aqui. Importar o
        mesmo arquivo de novo não duplica nada.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file" name="arquivo" accept=".ofx,.OFX" required
          aria-label="Arquivo OFX do extrato"
          className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        <SubmitButton pending={pending}>Importar</SubmitButton>
      </div>
      {state.info ? <p className="mt-2 text-xs text-green-700">{state.info}</p> : null}
      <FormError message={state.error} />
    </form>
  );
}

type Candidato = { id: string; rotulo: string; valor: string; data: string | Date; exato: boolean };

/**
 * Ações de uma linha pendente do extrato: conciliar com um lançamento
 * existente ou ignorar (transferência interna, rendimento).
 *
 * Os candidatos só são buscados ao abrir — a lista pendente pode ter dezenas
 * de linhas e carregar candidatos de todas de uma vez seria desperdício.
 */
export function PendingRow({ id, entrada }: { id: string; entrada: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null);
  const [escolhido, setEscolhido] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  function abrir() {
    setAberto(true);
    setErro(null);
    startTransition(async () => {
      const r = await matchCandidatesAction(id);
      if ('error' in r) setErro(r.error ?? 'Falha ao buscar candidatos.');
      else setCandidatos(r.candidatos as Candidato[]);
    });
  }

  function conciliar() {
    if (!escolhido) return;
    startTransition(async () => {
      const r = await matchTransactionAction(
        id,
        entrada ? { receiptId: escolhido } : { payableId: escolhido },
      );
      if (r.error) setErro(r.error);
      else { setAberto(false); router.refresh(); }
    });
  }

  function ignorar() {
    if (!confirm('Ignorar esta linha do extrato? Use para transferências internas e rendimentos que não viram lançamento.')) return;
    startTransition(async () => {
      const r = await ignoreTransactionAction(id);
      if (r.error) setErro(r.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <button
          type="button" disabled={pending} onClick={aberto ? () => setAberto(false) : abrir}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          <Link2 className="h-3 w-3" aria-hidden /> {aberto ? 'Fechar' : 'Conciliar'}
        </button>
        <button
          type="button" disabled={pending} onClick={ignorar}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
        >
          <Ban className="h-3 w-3" aria-hidden /> Ignorar
        </button>
      </div>

      {aberto ? (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
          {candidatos === null ? (
            <p className="text-[11px] text-slate-500">Buscando lançamentos…</p>
          ) : candidatos.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              {entrada
                ? 'Nenhuma baixa de recebimento sem par. Registre o recebimento na aba "A receber" e volte aqui.'
                : 'Nenhuma conta paga sem par. Registre o pagamento na aba "A pagar" e volte aqui.'}
            </p>
          ) : (
            <div className="space-y-1.5">
              <select
                value={escolhido} onChange={(e) => setEscolhido(e.target.value)}
                className={`${inputCls} text-xs`} aria-label="Lançamento correspondente"
              >
                <option value="">Escolha o lançamento…</option>
                {candidatos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.exato ? '≈ ' : ''}{formatDateBR(new Date(c.data))} · {formatBRL(c.valor)} · {c.rotulo}
                  </option>
                ))}
              </select>
              <button
                type="button" disabled={pending || !escolhido} onClick={conciliar}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {pending ? 'Conciliando…' : 'Confirmar conciliação'}
              </button>
              <p className="text-[10px] text-slate-400">≈ marca os de valor idêntico ao do extrato.</p>
            </div>
          )}
          <FormError message={erro} />
        </div>
      ) : null}
    </div>
  );
}
