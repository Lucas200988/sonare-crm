'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import {
  createInvoiceAction, cancelInvoiceAction, listReceivablesToInvoiceAction, type ActionState,
} from '@/actions/finance';
import { inputCls, Field, FormError, SubmitButton } from '@/components/ui';
import { ClientSelect, type ClientOption } from '@/components/client-select';
import { formatBRL } from '@/lib/money';
import { formatDateBR } from '@/lib/dates';

type ParcelaAberta = {
  id: string; code: string; description: string; dueDate: string; netValue: string;
};

/**
 * Registro da nota emitida no portal da prefeitura. Ao escolher o cliente, o
 * sistema traz as parcelas em aberto para vincular — assim o financeiro sabe
 * o que já foi faturado sem conferência manual.
 */
export function NewInvoice({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createInvoiceAction, {});
  const [parcelas, setParcelas] = useState<ParcelaAberta[]>([]);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (state.info) { setAberto(false); setParcelas([]); setSelecionadas([]); router.refresh(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function carregarParcelas(clientId: string) {
    if (!clientId) { setParcelas([]); return; }
    startTransition(async () => {
      setParcelas(await listReceivablesToInvoiceAction(clientId));
    });
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
      >
        <Plus className="h-4 w-4" aria-hidden /> Registrar nota
      </button>
    );
  }

  const totalSelecionado = parcelas
    .filter((p) => selecionadas.includes(p.id))
    .reduce((acc, p) => acc + Number(p.netValue), 0);

  return (
    <form action={formAction} className="grid w-full gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
      <Field label="Cliente" htmlFor="nf-cliente" required className="sm:col-span-2">
        <ClientSelect id="nf-cliente" name="clientId" clients={clients} required onSelect={carregarParcelas} />
      </Field>
      <Field label="Número da nota" htmlFor="nf-numero" required>
        <input id="nf-numero" name="number" required className={inputCls} />
      </Field>
      <Field label="Série" htmlFor="nf-serie">
        <input id="nf-serie" name="series" className={inputCls} />
      </Field>
      <Field label="Emissão" htmlFor="nf-data" required>
        <input
          id="nf-data" name="issueDate" type="date" required
          defaultValue={new Date().toISOString().slice(0, 10)}
          className={inputCls}
        />
      </Field>
      <Field label="Valor bruto (R$)" htmlFor="nf-bruto" required>
        <input id="nf-bruto" name="grossValue" required placeholder="0,00" className={inputCls} />
      </Field>
      <Field label="Retenções (R$)" htmlFor="nf-ret">
        <input id="nf-ret" name="retentionsTotal" placeholder="0,00" className={inputCls} />
      </Field>
      <Field label="Link da nota" htmlFor="nf-link">
        <input id="nf-link" name="externalLink" placeholder="URL do portal" className={inputCls} />
      </Field>
      <Field label="Descrição do serviço" htmlFor="nf-desc" className="sm:col-span-4">
        <input id="nf-desc" name="serviceDescription" className={inputCls} />
      </Field>

      {parcelas.length > 0 ? (
        <div className="sm:col-span-4">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Parcelas cobertas por esta nota
          </span>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {parcelas.map((p) => (
              <label key={p.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-slate-50">
                <input
                  type="checkbox" name="receivableIds" value={p.id}
                  checked={selecionadas.includes(p.id)}
                  onChange={(e) => setSelecionadas((prev) =>
                    e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id))}
                  className="rounded border-slate-300"
                />
                <span className="flex-1 truncate">{p.code} — {p.description}</span>
                <span className="text-slate-500">{formatDateBR(p.dueDate)}</span>
                <span className="font-medium text-slate-800">{formatBRL(p.netValue)}</span>
              </label>
            ))}
          </div>
          {selecionadas.length > 0 ? (
            <p className="mt-1 text-[11px] text-slate-500">
              {selecionadas.length} parcela(s) · {formatBRL(totalSelecionado.toFixed(2))} — passam a
              constar como faturadas.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="sm:col-span-4"><FormError message={state.error} /></div>
      <div className="flex gap-2 sm:col-span-4">
        <SubmitButton pending={pending}>Registrar nota</SubmitButton>
        <button type="button" onClick={() => setAberto(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function CancelInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const motivo = prompt('Motivo do cancelamento da nota:');
          if (!motivo) return;
          startTransition(async () => {
            const r = await cancelInvoiceAction(invoiceId, motivo);
            if (r.error) setErro(r.error);
            else router.refresh();
          });
        }}
        className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
      >
        Cancelar nota
      </button>
      {erro ? <p role="alert" className="mt-1 text-[11px] text-red-600">{erro}</p> : null}
    </>
  );
}
