'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, FileCheck2, Plus } from 'lucide-react';
import {
  createStageAction, setStageStatusAction, createDeliverableAction, issueRevisionAction,
  setDeliverableStatusAction, createTimeEntryAction, approveTimeEntryAction, type ActionState,
} from '@/actions/projects';
import { inputCls, Field, FormError, SubmitButton, Badge } from '@/components/ui';
import { formatDateBR } from '@/lib/dates';
import { STAGE_STATUS_BADGE, DELIVERABLE_STATUS_BADGE } from '../status-badge';

// ---------- Etapas ----------

export type StageRow = { id: string; name: string; status: string; startedAt: string | null; completedAt: string | null };

export function StagesSection({ projectId, stages, canWrite }: { projectId: string; stages: StageRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  function changeStatus(stageId: string, status: string) {
    startTransition(async () => {
      const r = await setStageStatusAction(projectId, stageId, status);
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }

  function addStage() {
    if (!newName.trim()) return;
    startTransition(async () => {
      const r = await createStageAction(projectId, newName);
      if (r.error) setError(r.error);
      else { setNewName(''); router.refresh(); }
    });
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Etapas</h2>
      <ol className="space-y-2">
        {stages.map((s) => {
          const badge = STAGE_STATUS_BADGE[s.status] ?? STAGE_STATUS_BADGE.PENDENTE;
          return (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                <span className="truncate text-sm text-slate-800">{s.name}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge color={badge.color}>{badge.label}</Badge>
                {canWrite && s.status !== 'CONCLUIDA' && s.status !== 'CANCELADA' ? (
                  <select
                    value={s.status}
                    disabled={pending}
                    onChange={(e) => changeStatus(s.id, e.target.value)}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                    aria-label={`Status da etapa ${s.name}`}
                  >
                    <option value="PENDENTE">Pendente</option>
                    <option value="EM_ANDAMENTO">Em andamento</option>
                    <option value="CONCLUIDA">Concluída</option>
                    <option value="CANCELADA">Cancelada</option>
                  </select>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {canWrite ? (
        <div className="mt-3 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nova etapa…"
            className={`${inputCls} max-w-xs`}
          />
          <button
            type="button" disabled={pending} onClick={addStage}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar
          </button>
        </div>
      ) : null}
      <FormError message={error} />
    </div>
  );
}

// ---------- Entregáveis e revisões ----------

export type DeliverableRow = {
  id: string;
  name: string;
  discipline: string | null;
  status: string;
  currentRevision: string | null;
  dueAt: string | null;
  revisions: { id: string; revisionCode: string; revisionDate: string; reason: string | null }[];
};

export function DeliverablesSection({
  projectId, deliverables, stages, users, canWrite,
}: {
  projectId: string; deliverables: DeliverableRow[]; stages: { id: string; name: string }[];
  users: { id: string; name: string }[]; canWrite: boolean;
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Entregáveis</h2>
        {canWrite ? (
          <button
            type="button" onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Novo entregável
          </button>
        ) : null}
      </div>

      {showForm ? (
        <NewDeliverableForm projectId={projectId} stages={stages} users={users} onDone={() => setShowForm(false)} />
      ) : null}

      {deliverables.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum entregável cadastrado.</p>
      ) : (
        <ul className="space-y-2">
          {deliverables.map((d) => (
            <DeliverableItem key={d.id} deliverable={d} projectId={projectId} canWrite={canWrite} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NewDeliverableForm({ projectId, stages, users, onDone }: {
  projectId: string; stages: { id: string; name: string }[]; users: { id: string; name: string }[]; onDone: () => void;
}) {
  const action = createDeliverableAction.bind(null, projectId);
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  useEffect(() => {
    if (state.info) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <Field label="Nome" htmlFor="d-name" required className="sm:col-span-2">
        <input id="d-name" name="name" required className={inputCls} />
      </Field>
      <Field label="Disciplina" htmlFor="d-discipline">
        <input id="d-discipline" name="discipline" placeholder="Ex.: Elétrica, SPDA…" className={inputCls} />
      </Field>
      <Field label="Etapa" htmlFor="d-stageId">
        <select id="d-stageId" name="stageId" className={inputCls}>
          <option value="">Sem etapa</option>
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Responsável" htmlFor="d-responsibleId">
        <select id="d-responsibleId" name="responsibleId" className={inputCls}>
          <option value="">Sem responsável</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </Field>
      <Field label="Prazo" htmlFor="d-dueAt">
        <input id="d-dueAt" name="dueAt" type="date" className={inputCls} />
      </Field>
      <div className="sm:col-span-2"><FormError message={state.error} /></div>
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton>Criar entregável</SubmitButton>
        <button type="button" onClick={onDone} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function DeliverableItem({ deliverable, projectId, canWrite }: {
  deliverable: DeliverableRow; projectId: string; canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showRevision, setShowRevision] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const badge = DELIVERABLE_STATUS_BADGE[deliverable.status] ?? DELIVERABLE_STATUS_BADGE.PENDENTE;

  function decide(status: 'APROVADO' | 'REPROVADO') {
    startTransition(async () => {
      const r = await setDeliverableStatusAction(deliverable.id, projectId, status);
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <li className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-900">
            {deliverable.name}
            {deliverable.currentRevision ? <span className="ml-1.5 text-xs font-normal text-slate-400">{deliverable.currentRevision}</span> : null}
          </p>
          {deliverable.discipline ? <p className="text-xs text-slate-500">{deliverable.discipline}</p> : null}
          {deliverable.dueAt ? <p className="mt-0.5 text-[11px] text-slate-400">Prazo: {formatDateBR(deliverable.dueAt)}</p> : null}
        </div>
        <Badge color={badge.color}>{badge.label}</Badge>
      </div>

      {deliverable.revisions.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-[11px] text-slate-500">
          {deliverable.revisions.map((r) => (
            <li key={r.id}>{r.revisionCode} — {formatDateBR(r.revisionDate)}{r.reason ? ` · ${r.reason}` : ''}</li>
          ))}
        </ul>
      ) : null}

      {canWrite ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button" onClick={() => setShowRevision((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
          >
            <FileCheck2 className="h-3 w-3" aria-hidden /> Emitir revisão
          </button>
          {deliverable.status === 'EMITIDO' ? (
            <>
              <button
                type="button" disabled={pending} onClick={() => decide('APROVADO')}
                className="rounded-lg border border-green-300 px-2.5 py-1 text-[11px] font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
              >
                Aprovar
              </button>
              <button
                type="button" disabled={pending} onClick={() => decide('REPROVADO')}
                className="rounded-lg border border-red-300 px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Reprovar
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {showRevision ? (
        <RevisionForm
          deliverableId={deliverable.id} projectId={projectId}
          onDone={() => { setShowRevision(false); router.refresh(); }}
        />
      ) : null}
      <FormError message={error} />
    </li>
  );
}

function RevisionForm({ deliverableId, projectId, onDone }: {
  deliverableId: string; projectId: string; onDone: () => void;
}) {
  const action = issueRevisionAction.bind(null, deliverableId, projectId);
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  useEffect(() => {
    if (state.info) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
      <Field label="Motivo" htmlFor="reason">
        <input id="reason" name="reason" placeholder="Ex.: Revisão de projeto elétrico" className={inputCls} />
      </Field>
      <Field label="Alterações" htmlFor="changes">
        <textarea id="changes" name="changes" rows={2} className={inputCls} />
      </Field>
      <FormError message={state.error} />
      <SubmitButton>Emitir</SubmitButton>
    </form>
  );
}

// ---------- Apontamento de horas ----------

export type TimeEntryRow = {
  id: string;
  workDate: string;
  hours: string;
  description: string | null;
  billable: boolean;
  approvedAt: string | null;
  user: { name: string };
  task: { title: string } | null;
};

export function TimeEntriesSection({
  projectId, entries, canWrite, canApprove,
}: { projectId: string; entries: TimeEntryRow[]; canWrite: boolean; canApprove: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function approve(entryId: string) {
    startTransition(async () => {
      await approveTimeEntryAction(entryId, projectId);
      router.refresh();
    });
  }

  const totalHours = entries.reduce((acc, e) => acc + Number(e.hours), 0);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Apontamento de horas <span className="font-normal text-slate-400">— {totalHours.toFixed(1)}h</span></h2>
        {canWrite ? (
          <button
            type="button" onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Lançar horas
          </button>
        ) : null}
      </div>

      {showForm ? (
        <NewTimeEntryForm projectId={projectId} onDone={() => { setShowForm(false); router.refresh(); }} />
      ) : null}

      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum apontamento registrado.</p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead className="text-slate-400">
            <tr>
              <th className="py-1 font-medium">Data</th>
              <th className="py-1 font-medium">Colaborador</th>
              <th className="py-1 font-medium">Horas</th>
              <th className="py-1 font-medium">Descrição</th>
              <th className="py-1 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="py-1.5">{formatDateBR(e.workDate)}</td>
                <td className="py-1.5">{e.user.name}</td>
                <td className="py-1.5">{Number(e.hours).toFixed(1)}h{e.billable ? '' : ' (não fat.)'}</td>
                <td className="py-1.5 text-slate-500">{e.description ?? e.task?.title ?? '—'}</td>
                <td className="py-1.5">
                  {e.approvedAt ? (
                    <Badge color="green">Aprovado</Badge>
                  ) : canApprove ? (
                    <button
                      type="button" disabled={pending} onClick={() => approve(e.id)}
                      className="rounded-lg border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Aprovar
                    </button>
                  ) : (
                    <Badge color="amber">Pendente</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function NewTimeEntryForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const action = createTimeEntryAction.bind(null, projectId);
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  useEffect(() => {
    if (state.info) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <Field label="Data" htmlFor="workDate" required>
        <input id="workDate" name="workDate" type="date" required className={inputCls} />
      </Field>
      <Field label="Horas" htmlFor="hours" required>
        <input id="hours" name="hours" placeholder="Ex.: 4,5" required className={inputCls} />
      </Field>
      <Field label="Descrição" htmlFor="description" className="sm:col-span-2">
        <input id="description" name="description" className={inputCls} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
        <input type="checkbox" name="billable" defaultChecked className="rounded border-slate-300" />
        Faturável
      </label>
      <div className="sm:col-span-2"><FormError message={state.error} /></div>
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton>Lançar</SubmitButton>
        <button type="button" onClick={onDone} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
          Cancelar
        </button>
      </div>
    </form>
  );
}
