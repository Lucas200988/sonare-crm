'use client';

import { useActionState, useState } from 'react';
import { inputCls, Field, FormError, SubmitButton } from '@/components/ui';
import { ClientPicker, type ClientOptionResult } from '@/components/client-picker';
import type { ActionState } from '@/actions/opportunities';

type Option = { id: string; name: string };
export type ClientOption = ClientOptionResult;

export type OpportunityFormValues = {
  title?: string;
  clientId?: string;
  clientUnitId?: string | null;
  primaryContactId?: string | null;
  description?: string | null;
  serviceCatalogId?: string | null;
  discipline?: string | null;
  commercialOwnerId?: string | null;
  technicalOwnerId?: string | null;
  leadSourceId?: string | null;
  estimatedValue?: string | null;
  probability?: string | null;
  expectedCloseDate?: string | null; // dd/mm/aaaa
  estimatedDuration?: string | null;
  priority?: string;
  competitors?: string | null;
  hiringReason?: string | null;
  clientNeed?: string | null;
  nextAction?: string | null;
  nextActionDate?: string | null;
  notes?: string | null;
};

export function OpportunityForm({
  action, initial, clients, services, users, leadSources, submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: OpportunityFormValues;
  clients: ClientOption[];
  services: Option[];
  users: Option[];
  leadSources: Option[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(
    clients.find((c) => c.id === initial?.clientId) ?? null,
  );

  return (
    <form action={formAction} className="space-y-6">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Identificação</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Título" htmlFor="title" required className="sm:col-span-2">
            <input id="title" name="title" defaultValue={initial?.title ?? ''} required placeholder="Ex.: Projeto elétrico galpão industrial" className={inputCls} />
          </Field>
          <Field label="Cliente" htmlFor="clientId" required className="sm:col-span-2">
            <ClientPicker
              name="clientId"
              initialClients={clients}
              initialSelectedId={initial?.clientId}
              required
              onSelect={setSelectedClient}
            />
          </Field>
          <Field label="Unidade / obra" htmlFor="clientUnitId">
            <select
              id="clientUnitId" name="clientUnitId" defaultValue={initial?.clientUnitId ?? ''}
              className={inputCls} disabled={!selectedClient} key={`unit-${selectedClient?.id ?? 'none'}`}
            >
              <option value="">Nenhuma</option>
              {selectedClient?.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Contato principal" htmlFor="primaryContactId">
            <select
              id="primaryContactId" name="primaryContactId" defaultValue={initial?.primaryContactId ?? ''}
              className={inputCls} disabled={!selectedClient} key={`contact-${selectedClient?.id ?? 'none'}`}
            >
              <option value="">Nenhum</option>
              {selectedClient?.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Serviço (catálogo)" htmlFor="serviceCatalogId">
            <select id="serviceCatalogId" name="serviceCatalogId" defaultValue={initial?.serviceCatalogId ?? ''} className={inputCls}>
              <option value="">Selecione…</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Disciplina" htmlFor="discipline">
            <input id="discipline" name="discipline" defaultValue={initial?.discipline ?? ''} placeholder="Elétrica, civil, telecom…" className={inputCls} />
          </Field>
          <Field label="Descrição da demanda" htmlFor="description" className="sm:col-span-2">
            <textarea id="description" name="description" defaultValue={initial?.description ?? ''} rows={3} spellCheck lang="pt-BR" className={inputCls} />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Comercial</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Responsável comercial" htmlFor="commercialOwnerId">
            <select id="commercialOwnerId" name="commercialOwnerId" defaultValue={initial?.commercialOwnerId ?? ''} className={inputCls}>
              <option value="">Eu mesmo</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Responsável técnico" htmlFor="technicalOwnerId">
            <select id="technicalOwnerId" name="technicalOwnerId" defaultValue={initial?.technicalOwnerId ?? ''} className={inputCls}>
              <option value="">Nenhum</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Origem" htmlFor="leadSourceId">
            <select id="leadSourceId" name="leadSourceId" defaultValue={initial?.leadSourceId ?? ''} className={inputCls}>
              <option value="">Selecione…</option>
              {leadSources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Valor estimado (R$)" htmlFor="estimatedValue">
            <input id="estimatedValue" name="estimatedValue" defaultValue={initial?.estimatedValue ?? ''} inputMode="decimal" placeholder="25.000,00" className={inputCls} />
          </Field>
          <Field label="Probabilidade (%)" htmlFor="probability">
            <input id="probability" name="probability" defaultValue={initial?.probability ?? ''} inputMode="numeric" placeholder="50" className={inputCls} />
          </Field>
          <Field label="Previsão de fechamento" htmlFor="expectedCloseDate">
            <input id="expectedCloseDate" name="expectedCloseDate" defaultValue={initial?.expectedCloseDate ?? ''} placeholder="dd/mm/aaaa" className={inputCls} />
          </Field>
          <Field label="Prazo estimado de execução" htmlFor="estimatedDuration">
            <input id="estimatedDuration" name="estimatedDuration" defaultValue={initial?.estimatedDuration ?? ''} placeholder="Ex.: 45 dias" className={inputCls} />
          </Field>
          <Field label="Prioridade" htmlFor="priority">
            <select id="priority" name="priority" defaultValue={initial?.priority ?? 'MEDIA'} className={inputCls}>
              <option value="BAIXA">Baixa</option>
              <option value="MEDIA">Média</option>
              <option value="ALTA">Alta</option>
              <option value="URGENTE">Urgente</option>
            </select>
          </Field>
          <Field label="Concorrentes" htmlFor="competitors">
            <input id="competitors" name="competitors" defaultValue={initial?.competitors ?? ''} className={inputCls} />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Contexto e próximos passos</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Necessidade do cliente" htmlFor="clientNeed">
            <textarea id="clientNeed" name="clientNeed" defaultValue={initial?.clientNeed ?? ''} rows={2} spellCheck lang="pt-BR" className={inputCls} />
          </Field>
          <Field label="Motivo da contratação" htmlFor="hiringReason">
            <textarea id="hiringReason" name="hiringReason" defaultValue={initial?.hiringReason ?? ''} rows={2} spellCheck lang="pt-BR" className={inputCls} />
          </Field>
          <Field label="Próxima ação" htmlFor="nextAction">
            <input id="nextAction" name="nextAction" defaultValue={initial?.nextAction ?? ''} placeholder="Ex.: enviar orçamento" className={inputCls} />
          </Field>
          <Field label="Data da próxima ação" htmlFor="nextActionDate">
            <input id="nextActionDate" name="nextActionDate" defaultValue={initial?.nextActionDate ?? ''} placeholder="dd/mm/aaaa" className={inputCls} />
          </Field>
          <Field label="Observações" htmlFor="notes" className="sm:col-span-2">
            <textarea id="notes" name="notes" defaultValue={initial?.notes ?? ''} rows={2} className={inputCls} />
          </Field>
        </div>
      </section>

      <FormError message={state.error} />
      <div className="flex justify-end">
        <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
