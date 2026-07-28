'use client';

import { useActionState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { updateContractAction, type ActionState } from '@/actions/contracts';
import { inputCls, Field, FormError, SubmitButton } from '@/components/ui';
import { ReviewableTextarea } from '@/components/text-field';
import { useState } from 'react';

export type ContractFormValues = {
  subject: string;
  scope: string;
  totalValue: string;
  contractNumber: string;
  templateId: string;
  startDate: string;
  endDate: string;
  durationDays: string;
  paymentTerms: string;
  adjustmentIndex: string;
  penalties: string;
  guarantees: string;
  obligations: string;
  terminationTerms: string;
  jurisdiction: string;
  prazoExecucao: string;
  formatosEntrega: string;
  localExecucao: string;
  revisoesIncluidas: string;
  valorRevisaoExcedente: string;
};

export function ContractForm({
  contractId, initial, templates, editable,
}: {
  contractId: string;
  initial: ContractFormValues;
  templates: Array<{ id: string; name: string }>;
  editable: boolean;
}) {
  const action = updateContractAction.bind(null, contractId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const [scope, setScope] = useState(initial.scope);
  const [paymentTerms, setPaymentTerms] = useState(initial.paymentTerms);

  return (
    <form action={formAction} className="space-y-6">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Identificação</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
          <Field label="Objeto do contrato" htmlFor="subject" required className="sm:col-span-4">
            <input id="subject" name="subject" defaultValue={initial.subject} required disabled={!editable} spellCheck lang="pt-BR" className={inputCls} />
          </Field>
          <Field label="Nº do contrato (externo)" htmlFor="contractNumber" className="sm:col-span-2">
            <input id="contractNumber" name="contractNumber" defaultValue={initial.contractNumber} disabled={!editable} className={inputCls} />
          </Field>
          <Field label="Modelo de minuta" htmlFor="templateId" className="sm:col-span-3">
            <select id="templateId" name="templateId" defaultValue={initial.templateId} disabled={!editable} className={inputCls}>
              <option value="">Selecione…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Valor total (R$)" htmlFor="totalValue" required className="sm:col-span-3">
            <input id="totalValue" name="totalValue" defaultValue={initial.totalValue} required inputMode="decimal" disabled={!editable} className={inputCls} />
          </Field>
        </div>
        <Field label="Escopo / especificações" htmlFor="scope">
          <ReviewableTextarea
            id="scope" value={scope} onChange={setScope} rows={5}
            disabled={!editable} context="escopo de contrato de engenharia"
          />
          <input type="hidden" name="scope" value={scope} />
        </Field>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Prazos e vigência</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Field label="Início da vigência" htmlFor="startDate">
            <input id="startDate" name="startDate" defaultValue={initial.startDate} placeholder="dd/mm/aaaa" disabled={!editable} className={inputCls} />
          </Field>
          <Field label="Fim da vigência" htmlFor="endDate">
            <input id="endDate" name="endDate" defaultValue={initial.endDate} placeholder="dd/mm/aaaa" disabled={!editable} className={inputCls} />
          </Field>
          <Field label="Duração (dias)" htmlFor="durationDays">
            <input id="durationDays" name="durationDays" defaultValue={initial.durationDays} inputMode="numeric" disabled={!editable} className={inputCls} />
          </Field>
          <Field label="Índice de reajuste" htmlFor="adjustmentIndex">
            <input id="adjustmentIndex" name="adjustmentIndex" defaultValue={initial.adjustmentIndex} placeholder="IGP-M" disabled={!editable} className={inputCls} />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Variáveis da minuta
        </h2>
        <p className="-mt-2 text-xs text-slate-500">
          Preenchem as lacunas das cláusulas do modelo escolhido.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Prazo de execução" htmlFor="prazoExecucao">
            <input id="prazoExecucao" name="prazoExecucao" defaultValue={initial.prazoExecucao} placeholder="30 (trinta) dias" disabled={!editable} className={inputCls} />
          </Field>
          <Field label="Formatos de entrega" htmlFor="formatosEntrega">
            <input id="formatosEntrega" name="formatosEntrega" defaultValue={initial.formatosEntrega} placeholder="PDF e DWG" disabled={!editable} className={inputCls} />
          </Field>
          <Field label="Local de execução" htmlFor="localExecucao">
            <input id="localExecucao" name="localExecucao" defaultValue={initial.localExecucao} disabled={!editable} className={inputCls} />
          </Field>
          <Field label="Revisões inclusas" htmlFor="revisoesIncluidas">
            <input id="revisoesIncluidas" name="revisoesIncluidas" defaultValue={initial.revisoesIncluidas} placeholder="02 (duas)" disabled={!editable} className={inputCls} />
          </Field>
          <Field label="Taxa por revisão excedente" htmlFor="valorRevisaoExcedente">
            <input id="valorRevisaoExcedente" name="valorRevisaoExcedente" defaultValue={initial.valorRevisaoExcedente} placeholder="R$ 500,00 (quinhentos reais)" disabled={!editable} className={inputCls} />
          </Field>
          <Field label="Foro (comarca)" htmlFor="jurisdiction">
            <input id="jurisdiction" name="jurisdiction" defaultValue={initial.jurisdiction} placeholder="Cuiabá, MT" disabled={!editable} className={inputCls} />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Condições</h2>
        <Field label="Forma de pagamento" htmlFor="paymentTerms">
          <ReviewableTextarea
            id="paymentTerms" value={paymentTerms} onChange={setPaymentTerms} rows={4}
            disabled={!editable} context="condições de pagamento de contrato"
            placeholder="Ex.: 1ª parcela de R$ 6.000,00 na assinatura; 2ª parcela de R$ 6.000,00 na entrega final."
          />
          <input type="hidden" name="paymentTerms" value={paymentTerms} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Garantias" htmlFor="guarantees">
            <textarea id="guarantees" name="guarantees" defaultValue={initial.guarantees} rows={2} disabled={!editable} spellCheck lang="pt-BR" className={inputCls} />
          </Field>
          <Field label="Penalidades adicionais" htmlFor="penalties">
            <textarea id="penalties" name="penalties" defaultValue={initial.penalties} rows={2} disabled={!editable} spellCheck lang="pt-BR" className={inputCls} />
          </Field>
          <Field label="Obrigações específicas" htmlFor="obligations">
            <textarea id="obligations" name="obligations" defaultValue={initial.obligations} rows={2} disabled={!editable} spellCheck lang="pt-BR" className={inputCls} />
          </Field>
          <Field label="Condições de rescisão" htmlFor="terminationTerms">
            <textarea id="terminationTerms" name="terminationTerms" defaultValue={initial.terminationTerms} rows={2} disabled={!editable} spellCheck lang="pt-BR" className={inputCls} />
          </Field>
        </div>
      </section>

      <FormError message={state.error} />
      {state.info ? (
        <p className="flex items-center gap-1.5 text-xs text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {state.info}
        </p>
      ) : null}

      {editable ? (
        <div className="flex justify-end">
          <SubmitButton pending={pending}>Salvar contrato</SubmitButton>
        </div>
      ) : (
        <p className="text-xs text-slate-400">
          Contrato assinado ou encerrado não pode ser editado — registre um aditivo para alterá-lo.
        </p>
      )}
    </form>
  );
}
