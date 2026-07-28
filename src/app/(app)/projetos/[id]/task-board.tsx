'use client';

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable,
  useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { CalendarClock, Plus, Trash2, User } from 'lucide-react';
import {
  createTaskAction, setTaskStatusAction, deleteTaskAction, type ActionState,
} from '@/actions/projects';
import { inputCls, Field, FormError, SubmitButton } from '@/components/ui';
import { formatDateBR } from '@/lib/dates';
import { TASK_STATUS_COLUMNS } from '../status-badge';

export type BoardTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  stageId: string | null;
  assignee: { id: string; name: string } | null;
};
export type StageOption = { id: string; name: string };
export type UserOption = { id: string; name: string };

const PRIORITY_DOT: Record<string, string> = {
  BAIXA: 'bg-slate-300',
  MEDIA: 'bg-sky-400',
  ALTA: 'bg-amber-400',
  URGENTE: 'bg-red-500',
};

function TaskCard({ task, overlay, onDelete, canWrite }: {
  task: BoardTask; overlay?: boolean; onDelete?: () => void; canWrite: boolean;
}) {
  return (
    <div className={`group rounded-lg border border-slate-200 bg-white p-3 shadow-sm ${overlay ? 'rotate-2 shadow-lg' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug text-slate-900">{task.title}</p>
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[task.priority] ?? PRIORITY_DOT.MEDIA}`} title={`Prioridade ${task.priority.toLowerCase()}`} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        {task.assignee ? (
          <span className="flex items-center gap-1 text-slate-400" title={task.assignee.name}>
            <User className="h-3 w-3" aria-hidden />
            {task.assignee.name.split(' ')[0]}
          </span>
        ) : <span />}
        {task.dueAt ? (
          <span className="flex items-center gap-1 text-slate-400">
            <CalendarClock className="h-3 w-3" aria-hidden />
            {formatDateBR(task.dueAt)}
          </span>
        ) : null}
      </div>
      {canWrite && onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Remover tarefa ${task.title}`}
          className="mt-1 hidden text-[11px] text-red-500 hover:underline group-hover:inline-flex items-center gap-1"
        >
          <Trash2 className="h-3 w-3" aria-hidden /> remover
        </button>
      ) : null}
    </div>
  );
}

function DraggableTask({ task, disabled, onDelete, canWrite }: {
  task: BoardTask; disabled: boolean; onDelete: () => void; canWrite: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`${isDragging ? 'opacity-30' : ''} ${disabled ? '' : 'cursor-grab active:cursor-grabbing'}`}
    >
      <TaskCard task={task} onDelete={onDelete} canWrite={canWrite} />
    </div>
  );
}

function StatusColumn({ status, label, tasks, children }: {
  status: string; label: string; tasks: BoardTask[]; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl bg-slate-200/60">
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
        <h3 className="text-sm font-semibold text-slate-800">{label}</h3>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2 pt-0 transition ${isOver ? 'rounded-b-xl bg-amber-100/60' : ''}`}
      >
        {children}
      </div>
    </div>
  );
}

export function TaskBoard({
  projectId, tasks, stages, users, canWrite,
}: {
  projectId: string; tasks: BoardTask[]; stages: StageOption[]; users: UserOption[]; canWrite: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeTask, setActiveTask] = useState<BoardTask | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const tasksByStatus = useMemo(() => {
    const map = new Map<string, BoardTask[]>();
    for (const c of TASK_STATUS_COLUMNS) map.set(c.status, []);
    for (const t of tasks) {
      const status = optimistic[t.id] ?? t.status;
      if (!map.has(status)) continue;
      map.get(status)!.push(t);
    }
    return map;
  }, [tasks, optimistic]);

  function onDragStart(event: DragStartEvent) {
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;
    const task = tasks.find((t) => t.id === active.id);
    if (!task) return;
    const currentStatus = optimistic[task.id] ?? task.status;
    const targetStatus = String(over.id);
    if (targetStatus === currentStatus) return;
    setError(null);
    setOptimistic((prev) => ({ ...prev, [task.id]: targetStatus }));
    startTransition(async () => {
      const result = await setTaskStatusAction(task.id, projectId, targetStatus);
      if (result.error) {
        setOptimistic((prev) => {
          const { [task.id]: _drop, ...rest } = prev;
          return rest;
        });
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete(taskId: string) {
    if (!confirm('Remover esta tarefa?')) return;
    startTransition(async () => {
      const result = await deleteTaskAction(taskId, projectId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Quadro de tarefas</h2>
        {canWrite ? (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Nova tarefa
          </button>
        ) : null}
      </div>

      {showForm ? (
        <NewTaskForm
          projectId={projectId}
          stages={stages}
          users={users}
          onDone={() => { setShowForm(false); router.refresh(); }}
        />
      ) : null}

      {error ? (
        <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {TASK_STATUS_COLUMNS.map((col) => {
            const colTasks = tasksByStatus.get(col.status) ?? [];
            return (
              <StatusColumn key={col.status} status={col.status} label={col.label} tasks={colTasks}>
                {colTasks.map((task) => (
                  <DraggableTask
                    key={task.id}
                    task={task}
                    disabled={!canWrite}
                    canWrite={canWrite}
                    onDelete={() => handleDelete(task.id)}
                  />
                ))}
              </StatusColumn>
            );
          })}
        </div>
        <DragOverlay>{activeTask ? <TaskCard task={activeTask} overlay canWrite={false} /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function NewTaskForm({ projectId, stages, users, onDone }: {
  projectId: string; stages: StageOption[]; users: UserOption[]; onDone: () => void;
}) {
  const action = createTaskAction.bind(null, projectId);
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  useEffect(() => {
    if (state.info) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <Field label="Título" htmlFor="title" required className="sm:col-span-2">
        <input id="title" name="title" required className={inputCls} />
      </Field>
      <Field label="Etapa" htmlFor="stageId">
        <select id="stageId" name="stageId" className={inputCls}>
          <option value="">Sem etapa</option>
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Responsável" htmlFor="assigneeId">
        <select id="assigneeId" name="assigneeId" className={inputCls}>
          <option value="">Sem responsável</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </Field>
      <Field label="Prioridade" htmlFor="priority">
        <select id="priority" name="priority" defaultValue="MEDIA" className={inputCls}>
          <option value="BAIXA">Baixa</option>
          <option value="MEDIA">Média</option>
          <option value="ALTA">Alta</option>
          <option value="URGENTE">Urgente</option>
        </select>
      </Field>
      <Field label="Prazo" htmlFor="dueAt">
        <input id="dueAt" name="dueAt" type="date" className={inputCls} />
      </Field>
      <Field label="Estimativa (horas)" htmlFor="estimatedHours">
        <input id="estimatedHours" name="estimatedHours" className={inputCls} placeholder="Ex.: 8" />
      </Field>
      <div className="sm:col-span-2">
        <FormError message={state.error} />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton>Criar tarefa</SubmitButton>
        <button type="button" onClick={onDone} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
          Cancelar
        </button>
      </div>
    </form>
  );
}
