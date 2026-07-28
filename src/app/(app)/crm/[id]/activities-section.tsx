'use client';

import { useActionState, useState } from 'react';
import { CheckCircle2, Circle, Plus, X } from 'lucide-react';
import { createActivityAction, completeActivityAction, type ActionState } from '@/actions/opportunities';
import { inputCls, Field, FormError } from '@/components/ui';
import { formatDateBR, formatDateTimeBR } from '@/lib/dates';

const ACTIVITY_LABELS: Record<string, string> = {
  LIGACAO: 'Ligação',
  REUNIAO: 'Reunião',
  VISITA_TECNICA: 'Visita técnica',
  MENSAGEM: 'Mensagem',
  EMAIL: 'E-mail',
  TAREFA: 'Tarefa',
  LEMBRETE: 'Lembrete',
  ENVIO_DOCUMENTO: 'Envio de documento',
  FOLLOW_UP: 'Follow-up',
  NEGOCIACAO: 'Negociação',
  DECISAO: 'Decisão',
};

export type ActivityRow = {
  id: string;
  activityType: string;
  title: string;
  notes: string | null;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  responsible: { id: string; name: string } | null;
};

type Option = { id: string; name: string };

export function ActivitiesSection({
  opportunityId, activities, users, canWrite,
}: {
  opportunityId: string;
  activities: ActivityRow[];
  users: Option[];
  canWrite: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const action = createActivityAction.bind(null, { opportunityId });
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const result = await action(prev, fd);
      if (!result.error) setShowForm(false);
      return result;
    },
    {},
  );

  const now = Date.now();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Atividades ({activities.length})</h2>
        {canWrite ? (
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            {showForm ? <X className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
            {showForm ? 'Fechar' : 'Registrar atividade'}
          </button>
        ) : null}
      </div>

      {showForm ? (
        <form action={formAction} className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Tipo" htmlFor="a-type" required>
              <select id="a-type" name="activityType" className={inputCls} defaultValue="FOLLOW_UP">
                {Object.entries(ACTIVITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Título" htmlFor="a-title" required>
              <input id="a-title" name="title" required placeholder="Ex.: retornar ligação sobre proposta" className={inputCls} />
            </Field>
            <Field label="Responsável" htmlFor="a-resp">
              <select id="a-resp" name="responsibleId" className={inputCls} defaultValue="">
                <option value="">Eu mesmo</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
            <Field label="Prazo" htmlFor="a-due">
              <input id="a-due" name="dueAt" placeholder="dd/mm/aaaa" className={inputCls} />
            </Field>
          </div>
          <Field label="Observações" htmlFor="a-notes">
            <textarea id="a-notes" name="notes" rows={2} className={inputCls} />
          </Field>
          <FormError message={state.error} />
          <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
            {pending ? 'Salvando…' : 'Salvar atividade'}
          </button>
        </form>
      ) : null}

      <ul className="mt-3 space-y-2">
        {activities.length === 0 ? (
          <li className="py-2 text-sm text-slate-500">Nenhuma atividade registrada.</li>
        ) : activities.map((a) => {
          const overdue = a.status === 'PENDENTE' && a.dueAt && new Date(a.dueAt).getTime() < now;
          return (
            <li key={a.id} className={`rounded-lg border p-3 ${overdue ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-start gap-2.5">
                {a.status === 'CONCLUIDA' ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" aria-label="Concluída" />
                ) : canWrite ? (
                  <button
                    type="button"
                    onClick={() => void completeActivityAction(a.id, `/crm/${opportunityId}`)}
                    className="mt-0.5 shrink-0 text-slate-300 transition hover:text-green-500"
                    aria-label={`Concluir "${a.title}"`}
                  >
                    <Circle className="h-4 w-4" aria-hidden />
                  </button>
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${a.status === 'CONCLUIDA' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                    <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                      {ACTIVITY_LABELS[a.activityType] ?? a.activityType}
                    </span>
                    {a.title}
                  </p>
                  {a.notes ? <p className="mt-0.5 text-xs text-slate-500">{a.notes}</p> : null}
                  <p className="mt-1 text-[11px] text-slate-400">
                    {a.responsible ? `${a.responsible.name} · ` : ''}
                    {a.dueAt ? `prazo ${formatDateBR(a.dueAt)} · ` : ''}
                    {overdue ? 'EM ATRASO · ' : ''}
                    criada em {formatDateTimeBR(a.createdAt)}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
