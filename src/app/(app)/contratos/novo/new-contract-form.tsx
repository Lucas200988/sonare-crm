'use client';

import { useActionState, useState } from 'react';
import { createContractAction, type ActionState } from '@/actions/contracts';
import { inputCls, Field, FormError, SubmitButton } from '@/components/ui';
import { ClientPicker, type ClientOptionResult } from '@/components/client-picker';

export function NewContractForm({
  clients, templates, initialClientId,
}: {
  clients: ClientOptionResult[];
  templates: Array<{ id: string; name: string; kind: string }>;
  initialClientId?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createContractAction, {});
  const [selected, setSelected] = useState<ClientOptionResult | null>(
    clients.find((c) => c.id === initialClientId) ?? null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Cliente" htmlFor="clientId" required>
        <ClientPicker
          name="clientId" initialClients={clients} initialSelectedId={initialClientId}
          required onSelect={setSelected}
        />
      </Field>

      <Field label="Unidade / obra" htmlFor="clientUnitId">
        <select
          id="clientUnitId" name="clientUnitId" className={inputCls}
          defaultValue="" disabled={!selected} key={selected?.id ?? 'none'}
        >
          <option value="">Nenhuma</option>
          {selected?.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </Field>

      <Field label="Modelo de contrato" htmlFor="templateId">
        <select id="templateId" name="templateId" className={inputCls} defaultValue="">
          <option value="">Selecione…</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>

      <Field label="Objeto do contrato" htmlFor="subject" required>
        <input
          id="subject" name="subject" required spellCheck lang="pt-BR"
          placeholder="Ex.: Elaboração de projeto elétrico da unidade industrial"
          className={inputCls}
        />
      </Field>

      <Field label="Valor total (R$)" htmlFor="totalValue" required>
        <input id="totalValue" name="totalValue" required inputMode="decimal" placeholder="25.000,00" className={inputCls} />
      </Field>

      <FormError message={state.error} />
      <div className="flex justify-end">
        <SubmitButton pending={pending}>Criar contrato</SubmitButton>
      </div>
    </form>
  );
}
