'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setProjectStatusAction, updateProjectAction, type ActionState } from '@/actions/projects';
import { inputCls, Field, FormError, SubmitButton } from '@/components/ui';
import { PROJECT_STATUS_BADGE } from '../status-badge';

export function ProjectStatusSelect({ projectId, current }: { projectId: string; current: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      <select
        value={current}
        disabled={pending}
        onChange={(e) => startTransition(async () => {
          setError(null);
          const r = await setProjectStatusAction(projectId, e.target.value);
          if (r.error) setError(r.error);
          else router.refresh();
        })}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        aria-label="Status do projeto"
      >
        {Object.entries(PROJECT_STATUS_BADGE).map(([value, { label }]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <FormError message={error} />
    </div>
  );
}

export type ProjectFormValues = {
  name: string;
  clientUnitId: string;
  technicalLeadId: string;
  coordinatorId: string;
  disciplines: string;
  startDate: string;
  contractualDeadline: string;
  expectedEndDate: string;
  priority: string;
  folderPath: string;
  risks: string;
  notes: string;
  memberIds: string[];
};

export function ProjectForm({
  projectId, initial, clientUnits, users, startOpen = false, onClose,
}: {
  projectId: string;
  initial: ProjectFormValues;
  clientUnits: { id: string; name: string }[];
  users: { id: string; name: string }[];
  /** Abre já em modo de edição (usado pelo cabeçalho do cartão). */
  startOpen?: boolean;
  onClose?: () => void;
}) {
  const action = updateProjectAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const [memberIds, setMemberIds] = useState<string[]>(initial.memberIds);
  const [open, setOpen] = useState(startOpen);

  const router = useRouter();
  useEffect(() => {
    if (state.info) { setOpen(false); onClose?.(); router.refresh(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function fechar() {
    setOpen(false);
    onClose?.();
  }

  if (!open) {
    return (
      <button
        type="button" onClick={() => setOpen(true)}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Editar dados do projeto
      </button>
    );
  }

  function toggleMember(id: string) {
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  return (
    <form action={formAction} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <Field label="Nome do projeto" htmlFor="name" required className="sm:col-span-2">
        <input id="name" name="name" defaultValue={initial.name} required className={inputCls} />
      </Field>
      <Field label="Unidade do cliente" htmlFor="clientUnitId">
        <select id="clientUnitId" name="clientUnitId" defaultValue={initial.clientUnitId} className={inputCls}>
          <option value="">—</option>
          {clientUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </Field>
      <Field label="Prioridade" htmlFor="priority">
        <select id="priority" name="priority" defaultValue={initial.priority} className={inputCls}>
          <option value="BAIXA">Baixa</option>
          <option value="MEDIA">Média</option>
          <option value="ALTA">Alta</option>
          <option value="URGENTE">Urgente</option>
        </select>
      </Field>
      <Field label="Responsável técnico" htmlFor="technicalLeadId">
        <select id="technicalLeadId" name="technicalLeadId" defaultValue={initial.technicalLeadId} className={inputCls}>
          <option value="">—</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </Field>
      <Field label="Coordenador" htmlFor="coordinatorId">
        <select id="coordinatorId" name="coordinatorId" defaultValue={initial.coordinatorId} className={inputCls}>
          <option value="">—</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </Field>
      <Field label="Disciplinas (separadas por vírgula)" htmlFor="disciplines" className="sm:col-span-2">
        <input id="disciplines" name="disciplines" defaultValue={initial.disciplines} placeholder="Elétrica, Hidrossanitário, SPDA…" className={inputCls} />
      </Field>
      <Field label="Início" htmlFor="startDate">
        <input id="startDate" name="startDate" type="date" defaultValue={initial.startDate} className={inputCls} />
      </Field>
      <Field label="Prazo contratual" htmlFor="contractualDeadline">
        <input id="contractualDeadline" name="contractualDeadline" type="date" defaultValue={initial.contractualDeadline} className={inputCls} />
      </Field>
      <Field label="Previsão de término" htmlFor="expectedEndDate">
        <input id="expectedEndDate" name="expectedEndDate" type="date" defaultValue={initial.expectedEndDate} className={inputCls} />
      </Field>
      <Field label="Pasta dos documentos (rede)" htmlFor="folderPath" className="sm:col-span-2">
        <input
          id="folderPath" name="folderPath" defaultValue={initial.folderPath}
          placeholder="Z:\SONARE\Projetos\2026\Cliente — Projeto"
          className={`${inputCls} font-mono text-xs`}
        />
        <p className="mt-1 text-[11px] text-slate-500">
          Cole o caminho da pasta no servidor. Aparece no topo do cartão com um botão para copiar.
        </p>
      </Field>
      <Field label="Riscos" htmlFor="risks" className="sm:col-span-2">
        <textarea id="risks" name="risks" defaultValue={initial.risks} rows={2} className={inputCls} />
      </Field>
      <Field label="Observações" htmlFor="notes" className="sm:col-span-2">
        <textarea id="notes" name="notes" defaultValue={initial.notes} rows={2} className={inputCls} />
      </Field>

      <div className="sm:col-span-2">
        <span className="block text-sm font-medium text-slate-700">Equipe do projeto</span>
        <p className="mb-1.5 text-[11px] text-slate-500">
          Também é quem tem acesso ao cartão. Quem não estiver aqui — nem como responsável
          técnico ou coordenador — só vê este projeto se tiver a permissão de ver todos.
        </p>
        <div className="flex flex-wrap gap-2">
          {users.map((u) => (
            <label key={u.id} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${memberIds.includes(u.id) ? 'border-brand bg-brand/5 text-brand' : 'border-slate-300 text-slate-600'}`}>
              <input
                type="checkbox" name="memberIds" value={u.id}
                checked={memberIds.includes(u.id)}
                onChange={() => toggleMember(u.id)}
                className="rounded border-slate-300"
              />
              {u.name}
            </label>
          ))}
        </div>
      </div>

      <div className="sm:col-span-2"><FormError message={state.error} /></div>
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton pending={pending}>Salvar</SubmitButton>
        <button type="button" onClick={fechar} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
          Cancelar
        </button>
      </div>
    </form>
  );
}
