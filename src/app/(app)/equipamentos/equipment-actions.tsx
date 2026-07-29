'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownLeft, ArrowUpRight, Pencil, Plus } from 'lucide-react';
import {
  saveEquipmentAction, checkOutAction, checkInAction, setEquipmentStatusAction,
  type ActionState,
} from '@/actions/equipment';
import { inputCls, Field, FormError } from '@/components/ui';

export type ProjectOption = { id: string; code: string; name: string };
export type ClientOption = { id: string; name: string };
export type UserOption = { id: string; name: string };

export type EquipmentForm = {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  category: string | null;
  homeLocation: string | null;
  purchaseDate: string;
  purchaseValue: string;
  calibrationDueAt: string;
  notes: string | null;
};

/** Fecha o formulário e recarrega a lista assim que a ação dá certo. */
function useFecharAoConcluir(state: ActionState, fechar: () => void) {
  const router = useRouter();
  useEffect(() => {
    if (state.info) { fechar(); router.refresh(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

// ---------- Cadastro ----------

function CadastroForm({ equipment, onClose }: { equipment: EquipmentForm | null; onClose: () => void }) {
  const action = saveEquipmentAction.bind(null, equipment?.id ?? null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  useFecharAoConcluir(state, onClose);

  return (
    <form action={formAction} className="grid w-full gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
      <Field label="Equipamento" htmlFor="eq-nome" required>
        <input id="eq-nome" name="name" required defaultValue={equipment?.name} className={inputCls} />
      </Field>
      <Field label="Marca" htmlFor="eq-marca">
        <input id="eq-marca" name="brand" defaultValue={equipment?.brand ?? ''} className={inputCls} />
      </Field>
      <Field label="Modelo" htmlFor="eq-modelo">
        <input id="eq-modelo" name="model" defaultValue={equipment?.model ?? ''} className={inputCls} />
      </Field>
      <Field label="Nº de série" htmlFor="eq-serie">
        <input id="eq-serie" name="serialNumber" defaultValue={equipment?.serialNumber ?? ''} className={inputCls} />
      </Field>
      <Field label="Categoria" htmlFor="eq-categoria">
        <input id="eq-categoria" name="category" placeholder="Instrumento de medição" defaultValue={equipment?.category ?? ''} className={inputCls} />
      </Field>
      <Field label="Onde fica parado" htmlFor="eq-local">
        <input id="eq-local" name="homeLocation" placeholder="Armário do laboratório" defaultValue={equipment?.homeLocation ?? ''} className={inputCls} />
      </Field>
      <Field label="Compra (dd/mm/aaaa)" htmlFor="eq-compra">
        <input id="eq-compra" name="purchaseDate" placeholder="dd/mm/aaaa" defaultValue={equipment?.purchaseDate ?? ''} className={inputCls} />
      </Field>
      <Field label="Valor de compra" htmlFor="eq-valor">
        <input id="eq-valor" name="purchaseValue" inputMode="decimal" defaultValue={equipment?.purchaseValue ?? ''} className={inputCls} />
      </Field>
      <Field label="Calibração vence em" htmlFor="eq-calibracao" hint="Instrumento de medição sem calibração em dia não vale como prova técnica.">
        <input id="eq-calibracao" name="calibrationDueAt" placeholder="dd/mm/aaaa" defaultValue={equipment?.calibrationDueAt ?? ''} className={inputCls} />
      </Field>
      <div className="sm:col-span-3">
        <Field label="Observações" htmlFor="eq-obs">
          <input id="eq-obs" name="notes" defaultValue={equipment?.notes ?? ''} className={inputCls} />
        </Field>
      </div>

      <div className="flex items-center gap-2 sm:col-span-4">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
          {pending ? 'Salvando…' : 'Salvar equipamento'}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
          Cancelar
        </button>
        <FormError message={state.error} />
      </div>
    </form>
  );
}

export function NewEquipment() {
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
      >
        <Plus className="h-4 w-4" aria-hidden /> Cadastrar equipamento
      </button>
    );
  }
  return <CadastroForm equipment={null} onClose={() => setAberto(false)} />;
}

export function EditEquipmentButton({ equipment }: { equipment: EquipmentForm }) {
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
      >
        <Pencil className="h-3 w-3" aria-hidden /> Editar
      </button>
    );
  }
  return (
    <div className="mt-2">
      <CadastroForm equipment={equipment} onClose={() => setAberto(false)} />
    </div>
  );
}

// ---------- Saída ----------

const TIPOS = [
  { value: 'OBRA', label: 'Uso em obra (nosso)' },
  { value: 'EMPRESTIMO', label: 'Empréstimo a terceiro' },
  { value: 'ALUGUEL', label: 'Aluguel' },
  { value: 'MANUTENCAO', label: 'Manutenção / calibração' },
] as const;

/**
 * Registra que o equipamento saiu.
 *
 * Responsável é obrigatório: uma saída sem dono é justamente o que faz o
 * equipamento sumir. Quem leva pode ser um colaborador ou um nome livre,
 * para o caso de terceiro que não usa o sistema.
 */
export function CheckOutButton({ equipmentId, equipmentName, projects, clients, users }: {
  equipmentId: string; equipmentName: string;
  projects: ProjectOption[]; clients: ClientOption[]; users: UserOption[];
}) {
  const [aberto, setAberto] = useState(false);
  const [externo, setExterno] = useState(false);
  const action = checkOutAction.bind(null, equipmentId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  useFecharAoConcluir(state, () => setAberto(false));

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-700"
      >
        <ArrowUpRight className="h-3 w-3" aria-hidden /> Registrar saída
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-2 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
      <p className="text-xs font-semibold text-slate-700 sm:col-span-3">Saída de {equipmentName}</p>

      <Field label="Motivo" htmlFor={`co-tipo-${equipmentId}`} required>
        <select id={`co-tipo-${equipmentId}`} name="kind" defaultValue="OBRA" className={inputCls}>
          {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </Field>

      <div className="sm:col-span-2">
        <Field label="Quem está levando" htmlFor={`co-resp-${equipmentId}`} required>
          {externo ? (
            <input id={`co-resp-${equipmentId}`} name="holderName" required placeholder="Nome de quem levou" className={inputCls} />
          ) : (
            <select id={`co-resp-${equipmentId}`} name="holderUserId" required className={inputCls}>
              <option value="">Selecione…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
        </Field>
        <button
          type="button"
          onClick={() => setExterno(!externo)}
          className="mt-1 text-[11px] text-slate-500 underline hover:text-slate-700"
        >
          {externo ? 'É alguém da equipe' : 'É alguém de fora'}
        </button>
      </div>

      <Field label="Projeto" htmlFor={`co-proj-${equipmentId}`}>
        <select id={`co-proj-${equipmentId}`} name="projectId" className={inputCls}>
          <option value="">—</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
      </Field>
      <Field label="Cliente" htmlFor={`co-cli-${equipmentId}`}>
        <select id={`co-cli-${equipmentId}`} name="clientId" className={inputCls}>
          <option value="">—</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Destino" htmlFor={`co-dest-${equipmentId}`}>
        <input id={`co-dest-${equipmentId}`} name="destination" placeholder="Obra, endereço, empresa…" className={inputCls} />
      </Field>

      <Field label="Devolução prevista" htmlFor={`co-prev-${equipmentId}`} hint="É o que permite cobrar a devolução em atraso.">
        <input id={`co-prev-${equipmentId}`} name="expectedReturnAt" placeholder="dd/mm/aaaa" className={inputCls} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Estado na saída" htmlFor={`co-cond-${equipmentId}`}>
          <input id={`co-cond-${equipmentId}`} name="conditionOut" placeholder="Ex.: completo, com maleta e 4 garras" className={inputCls} />
        </Field>
      </div>

      <div className="flex items-center gap-2 sm:col-span-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
          {pending ? 'Registrando…' : 'Confirmar saída'}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-white">
          Cancelar
        </button>
        <FormError message={state.error} />
      </div>
    </form>
  );
}

// ---------- Devolução ----------

export function CheckInButton({ movementId, equipmentName }: { movementId: string; equipmentName: string }) {
  const [aberto, setAberto] = useState(false);
  const action = checkInAction.bind(null, movementId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  useFecharAoConcluir(state, () => setAberto(false));

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
      >
        <ArrowDownLeft className="h-3 w-3" aria-hidden /> Registrar devolução
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold text-slate-700">Devolução de {equipmentName}</p>
      <Field label="Estado na devolução" htmlFor={`ci-cond-${movementId}`}>
        <input id={`ci-cond-${movementId}`} name="conditionIn" placeholder="Ex.: completo e funcionando" className={inputCls} />
      </Field>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" name="paraManutencao" className="rounded border-slate-300" />
        Voltou com problema — mandar para manutenção
      </label>
      <FormError message={state.error} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">
          {pending ? 'Registrando…' : 'Confirmar devolução'}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-white">
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function StatusButton({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);

  const proximo = status === 'MANUTENCAO' ? 'DISPONIVEL' : 'MANUTENCAO';
  const rotulo = status === 'MANUTENCAO' ? 'Voltou da manutenção' : 'Mandar para manutenção';

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          setErro(null);
          const r = await setEquipmentStatusAction(id, proximo as 'DISPONIVEL' | 'MANUTENCAO');
          if (r.error) setErro(r.error);
          else router.refresh();
        }}
        className="rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
      >
        {rotulo}
      </button>
      <FormError message={erro} />
    </>
  );
}
