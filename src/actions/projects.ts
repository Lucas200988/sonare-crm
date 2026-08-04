'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/server/auth/guards';
import * as projects from '@/server/services/projects';
import { saveFile } from '@/server/storage';
import { parseDecimalBR } from '@/lib/parse';

export type ActionState = { error?: string; info?: string };

const optional = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().nullable().optional(),
);

export async function createProjectFromContractAction(contractId: string): Promise<ActionState> {
  const user = await requirePermission('project:write');
  const result = await projects.createProjectFromContract(user, contractId);
  if ('error' in result) return { error: result.error };
  revalidatePath('/projetos');
  revalidatePath(`/contratos/${contractId}`);
  return { info: `Projeto ${result.project.code} criado.` };
}

const newProjectSchema = z.object({
  name: z.string().trim().min(3, 'Informe o nome do projeto.'),
  clientId: z.string().min(1, 'Selecione o cliente.'),
  clientUnitId: optional,
  contractualDeadline: optional,
  priority: z.string().default('MEDIA'),
  folderPath: optional,
});

export async function createProjectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission('project:write');
  const parsed = newProjectSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await projects.createProject(user, parsed.data);
  if ('error' in result) return { error: result.error };

  revalidatePath('/projetos');
  return { info: `Projeto ${result.project.code} criado.` };
}

export async function moveProjectAction(
  projectId: string, status: string, position: number,
): Promise<ActionState> {
  const user = await requirePermission('project:write');
  const result = await projects.moveProjectOnBoard(user, projectId, status as never, position);
  if ('error' in result) return { error: result.error };
  revalidatePath('/projetos');
  return { info: 'Projeto movido.' };
}

export async function setProjectArchivedAction(
  projectId: string, archived: boolean,
): Promise<ActionState> {
  const user = await requirePermission('project:write');
  const result = await projects.setProjectArchived(user, projectId, archived);
  if ('error' in result) return { error: result.error };
  revalidatePath('/projetos');
  revalidatePath('/projetos/arquivados');
  revalidatePath(`/projetos/${projectId}`);
  return { info: archived ? 'Cartão arquivado.' : 'Cartão restaurado.' };
}

export async function deleteProjectAction(projectId: string): Promise<ActionState> {
  const user = await requirePermission('project:write');
  const result = await projects.softDeleteProject(user, projectId);
  if ('error' in result) return { error: result.error };
  revalidatePath('/projetos');
  revalidatePath('/projetos/arquivados');
  return { info: `Projeto ${result.code} excluído.` };
}

export async function addProjectCommentAction(
  projectId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('project:read');
  const body = String(formData.get('body') ?? '').trim();
  if (!body) return { error: 'Escreva um comentário.' };

  const result = await projects.addProjectComment(user, projectId, body);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/projetos/${projectId}`);
  return { info: 'Comentário publicado.' };
}

export async function uploadProjectFileAction(
  projectId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('project:write');
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Selecione um arquivo.' };
  if (file.size > 25 * 1024 * 1024) return { error: 'O arquivo deve ter no máximo 25 MB.' };

  await saveFile({
    companyId: user.companyId,
    entityType: 'project',
    entityId: projectId,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    content: Buffer.from(await file.arrayBuffer()),
    createdById: user.id,
  });

  revalidatePath(`/projetos/${projectId}`);
  return { info: 'Arquivo anexado.' };
}

const projectSchema = z.object({
  name: z.string().trim().min(3, 'Informe o nome do projeto.'),
  clientUnitId: optional,
  technicalLeadId: optional,
  coordinatorId: optional,
  disciplines: optional,
  startDate: optional,
  contractualDeadline: optional,
  expectedEndDate: optional,
  priority: z.string().default('MEDIA'),
  folderPath: optional,
  risks: optional,
  notes: optional,
});

export async function updateProjectAction(
  projectId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('project:write');
  const parsed = projectSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const memberIds = formData.getAll('memberIds').map(String).filter(Boolean);
  const disciplines = (parsed.data.disciplines ?? '')
    .split(',').map((d) => d.trim()).filter(Boolean);

  const result = await projects.updateProject(user, projectId, {
    ...parsed.data,
    disciplines,
    memberIds,
  });
  if ('error' in result) return { error: result.error };

  revalidatePath(`/projetos/${projectId}`);
  return { info: 'Projeto atualizado.' };
}

/**
 * Valor fechado do projeto — a base contra a qual o resultado é medido.
 *
 * Vem do contrato quando o projeto nasce de um, mas nem todo trabalho passa
 * por contrato assinado; aqui dá para preencher direto na aba financeira.
 */
export async function setProjectValueAction(
  projectId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('finance:write');
  const bruto = String(formData.get('contractValue') ?? '').trim();
  const valor = bruto === '' ? null : parseDecimalBR(bruto);
  if (valor !== null && !/^\d+(\.\d{1,2})?$/.test(valor)) {
    return { error: 'Valor inválido.' };
  }

  const result = await projects.setProjectValue(user, projectId, valor);
  if ('error' in result) return { error: result.error };

  revalidatePath(`/projetos/${projectId}`);
  return { info: 'Valor do projeto atualizado.' };
}

/** Equipe do cartão — salva na hora, sem abrir o formulário de edição. */
export async function setProjectMembersAction(
  projectId: string, memberIds: string[],
): Promise<ActionState> {
  const user = await requirePermission('project:write');
  const result = await projects.setProjectMembers(user, projectId, memberIds);
  if ('error' in result) return { error: result.error };

  revalidatePath(`/projetos/${projectId}`);
  revalidatePath('/projetos');
  return { info: 'Equipe atualizada.' };
}

export async function setProjectStatusAction(projectId: string, status: string): Promise<ActionState> {
  const user = await requirePermission('project:write');
  const result = await projects.setProjectStatus(user, projectId, status as never);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/projetos/${projectId}`);
  return { info: 'Status atualizado.' };
}

export async function createStageAction(projectId: string, name: string): Promise<ActionState> {
  const user = await requirePermission('project:write');
  if (!name.trim()) return { error: 'Informe o nome da etapa.' };
  const result = await projects.createStage(user, projectId, name.trim());
  if ('error' in result) return { error: result.error };
  revalidatePath(`/projetos/${projectId}`);
  return { info: 'Etapa criada.' };
}

export async function setStageStatusAction(projectId: string, stageId: string, status: string): Promise<ActionState> {
  const user = await requirePermission('project:write');
  const result = await projects.setStageStatus(user, stageId, status as never);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/projetos/${projectId}`);
  return { info: 'Etapa atualizada.' };
}

const taskSchema = z.object({
  title: z.string().trim().min(2, 'Informe o título da tarefa.'),
  description: optional,
  stageId: optional,
  assigneeId: optional,
  priority: z.string().default('MEDIA'),
  dueAt: optional,
  estimatedHours: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? parseDecimalBR(v) : null),
    z.string().nullable().optional(),
  ),
});

export async function createTaskAction(
  projectId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('task:write');
  const parsed = taskSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await projects.createTask(user, projectId, parsed.data);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/projetos/${projectId}`);
  return { info: 'Tarefa criada.' };
}

export async function updateTaskAction(
  taskId: string, projectId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('task:write');
  const parsed = taskSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await projects.updateTask(user, taskId, parsed.data);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/projetos/${projectId}`);
  return { info: 'Tarefa atualizada.' };
}

export async function setTaskStatusAction(taskId: string, projectId: string, status: string): Promise<ActionState> {
  const user = await requirePermission('task:write');
  const result = await projects.setTaskStatus(user, taskId, status as never);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/projetos/${projectId}`);
  return { info: 'Tarefa movida.' };
}

export async function deleteTaskAction(taskId: string, projectId: string): Promise<ActionState> {
  const user = await requirePermission('task:write');
  const result = await projects.deleteTask(user, taskId);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/projetos/${projectId}`);
  return { info: 'Tarefa removida.' };
}

const deliverableSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do entregável.'),
  discipline: optional,
  stageId: optional,
  responsibleId: optional,
  dueAt: optional,
});

export async function createDeliverableAction(
  projectId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('deliverable:write');
  const parsed = deliverableSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await projects.createDeliverable(user, projectId, parsed.data);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/projetos/${projectId}`);
  return { info: 'Entregável criado.' };
}

export async function issueRevisionAction(
  deliverableId: string, projectId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('deliverable:write');
  const reason = String(formData.get('reason') ?? '').trim() || null;
  const changes = String(formData.get('changes') ?? '').trim() || null;

  const result = await projects.issueRevision(user, deliverableId, { reason, changes });
  if ('error' in result) return { error: result.error };
  revalidatePath(`/projetos/${projectId}`);
  return { info: `Revisão ${result.revision.revisionCode} emitida.` };
}

export async function setDeliverableStatusAction(
  deliverableId: string, projectId: string, status: 'APROVADO' | 'REPROVADO',
): Promise<ActionState> {
  const user = await requirePermission('deliverable:write');
  const result = await projects.setDeliverableStatus(user, deliverableId, status);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/projetos/${projectId}`);
  return { info: status === 'APROVADO' ? 'Entregável aprovado.' : 'Entregável reprovado.' };
}

const timeEntrySchema = z.object({
  taskId: optional,
  workDate: z.string().min(1, 'Informe a data.'),
  hours: z.string().refine((v) => /^\d+(\.\d+)?$/.test(parseDecimalBR(v)), 'Horas inválidas.'),
  description: optional,
  billable: z.preprocess((v) => v === 'on' || v === 'true', z.boolean()),
});

export async function createTimeEntryAction(
  projectId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('timeentry:write');
  const parsed = timeEntrySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await projects.createTimeEntry(user, projectId, {
    ...parsed.data,
    hours: parseDecimalBR(parsed.data.hours) as string,
  });
  if ('error' in result) return { error: result.error };
  revalidatePath(`/projetos/${projectId}`);
  return { info: 'Horas registradas.' };
}

export async function approveTimeEntryAction(entryId: string, projectId: string): Promise<ActionState> {
  const user = await requirePermission('timeentry:approve');
  const result = await projects.approveTimeEntry(user, entryId);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/projetos/${projectId}`);
  return { info: 'Apontamento aprovado.' };
}
