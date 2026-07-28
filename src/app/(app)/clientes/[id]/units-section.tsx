'use client';

import { useActionState, useState } from 'react';
import { MapPin, Pencil, Plus, Trash2, X } from 'lucide-react';
import { saveUnitAction, deleteUnitAction, type ActionState } from '@/actions/clients';
import { inputCls, Field, FormError } from '@/components/ui';

export type UnitRow = {
  id: string;
  name: string;
  unitType: string | null;
  consumerUnit: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressDistrict: string | null;
  zipCode: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
};

function UnitForm({ clientId, unit, onClose }: { clientId: string; unit: UnitRow | null; onClose: () => void }) {
  const action = saveUnitAction.bind(null, clientId, unit?.id ?? null);
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
        <Field label="Nome da unidade/obra" htmlFor="u-name" required>
          <input id="u-name" name="name" defaultValue={unit?.name ?? ''} required className={inputCls} />
        </Field>
        <Field label="Tipo" htmlFor="u-type">
          <input id="u-type" name="unitType" defaultValue={unit?.unitType ?? ''} placeholder="Obra, fazenda, usina, filial…" className={inputCls} />
        </Field>
        <Field label="Unidade consumidora (UC)" htmlFor="u-uc">
          <input id="u-uc" name="consumerUnit" defaultValue={unit?.consumerUnit ?? ''} className={inputCls} />
        </Field>
        <Field label="CEP" htmlFor="u-cep">
          <input id="u-cep" name="zipCode" defaultValue={unit?.zipCode ?? ''} className={inputCls} />
        </Field>
        <Field label="Endereço" htmlFor="u-street">
          <input id="u-street" name="addressStreet" defaultValue={unit?.addressStreet ?? ''} className={inputCls} />
        </Field>
        <Field label="Número" htmlFor="u-number">
          <input id="u-number" name="addressNumber" defaultValue={unit?.addressNumber ?? ''} className={inputCls} />
        </Field>
        <Field label="Bairro" htmlFor="u-district">
          <input id="u-district" name="addressDistrict" defaultValue={unit?.addressDistrict ?? ''} className={inputCls} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Cidade" htmlFor="u-city" className="col-span-2">
            <input id="u-city" name="city" defaultValue={unit?.city ?? ''} className={inputCls} />
          </Field>
          <Field label="UF" htmlFor="u-state">
            <input id="u-state" name="state" defaultValue={unit?.state ?? ''} maxLength={2} className={inputCls} />
          </Field>
        </div>
      </div>
      <Field label="Observações" htmlFor="u-notes">
        <textarea id="u-notes" name="notes" defaultValue={unit?.notes ?? ''} rows={2} className={inputCls} />
      </Field>
      <FormError message={state.error} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
          {pending ? 'Salvando…' : 'Salvar unidade'}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function UnitsSection({ clientId, units, canWrite }: { clientId: string; units: UnitRow[]; canWrite: boolean }) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Unidades / obras ({units.length})</h2>
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

      {editing === 'new' ? <UnitForm clientId={clientId} unit={null} onClose={() => setEditing(null)} /> : null}

      <ul className="mt-3 divide-y divide-slate-100">
        {units.length === 0 ? (
          <li className="py-3 text-sm text-slate-500">Nenhuma unidade cadastrada.</li>
        ) : units.map((u) => (
          <li key={u.id} className="py-3">
            {editing === u.id ? (
              <UnitForm clientId={clientId} unit={u} onClose={() => setEditing(null)} />
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                    {u.name}
                    {u.unitType ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{u.unitType}</span> : null}
                  </p>
                  <p className="text-xs text-slate-500">
                    {[u.addressStreet, u.addressNumber, u.addressDistrict, u.city && `${u.city}/${u.state ?? ''}`]
                      .filter(Boolean).join(', ') || 'Sem endereço'}
                    {u.consumerUnit ? ` · UC ${u.consumerUnit}` : ''}
                  </p>
                </div>
                {canWrite ? (
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => setEditing(u.id)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Editar ${u.name}`}>
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Excluir a unidade "${u.name}"?`)) void deleteUnitAction(clientId, u.id);
                      }}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Excluir ${u.name}`}
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
