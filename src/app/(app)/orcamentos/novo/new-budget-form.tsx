'use client';

import { useActionState, useState } from 'react';
import { createBudgetAction, type ActionState } from '@/actions/budgets';
import { inputCls, Field, FormError, SubmitButton } from '@/components/ui';
import { ClientPicker, type ClientOptionResult } from '@/components/client-picker';

export function NewBudgetForm({
  clients, initialClientId, initialOpportunityId,
}: {
  clients: ClientOptionResult[];
  initialClientId?: string;
  initialOpportunityId?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createBudgetAction, {});
  const [selected, setSelected] = useState<ClientOptionResult | null>(
    clients.find((c) => c.id === initialClientId) ?? null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Cliente" htmlFor="clientId" required>
        <ClientPicker
          name="clientId"
          initialClients={clients}
          initialSelectedId={initialClientId}
          required
          onSelect={setSelected}
        />
      </Field>

      <Field label="Oportunidade vinculada" htmlFor="opportunityId">
        <select
          id="opportunityId" name="opportunityId" className={inputCls}
          defaultValue={initialOpportunityId ?? ''} disabled={!selected}
          key={selected?.id ?? 'none'}
        >
          <option value="">Nenhuma</option>
          {selected?.opportunities.map((o) => (
            <option key={o.id} value={o.id}>{o.code} — {o.title}</option>
          ))}
        </select>
        {selected && selected.opportunities.length === 0 ? (
          <p className="mt-1 text-xs text-slate-400">Este cliente não tem oportunidades abertas.</p>
        ) : null}
      </Field>

      <Field label="Unidade / obra" htmlFor="clientUnitId">
        <select
          id="clientUnitId" name="clientUnitId" className={inputCls}
          defaultValue="" disabled={!selected}
          key={`unit-${selected?.id ?? 'none'}`}
        >
          <option value="">Nenhuma</option>
          {selected?.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </Field>

      <FormError message={state.error} />
      <div className="flex justify-end">
        <SubmitButton pending={pending}>Criar orçamento</SubmitButton>
      </div>
    </form>
  );
}
