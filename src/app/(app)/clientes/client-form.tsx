'use client';

import { useActionState, useState } from 'react';
import { inputCls, Field, FormError, SubmitButton } from '@/components/ui';
import type { ActionState } from '@/actions/clients';

type Option = { id: string; name: string };

export type ClientFormValues = {
  personType?: 'FISICA' | 'JURIDICA';
  legalName?: string;
  tradeName?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
  stateRegistration?: string | null;
  cityRegistration?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  addressDistrict?: string | null;
  zipCode?: string | null;
  city?: string | null;
  state?: string | null;
  notes?: string | null;
  status?: string;
  leadSourceId?: string | null;
  segment?: string | null;
  commercialOwnerId?: string | null;
  tags?: string[];
};

export function ClientForm({
  action, initial, leadSources, users, submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: ClientFormValues;
  leadSources: Option[];
  users: Option[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const [personType, setPersonType] = useState<'FISICA' | 'JURIDICA'>(initial?.personType ?? 'JURIDICA');

  return (
    <form action={formAction} className="space-y-6">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Identificação</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tipo de pessoa" htmlFor="personType" required>
            <select
              id="personType" name="personType" value={personType}
              onChange={(e) => setPersonType(e.target.value as 'FISICA' | 'JURIDICA')}
              className={inputCls}
            >
              <option value="JURIDICA">Pessoa Jurídica</option>
              <option value="FISICA">Pessoa Física</option>
            </select>
          </Field>
          <Field label="Status" htmlFor="status">
            <select id="status" name="status" defaultValue={initial?.status ?? 'ATIVO'} className={inputCls}>
              <option value="ATIVO">Ativo</option>
              <option value="INATIVO">Inativo</option>
              <option value="BLOQUEADO">Bloqueado</option>
            </select>
          </Field>
          <Field label={personType === 'JURIDICA' ? 'Razão social' : 'Nome completo'} htmlFor="legalName" required className="sm:col-span-2">
            <input id="legalName" name="legalName" defaultValue={initial?.legalName ?? ''} required className={inputCls} />
          </Field>
          {personType === 'JURIDICA' ? (
            <>
              <Field label="Nome fantasia" htmlFor="tradeName">
                <input id="tradeName" name="tradeName" defaultValue={initial?.tradeName ?? ''} className={inputCls} />
              </Field>
              <Field label="CNPJ" htmlFor="cnpj">
                <input id="cnpj" name="cnpj" defaultValue={initial?.cnpj ?? ''} placeholder="00.000.000/0000-00" className={inputCls} />
              </Field>
              <Field label="Inscrição estadual" htmlFor="stateRegistration">
                <input id="stateRegistration" name="stateRegistration" defaultValue={initial?.stateRegistration ?? ''} className={inputCls} />
              </Field>
              <Field label="Inscrição municipal" htmlFor="cityRegistration">
                <input id="cityRegistration" name="cityRegistration" defaultValue={initial?.cityRegistration ?? ''} className={inputCls} />
              </Field>
            </>
          ) : (
            <Field label="CPF" htmlFor="cpf">
              <input id="cpf" name="cpf" defaultValue={initial?.cpf ?? ''} placeholder="000.000.000-00" className={inputCls} />
            </Field>
          )}
          <Field label="Segmento" htmlFor="segment">
            <input id="segment" name="segment" defaultValue={initial?.segment ?? ''} placeholder="Indústria, agro, condomínio…" className={inputCls} />
          </Field>
          <Field label="Origem" htmlFor="leadSourceId">
            <select id="leadSourceId" name="leadSourceId" defaultValue={initial?.leadSourceId ?? ''} className={inputCls}>
              <option value="">Selecione…</option>
              {leadSources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Responsável comercial" htmlFor="commercialOwnerId">
            <select id="commercialOwnerId" name="commercialOwnerId" defaultValue={initial?.commercialOwnerId ?? ''} className={inputCls}>
              <option value="">Selecione…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Contato</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="E-mail" htmlFor="email">
            <input id="email" name="email" type="email" defaultValue={initial?.email ?? ''} className={inputCls} />
          </Field>
          <Field label="Site" htmlFor="website">
            <input id="website" name="website" defaultValue={initial?.website ?? ''} className={inputCls} />
          </Field>
          <Field label="Telefone" htmlFor="phone">
            <input id="phone" name="phone" defaultValue={initial?.phone ?? ''} placeholder="(65) 3333-4444" className={inputCls} />
          </Field>
          <Field label="WhatsApp" htmlFor="whatsapp">
            <input id="whatsapp" name="whatsapp" defaultValue={initial?.whatsapp ?? ''} placeholder="(65) 99999-8888" className={inputCls} />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Endereço</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
          <Field label="CEP" htmlFor="zipCode" className="sm:col-span-2">
            <input id="zipCode" name="zipCode" defaultValue={initial?.zipCode ?? ''} placeholder="78000-000" className={inputCls} />
          </Field>
          <Field label="Logradouro" htmlFor="addressStreet" className="sm:col-span-4">
            <input id="addressStreet" name="addressStreet" defaultValue={initial?.addressStreet ?? ''} className={inputCls} />
          </Field>
          <Field label="Número" htmlFor="addressNumber" className="sm:col-span-1">
            <input id="addressNumber" name="addressNumber" defaultValue={initial?.addressNumber ?? ''} className={inputCls} />
          </Field>
          <Field label="Complemento" htmlFor="addressComplement" className="sm:col-span-2">
            <input id="addressComplement" name="addressComplement" defaultValue={initial?.addressComplement ?? ''} className={inputCls} />
          </Field>
          <Field label="Bairro" htmlFor="addressDistrict" className="sm:col-span-3">
            <input id="addressDistrict" name="addressDistrict" defaultValue={initial?.addressDistrict ?? ''} className={inputCls} />
          </Field>
          <Field label="Cidade" htmlFor="city" className="sm:col-span-4">
            <input id="city" name="city" defaultValue={initial?.city ?? ''} className={inputCls} />
          </Field>
          <Field label="UF" htmlFor="state" className="sm:col-span-2">
            <input id="state" name="state" defaultValue={initial?.state ?? ''} maxLength={2} placeholder="MT" className={inputCls} />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Outros</h2>
        <div className="grid grid-cols-1 gap-4">
          <Field label="Etiquetas (separadas por vírgula)" htmlFor="tags">
            <input id="tags" name="tags" defaultValue={(initial?.tags ?? []).join(', ')} placeholder="vip, indicação, licitação" className={inputCls} />
          </Field>
          <Field label="Observações" htmlFor="notes">
            <textarea id="notes" name="notes" defaultValue={initial?.notes ?? ''} rows={3} spellCheck lang="pt-BR" className={inputCls} />
          </Field>
        </div>
      </section>

      <FormError message={state.error} />
      <div className="flex justify-end gap-3">
        <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
