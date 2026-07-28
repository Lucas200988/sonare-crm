'use client';

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable,
  useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { Archive, CalendarClock, CheckSquare, FileStack, FolderOpen, Plus, Users } from 'lucide-react';
import {
  createProjectAction, moveProjectAction, setProjectArchivedAction, type ActionState,
} from '@/actions/projects';
import { inputCls, Field, FormError, SubmitButton } from '@/components/ui';
import { formatDateBR } from '@/lib/dates';
import { abrirPastaNoExplorador } from './[id]/folder-link';
import { ClientSelect } from '@/components/client-select';
import { BOARD_COLUMNS, columnForStatus } from '@/config/project-board';

export type BoardProject = {
  id: string;
  code: string;
  name: string;
  status: string;
  priority: string;
  contractualDeadline: string | null;
  folderPath: string | null;
  client: { legalName: string; tradeName: string | null };
  members: { id: string; name: string }[];
  taskCount: number;
  deliverableCount: number;
};

export type ClientOption = { id: string; legalName: string; tradeName: string | null };

const PRIORITY_BAR: Record<string, string> = {
  BAIXA: 'bg-slate-300',
  MEDIA: 'bg-sky-400',
  ALTA: 'bg-amber-400',
  URGENTE: 'bg-red-500',
};

function deadlineTone(deadline: string | null, status: string): string {
  if (!deadline || status === 'CONCLUIDO' || status === 'ENCERRADO') return 'text-slate-400';
  const dias = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  if (dias < 0) return 'text-red-600 font-semibold';
  if (dias <= 7) return 'text-amber-600 font-medium';
  return 'text-slate-400';
}

function ProjectCard({ project, overlay, onArchive }: {
  project: BoardProject; overlay?: boolean; onArchive?: () => void;
}) {
  return (
    <div className={`group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ${overlay ? 'rotate-2 shadow-lg' : ''}`}>
      <div className={`h-1 w-full ${PRIORITY_BAR[project.priority] ?? PRIORITY_BAR.MEDIA}`} />
      <div className="relative p-3">
        <div className="absolute right-2 top-2 hidden items-center gap-0.5 group-hover:flex">
          {project.folderPath ? (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => abrirPastaNoExplorador(project.folderPath!)}
              title={`Abrir ${project.folderPath}`}
              aria-label={`Abrir a pasta de ${project.name}`}
              className="rounded p-1 text-amber-500 hover:bg-amber-50"
            >
              <FolderOpen className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
          {onArchive ? (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onArchive}
              title="Arquivar cartão"
              aria-label={`Arquivar ${project.name}`}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <Archive className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
        <span className="text-[11px] font-semibold text-slate-400">{project.code}</span>
        <Link href={`/projetos/${project.id}`} className="mt-0.5 block text-sm font-medium leading-snug text-slate-900 hover:underline">
          {project.name}
        </Link>
        <p className="mt-1 truncate text-xs text-slate-500">{project.client.tradeName ?? project.client.legalName}</p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          {project.contractualDeadline ? (
            <span className={`flex items-center gap-1 ${deadlineTone(project.contractualDeadline, project.status)}`}>
              <CalendarClock className="h-3 w-3" aria-hidden />
              {formatDateBR(project.contractualDeadline)}
            </span>
          ) : null}
          {project.taskCount > 0 ? (
            <span className="flex items-center gap-1 text-slate-400">
              <CheckSquare className="h-3 w-3" aria-hidden />{project.taskCount}
            </span>
          ) : null}
          {project.deliverableCount > 0 ? (
            <span className="flex items-center gap-1 text-slate-400">
              <FileStack className="h-3 w-3" aria-hidden />{project.deliverableCount}
            </span>
          ) : null}
          {project.members.length > 0 ? (
            <span className="flex items-center gap-1 text-slate-400" title={project.members.map((m) => m.name).join(', ')}>
              <Users className="h-3 w-3" aria-hidden />{project.members.length}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DraggableProject({ project, disabled, onArchive }: {
  project: BoardProject; disabled: boolean; onArchive: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: project.id, disabled });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`${isDragging ? 'opacity-30' : ''} ${disabled ? '' : 'cursor-grab active:cursor-grabbing'}`}
    >
      <ProjectCard project={project} onArchive={disabled ? undefined : onArchive} />
    </div>
  );
}

function BoardColumn({ columnId, label, isDone, projects, children }: {
  columnId: string; label: string; isDone: boolean;
  projects: BoardProject[]; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });
  const atrasados = isDone ? 0 : projects.filter(
    (p) => p.contractualDeadline && new Date(p.contractualDeadline) < new Date(),
  ).length;

  return (
    <div className="flex min-w-72 flex-1 flex-col rounded-xl bg-slate-200/60">
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
        <h3 className="truncate text-sm font-semibold text-slate-800">{label}</h3>
        <div className="flex shrink-0 items-center gap-1">
          {atrasados > 0 ? (
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700" title={`${atrasados} com prazo vencido`}>
              {atrasados}
            </span>
          ) : null}
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500">{projects.length}</span>
        </div>
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

export function ProjectBoard({ projects, clients, canWrite }: {
  projects: BoardProject[]; clients: ClientOption[]; canWrite: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [active, setActive] = useState<BoardProject | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, string>>({});
  const [archived, setArchived] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byColumn = useMemo(() => {
    const map = new Map<string, BoardProject[]>();
    for (const c of BOARD_COLUMNS) map.set(c.id, []);
    for (const p of projects) {
      if (archived.includes(p.id)) continue;
      const status = optimistic[p.id] ?? p.status;
      const coluna = columnForStatus(status);
      if (!coluna) continue; // cancelado fica fora do quadro
      map.get(coluna.id)!.push(p);
    }
    return map;
  }, [projects, optimistic, archived]);

  function onDragStart(event: DragStartEvent) {
    setActive(projects.find((p) => p.id === event.active.id) ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    setActive(null);
    const { active: dragged, over } = event;
    if (!over) return;
    const project = projects.find((p) => p.id === dragged.id);
    if (!project) return;
    const current = optimistic[project.id] ?? project.status;
    const coluna = BOARD_COLUMNS.find((c) => c.id === String(over.id));
    if (!coluna || coluna.absorbs.includes(current)) return;

    setError(null);
    setOptimistic((prev) => ({ ...prev, [project.id]: coluna.status }));
    const position = byColumn.get(coluna.id)?.length ?? 0;
    startTransition(async () => {
      const result = await moveProjectAction(project.id, coluna.status, position);
      if (result.error) {
        setOptimistic((prev) => {
          const { [project.id]: _drop, ...rest } = prev;
          return rest;
        });
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function archive(projectId: string) {
    setArchived((prev) => [...prev, projectId]);
    startTransition(async () => {
      const result = await setProjectArchivedAction(projectId, true);
      if (result.error) {
        setArchived((prev) => prev.filter((id) => id !== projectId));
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Arraste o cartão entre as colunas para mudar a situação do projeto.
        </p>
        {canWrite ? (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            <Plus className="h-4 w-4" aria-hidden /> Novo projeto
          </button>
        ) : null}
      </div>

      {showForm ? (
        <NewProjectForm clients={clients} onDone={() => { setShowForm(false); router.refresh(); }} />
      ) : null}

      {error ? (
        <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {BOARD_COLUMNS.map((coluna) => {
            const columnProjects = byColumn.get(coluna.id) ?? [];
            return (
              <BoardColumn
                key={coluna.id}
                columnId={coluna.id}
                label={coluna.label}
                isDone={coluna.id === 'finalizado'}
                projects={columnProjects}
              >
                {columnProjects.map((p) => (
                  <DraggableProject
                    key={p.id} project={p} disabled={!canWrite}
                    onArchive={() => archive(p.id)}
                  />
                ))}
              </BoardColumn>
            );
          })}
        </div>
        <DragOverlay>{active ? <ProjectCard project={active} overlay /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function NewProjectForm({ clients, onDone }: { clients: ClientOption[]; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createProjectAction, {});

  useEffect(() => {
    if (state.info) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <Field label="Nome do projeto" htmlFor="np-name" required className="sm:col-span-2">
        <input id="np-name" name="name" required className={inputCls} placeholder="Ex.: Projeto elétrico — Unidade Cuiabá" />
      </Field>
      <Field label="Cliente" htmlFor="np-clientId" required>
        <ClientSelect id="np-clientId" name="clientId" clients={clients} required />
      </Field>
      <Field label="Prioridade" htmlFor="np-priority">
        <select id="np-priority" name="priority" defaultValue="MEDIA" className={inputCls}>
          <option value="BAIXA">Baixa</option>
          <option value="MEDIA">Média</option>
          <option value="ALTA">Alta</option>
          <option value="URGENTE">Urgente</option>
        </select>
      </Field>
      <Field label="Prazo de entrega" htmlFor="np-deadline">
        <input id="np-deadline" name="contractualDeadline" type="date" className={inputCls} />
      </Field>
      <Field label="Pasta dos documentos (rede)" htmlFor="np-folder">
        <input
          id="np-folder" name="folderPath"
          placeholder="Z:\SONARE\Projetos\..."
          className={`${inputCls} font-mono text-xs`}
        />
      </Field>
      <div className="sm:col-span-2"><FormError message={state.error} /></div>
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton pending={pending}>Criar projeto</SubmitButton>
        <button type="button" onClick={onDone} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
          Cancelar
        </button>
      </div>
    </form>
  );
}
