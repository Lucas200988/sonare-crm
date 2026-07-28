'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDownCircle, ArrowUpCircle, Plus } from 'lucide-react';
import {
  createProjectReceivableAction, createProjectPayableAction, type ActionState,
} from '@/actions/finance';
import { inputCls, Field, FormError, SubmitButton, Badge } from '@/components/ui';
import { formatBRL } from '@/lib/money';
import { formatDateBR } from '@/lib/dates';
import { RECEIVABLE_BADGE, PAYABLE_BADGE } from '../../financeiro/status-badge';

export type ProjectReceivable = {
  id: string;
  code: string;
  description: string;
  dueDate: string;
  netValue: string;
  status: string;
  recebido: string;
};

export type ProjectPayable = {
  id: string;
  description: string;
  supplier: string | null;
  dueDate: string;
  amount: string;
  status: string;
};

export type FinanceResumo = {
  cobrado: string; recebido: string; aReceber: string; despesas: string; saldo: string;
};

/**
 * Financeiro dentro do cartão do projeto.
 *
 * A entrada paga na assinatura é o caso mais comum: marcar "já recebido"
 * cria a cobrança e a baixa de uma vez, sem passar pela tela do financeiro.
 */
export function ProjectFinanceSection({
  projectId, clientId, receivables, payables, resumo, canWrite,
}: {
  projectId: string;
  clientId: string;
  receivables: ProjectReceivable[];
  payables: ProjectPayable[];
  resumo: FinanceResumo;
  canWrite: boolean;
}) {
  const [aba, setAba] = useState<'receber' | 'pagar' | null>(null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador titulo="Cobrado" valor={resumo.cobrado} />
        <Indicador titulo="Recebido" valor={resumo.recebido} tom="positivo" />
        <Indicador titulo="A receber" valor={resumo.aReceber} tom={Number(resumo.aReceber) > 0 ? 'alerta' : 'neutro'} />
        <Indicador titulo="Despesas" valor={resumo.despesas} />
      </div>

      <div className="rounded-lg bg-slate-50 px-3 py-2">
        <span className="text-xs text-slate-500">Saldo do projeto</span>
        <p className={`text-lg font-bold ${Number(resumo.saldo) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
          {formatBRL(resumo.saldo)}
        </p>
        <p className="text-[11px] text-slate-500">Recebido menos despesas lançadas neste projeto.</p>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <ArrowDownCircle className="h-4 w-4 text-green-600" aria-hidden /> Cobranças
          </h3>
          {canWrite ? (
            <button
              type="button"
              onClick={() => setAba(aba === 'receber' ? null : 'receber')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> Lançar cobrança
            </button>
          ) : null}
        </div>

        {aba === 'receber' ? (
          <NewProjectReceivable projectId={projectId} clientId={clientId} onDone={() => setAba(null)} />
        ) : null}

        {receivables.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma cobrança lançada.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {receivables.map((r) => {
              const badge = RECEIVABLE_BADGE[r.status] ?? RECEIVABLE_BADGE.PREVISTO;
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-800">{r.description}</p>
                    <p className="text-[11px] text-slate-400">
                      {r.code} · vence {formatDateBR(r.dueDate)}
                      {Number(r.recebido) > 0 ? ` · recebido ${formatBRL(r.recebido)}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-slate-900">{formatBRL(r.netValue)}</p>
                    <Badge color={badge.color}>{badge.label}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <ArrowUpCircle className="h-4 w-4 text-red-500" aria-hidden /> Despesas
          </h3>
          {canWrite ? (
            <button
              type="button"
              onClick={() => setAba(aba === 'pagar' ? null : 'pagar')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> Lançar despesa
            </button>
          ) : null}
        </div>

        {aba === 'pagar' ? (
          <NewProjectPayable projectId={projectId} onDone={() => setAba(null)} />
        ) : null}

        {payables.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma despesa lançada.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {payables.map((p) => {
              const badge = PAYABLE_BADGE[p.status] ?? PAYABLE_BADGE.A_PAGAR;
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-800">{p.description}</p>
                    <p className="text-[11px] text-slate-400">
                      {p.supplier ? `${p.supplier} · ` : ''}vence {formatDateBR(p.dueDate)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-slate-900">{formatBRL(p.amount)}</p>
                    <Badge color={badge.color}>{badge.label}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Link href="/financeiro" className="inline-block text-xs font-medium text-brand hover:underline">
        Abrir o financeiro completo
      </Link>
    </div>
  );
}

function Indicador({ titulo, valor, tom = 'neutro' }: {
  titulo: string; valor: string; tom?: 'neutro' | 'alerta' | 'positivo';
}) {
  const cor = { neutro: 'text-slate-900', alerta: 'text-amber-600', positivo: 'text-green-700' }[tom];
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className={`mt-0.5 text-base font-bold ${cor}`}>{formatBRL(valor)}</p>
    </div>
  );
}

function NewProjectReceivable({ projectId, clientId, onDone }: {
  projectId: string; clientId: string; onDone: () => void;
}) {
  const router = useRouter();
  const action = createProjectReceivableAction.bind(null, projectId, clientId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const [jaRecebido, setJaRecebido] = useState(false);

  useEffect(() => {
    if (state.info) { onDone(); router.refresh(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="mb-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
      <Field label="Descrição" htmlFor="pr-desc" required className="sm:col-span-3">
        <input id="pr-desc" name="description" required placeholder="Ex.: Entrada de 50%" className={inputCls} />
      </Field>
      <Field label="Valor (R$)" htmlFor="pr-valor" required>
        <input id="pr-valor" name="grossValue" required placeholder="0,00" className={inputCls} />
      </Field>
      <Field label={jaRecebido ? 'Data do recebimento' : 'Vencimento'} htmlFor="pr-venc" required>
        <input
          id="pr-venc" name="dueDate" type="date" required
          defaultValue={new Date().toISOString().slice(0, 10)}
          className={inputCls}
        />
      </Field>
      <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
        <input
          type="checkbox" name="jaRecebido"
          checked={jaRecebido}
          onChange={(e) => setJaRecebido(e.target.checked)}
          className="rounded border-slate-300"
        />
        Já recebido
      </label>

      <p className="text-[11px] text-slate-500 sm:col-span-3">
        {jaRecebido
          ? 'Entra direto como recebida — sem precisar dar baixa depois.'
          : 'Fica em aberto no contas a receber até a baixa.'}
      </p>

      <div className="sm:col-span-3"><FormError message={state.error} /></div>
      <div className="flex gap-2 sm:col-span-3">
        <SubmitButton pending={pending}>{jaRecebido ? 'Registrar recebimento' : 'Lançar cobrança'}</SubmitButton>
        <button type="button" onClick={onDone} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-white">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function NewProjectPayable({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const router = useRouter();
  const action = createProjectPayableAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  useEffect(() => {
    if (state.info) { onDone(); router.refresh(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="mb-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
      <Field label="Descrição" htmlFor="pp-desc" required className="sm:col-span-3">
        <input id="pp-desc" name="description" required placeholder="Ex.: Taxa de ART" className={inputCls} />
      </Field>
      <Field label="Fornecedor" htmlFor="pp-forn">
        <input id="pp-forn" name="supplier" className={inputCls} />
      </Field>
      <Field label="Valor (R$)" htmlFor="pp-valor" required>
        <input id="pp-valor" name="amount" required placeholder="0,00" className={inputCls} />
      </Field>
      <Field label="Vencimento" htmlFor="pp-venc" required>
        <input
          id="pp-venc" name="dueDate" type="date" required
          defaultValue={new Date().toISOString().slice(0, 10)}
          className={inputCls}
        />
      </Field>
      <div className="sm:col-span-3"><FormError message={state.error} /></div>
      <div className="flex gap-2 sm:col-span-3">
        <SubmitButton pending={pending}>Lançar despesa</SubmitButton>
        <button type="button" onClick={onDone} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-white">
          Cancelar
        </button>
      </div>
    </form>
  );
}
