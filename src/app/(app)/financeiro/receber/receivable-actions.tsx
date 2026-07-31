'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus, X } from 'lucide-react';
import {
  createReceivableAction, registerReceiptAction, cancelReceivableAction,
  reverseReceiptAction, deleteReceivableAction, type ActionState,
} from '@/actions/finance';
import { inputCls, Field, FormError, SubmitButton } from '@/components/ui';
import { ClientSelect } from '@/components/client-select';
import { formatBRL } from '@/lib/money';

export type ClientOption = { id: string; legalName: string; tradeName: string | null };

/** Lançamento avulso — cobranças que não vieram de um contrato. */
export function NewReceivable({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createReceivableAction, {});

  useEffect(() => {
    if (state.info) { setAberto(false); router.refresh(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
      >
        <Plus className="h-4 w-4" aria-hidden /> Nova cobrança
      </button>
    );
  }

  return (
    <form action={formAction} className="grid w-full gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
      <Field label="Cliente" htmlFor="r-client" required className="sm:col-span-2">
        <ClientSelect id="r-client" name="clientId" clients={clients} required />
      </Field>
      <Field label="Vencimento" htmlFor="r-due" required>
        <input id="r-due" name="dueDate" type="date" required className={inputCls} />
      </Field>
      <Field label="Valor (R$)" htmlFor="r-value" required>
        <input id="r-value" name="grossValue" required placeholder="0,00" className={inputCls} />
      </Field>
      <Field label="Descrição" htmlFor="r-desc" required className="sm:col-span-4">
        <input id="r-desc" name="description" required placeholder="Ex.: Projeto elétrico — entrada" className={inputCls} />
      </Field>
      <div className="sm:col-span-4"><FormError message={state.error} /></div>
      <div className="flex gap-2 sm:col-span-4">
        <SubmitButton pending={pending}>Lançar cobrança</SubmitButton>
        <button type="button" onClick={() => setAberto(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Baixa da parcela: já vem preenchida com hoje e o saldo em aberto. */
export function ReceiveButton({
  receivableId, saldo, cliente,
}: { receivableId: string; saldo: string; cliente: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const action = registerReceiptAction.bind(null, receivableId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  useEffect(() => {
    if (state.info) { setAberto(false); router.refresh(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-green-300 px-2.5 py-1 text-[11px] font-medium text-green-700 hover:bg-green-50"
      >
        <Check className="h-3 w-3" aria-hidden /> Receber
      </button>

      {aberto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="Registrar recebimento">
          <form action={formAction} className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Registrar recebimento</h3>
                <p className="text-xs text-slate-500">{cliente} · saldo de {formatBRL(saldo)}</p>
              </div>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="rounded p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Data" htmlFor="rc-date" required>
                <input
                  id="rc-date" name="receivedAt" type="date" required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className={inputCls}
                />
              </Field>
              <Field label="Valor recebido (R$)" htmlFor="rc-amount" required>
                <input id="rc-amount" name="amount" required defaultValue={saldo.replace('.', ',')} className={inputCls} />
              </Field>
              <Field label="Juros (R$)" htmlFor="rc-interest">
                <input id="rc-interest" name="interest" placeholder="0,00" className={inputCls} />
              </Field>
              <Field label="Multa (R$)" htmlFor="rc-fine">
                <input id="rc-fine" name="fine" placeholder="0,00" className={inputCls} />
              </Field>
              <Field label="Observação" htmlFor="rc-notes" className="sm:col-span-2">
                <input id="rc-notes" name="notes" className={inputCls} />
              </Field>
            </div>

            <p className="mt-2 text-[11px] text-slate-500">
              Valor menor que o saldo registra recebimento parcial e a parcela continua em aberto.
            </p>

            <div className="mt-3"><FormError message={state.error} /></div>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setAberto(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <SubmitButton pending={pending}>Confirmar</SubmitButton>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

/**
 * Desfaz a última baixa lançada — o caminho para recebimento registrado por
 * engano. O lançamento não some: fica no histórico como estornado.
 */
export function ReverseReceiptButton({ receivableId, valor }: { receivableId: string; valor: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Estornar o último recebimento (R$ ${valor})? O lançamento fica no histórico como estornado.`)) return;
          startTransition(async () => {
            const r = await reverseReceiptAction(receivableId);
            if (r.error) setErro(r.error);
            else router.refresh();
          });
        }}
        className="rounded-lg border border-amber-300 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
      >
        {pending ? 'Estornando…' : 'Estornar'}
      </button>
      {erro ? <p role="alert" className="mt-1 text-[11px] text-red-600">{erro}</p> : null}
    </>
  );
}

/** Exclusão lógica: para o lançamento feito por engano, sem baixa nem NF. */
export function DeleteReceivableButton({ receivableId }: { receivableId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm('Excluir esta parcela? Ela sai das listas e dos totais; o registro fica preservado na auditoria.')) return;
          startTransition(async () => {
            const r = await deleteReceivableAction(receivableId);
            if (r.error) setErro(r.error);
            else router.refresh();
          });
        }}
        className="rounded-lg border border-red-200 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        Excluir
      </button>
      {erro ? <p role="alert" className="mt-1 text-[11px] text-red-600">{erro}</p> : null}
    </>
  );
}

export function CancelReceivableButton({ receivableId }: { receivableId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm('Cancelar esta parcela?')) return;
          startTransition(async () => {
            const r = await cancelReceivableAction(receivableId);
            if (r.error) setErro(r.error);
            else router.refresh();
          });
        }}
        className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        Cancelar
      </button>
      {erro ? <p role="alert" className="mt-1 text-[11px] text-red-600">{erro}</p> : null}
    </>
  );
}
