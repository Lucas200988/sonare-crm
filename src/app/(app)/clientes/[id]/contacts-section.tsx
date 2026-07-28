'use client';

import { useActionState, useState } from 'react';
import { Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { saveContactAction, deleteContactAction, type ActionState } from '@/actions/clients';
import { inputCls, Field, FormError } from '@/components/ui';

export type ContactRow = {
  id: string;
  name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  department: string | null;
  decisionMaker: boolean;
  isPrimary: boolean;
  isFinancial: boolean;
  isTechnical: boolean;
  isContractual: boolean;
  notes: string | null;
};

function ContactForm({ clientId, contact, onClose }: { clientId: string; contact: ContactRow | null; onClose: () => void }) {
  const action = saveContactAction.bind(null, clientId, contact?.id ?? null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const result = await action(prev, fd);
      if (!result.error) onClose();
      return result;
    },
    {},
  );

  return (
    <form action={formAction} className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nome" htmlFor="c-name" required>
          <input id="c-name" name="name" defaultValue={contact?.name ?? ''} required className={inputCls} />
        </Field>
        <Field label="Cargo" htmlFor="c-position">
          <input id="c-position" name="position" defaultValue={contact?.position ?? ''} className={inputCls} />
        </Field>
        <Field label="E-mail" htmlFor="c-email">
          <input id="c-email" name="email" type="email" defaultValue={contact?.email ?? ''} className={inputCls} />
        </Field>
        <Field label="Departamento" htmlFor="c-department">
          <input id="c-department" name="department" defaultValue={contact?.department ?? ''} className={inputCls} />
        </Field>
        <Field label="Telefone" htmlFor="c-phone">
          <input id="c-phone" name="phone" defaultValue={contact?.phone ?? ''} className={inputCls} />
        </Field>
        <Field label="WhatsApp" htmlFor="c-whatsapp">
          <input id="c-whatsapp" name="whatsapp" defaultValue={contact?.whatsapp ?? ''} className={inputCls} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-slate-700">
        {([
          ['isPrimary', 'Contato principal', contact?.isPrimary],
          ['decisionMaker', 'Decisor', contact?.decisionMaker],
          ['isFinancial', 'Financeiro', contact?.isFinancial],
          ['isTechnical', 'Técnico', contact?.isTechnical],
          ['isContractual', 'Contratual', contact?.isContractual],
        ] as const).map(([name, label, checked]) => (
          <label key={name} className="flex items-center gap-1.5">
            <input type="checkbox" name={name} defaultChecked={checked ?? false} className="rounded border-slate-300" />
            {label}
          </label>
        ))}
      </div>
      <FormError message={state.error} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
          {pending ? 'Salvando…' : 'Salvar contato'}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function ContactsSection({ clientId, contacts, canWrite }: { clientId: string; contacts: ContactRow[]; canWrite: boolean }) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Contatos ({contacts.length})</h2>
        {canWrite ? (
          <button
            type="button"
            onClick={() => setEditing(editing === 'new' ? null : 'new')}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            {editing === 'new' ? <X className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
            {editing === 'new' ? 'Fechar' : 'Adicionar'}
          </button>
        ) : null}
      </div>

      {editing === 'new' ? <ContactForm clientId={clientId} contact={null} onClose={() => setEditing(null)} /> : null}

      <ul className="mt-3 divide-y divide-slate-100">
        {contacts.length === 0 ? (
          <li className="py-3 text-sm text-slate-500">Nenhum contato cadastrado.</li>
        ) : contacts.map((c) => (
          <li key={c.id} className="py-3">
            {editing === c.id ? (
              <ContactForm clientId={clientId} contact={c} onClose={() => setEditing(null)} />
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                    {c.isPrimary ? <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-label="Contato principal" /> : null}
                    {c.name}
                    {c.decisionMaker ? <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">DECISOR</span> : null}
                  </p>
                  <p className="text-xs text-slate-500">
                    {[c.position, c.department].filter(Boolean).join(' · ') || '—'}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {[c.email, c.phone ?? c.whatsapp].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {canWrite ? (
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => setEditing(c.id)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Editar ${c.name}`}>
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Excluir o contato "${c.name}"?`)) void deleteContactAction(clientId, c.id);
                      }}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Excluir ${c.name}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
