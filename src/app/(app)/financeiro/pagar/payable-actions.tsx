'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import {
  createPayableAction, payPayableAction, reopenPayableAction, deletePayableAction,
  type ActionState,
} from '@/actions/finance';
import { inputCls, Field, FormError, SubmitButton } from '@/components/ui';
import { formatBRL } from '@/lib/money';

export type ProjectOption = { id: string; code: string; name: string };

/** Categorias sugeridas — texto livre, sem cadastro para não burocratizar. */
const CATEGORIAS = [
  'Fornecedores', 'Impostos', 'Salários e encargos', 'Aluguel', 'Água, luz e internet',
  'Software e assinaturas', 'Deslocamento', 'Taxas (CREA, prefeitura)', 'Outros',
];

export function NewPayable({ projects }: { projects: ProjectOption[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createPayableAction, {});

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
        <Plus className="h-4 w-4" aria-hidden /> Nova conta
      </button>
    );
  }

  return (
    <form action={formAction} className="grid w-full gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
      <Field label="Descrição" htmlFor="p-desc" required className="sm:col-span-2">
        <input id="p-desc" name="description" required placeholder="Ex.: Energia elétrica — julho" className={inputCls} />
      </Field>
      <Field label="Vencimento" htmlFor="p-due" required>
        <input id="p-due" name="dueDate" type="date" required className={inputCls} />
      </Field>
      <Field label="Valor (R$)" htmlFor="p-amount" required>
        <input id="p-amount" name="amount" required placeholder="0,00" className={inputCls} />
      </Field>
      <Field label="Fornecedor" htmlFor="p-supplier">
        <input id="p-supplier" name="supplier" className={inputCls} />
      </Field>
      <Field label="Categoria" htmlFor="p-category">
        <input id="p-category" name="category" list="categorias-conta" className={inputCls} />
        <datalist id="categorias-conta">
          {CATEGORIAS.map((c) => <option key={c} value={c} />)}
        </datalist>
      </Field>
      <Field label="Projeto (opcional)" htmlFor="p-project" className="sm:col-span-2">
        <select id="p-project" name="projectId" defaultValue="" className={inputCls}>
          <option value="">Despesa geral</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
      </Field>
      <div className="sm:col-span-4"><FormError message={state.error} /></div>
      <div className="flex gap-2 sm:col-span-4">
        <SubmitButton pending={pending}>Lançar conta</SubmitButton>
        <button type="button" onClick={() => setAberto(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function PayButton({ payableId, valor, descricao }: {
  payableId: string; valor: string; descricao: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const action = payPayableAction.bind(null, payableId);
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
        <Check className="h-3 w-3" aria-hidden /> Pagar
      </button>

      {aberto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="Registrar pagamento">
          <form action={formAction} className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Registrar pagamento</h3>
                <p className="text-xs text-slate-500">{descricao} · {formatBRL(valor)}</p>
              </div>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="rounded p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Data do pagamento" htmlFor="pp-date" required>
                <input
                  id="pp-date" name="paidAt" type="date" required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className={inputCls}
                />
              </Field>
              <Field label="Valor pago (R$)" htmlFor="pp-amount" required>
                <input id="pp-amount" name="paidAmount" required defaultValue={valor.replace('.', ',')} className={inputCls} />
              </Field>
            </div>

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

export function ReopenButton({ payableId }: { payableId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      title="Desfazer o pagamento"
      onClick={() => startTransition(async () => {
        await reopenPayableAction(payableId);
        router.refresh();
      })}
      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
    >
      <RotateCcw className="h-3 w-3" aria-hidden /> Desfazer
    </button>
  );
}

export function DeletePayableButton({ payableId }: { payableId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-label="Remover conta"
      title="Remover"
      onClick={() => {
        if (!confirm('Remover esta conta?')) return;
        startTransition(async () => {
          await deletePayableAction(payableId);
          router.refresh();
        });
      }}
      className="rounded-lg border border-slate-300 p-1 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
    >
      <Trash2 className="h-3 w-3" aria-hidden />
    </button>
  );
}
