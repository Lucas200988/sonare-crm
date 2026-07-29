import 'server-only';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { nextCode } from '@/server/services/sequence';
import type { Prisma, ProjectStatus, StageStatus, TaskStatus } from '@/generated/prisma/client';
import type { SessionUser } from '@/server/auth/session';
import { parseDateInput } from '@/lib/dates';

// ---------- Listagem ----------

export type ProjectListFilter = {
  search?: string;
  status?: ProjectStatus | 'ATIVOS' | 'TODOS' | 'ARQUIVADOS';
  clientId?: string;
  page?: number;
};

export async function listProjects(user: SessionUser, filter: ProjectListFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = 20;

  const where: Prisma.ProjectWhereInput = { companyId: user.companyId, deletedAt: null };
  // Arquivados só aparecem quando pedidos explicitamente
  where.archivedAt = filter.status === 'ARQUIVADOS' ? { not: null } : null;
  if (filter.clientId) where.clientId = filter.clientId;
  if (filter.status && !['TODOS', 'ARQUIVADOS'].includes(filter.status)) {
    where.status = filter.status === 'ATIVOS'
      ? { notIn: ['CONCLUIDO', 'ENCERRADO', 'CANCELADO'] }
      : (filter.status as ProjectStatus);
  }
  if (filter.search) {
    where.OR = [
      { code: { contains: filter.search, mode: 'insensitive' } },
      { name: { contains: filter.search, mode: 'insensitive' } },
      { client: { legalName: { contains: filter.search, mode: 'insensitive' } } },
    ];
  }

  const [total, items] = await prisma.$transaction([
    prisma.project.count({ where }),
    prisma.project.findMany({
      where,
      include: {
        client: { select: { id: true, legalName: true, tradeName: true } },
        clientUnit: { select: { name: true } },
        technicalLead: { select: { name: true } },
        coordinator: { select: { name: true } },
        _count: { select: { tasks: true, deliverables: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getProject(user: SessionUser, id: string) {
  return prisma.project.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
    include: {
      client: true,
      clientUnit: true,
      contract: { select: { id: true, code: true, subject: true } },
      budget: { select: { id: true, code: true } },
      technicalLead: { select: { id: true, name: true } },
      coordinator: { select: { id: true, name: true } },
      members: { include: { user: { select: { id: true, name: true } } } },
      stages: { orderBy: { sortOrder: 'asc' } },
      tasks: {
        where: { deletedAt: null },
        include: {
          assignee: { select: { id: true, name: true } },
          checklist: { orderBy: { sortOrder: 'asc' } },
        },
        orderBy: { boardPosition: 'asc' },
      },
      deliverables: {
        where: { deletedAt: null },
        include: { revisions: { orderBy: { createdAt: 'desc' } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
}

/** Usuários disponíveis para compor a equipe (todos ativos da empresa). */
export async function listAssignableUsers(user: SessionUser) {
  return prisma.user.findMany({
    where: { companyId: user.companyId, active: true, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

/** Projetos do quadro — arquivados ficam de fora (sem paginação: o quadro mostra tudo). */
export async function listBoardProjects(user: SessionUser) {
  return prisma.project.findMany({
    where: { companyId: user.companyId, deletedAt: null, archivedAt: null },
    include: {
      client: { select: { id: true, legalName: true, tradeName: true } },
      technicalLead: { select: { id: true, name: true } },
      members: { include: { user: { select: { id: true, name: true } } } },
      _count: { select: { tasks: true, deliverables: true } },
    },
    orderBy: { boardPosition: 'asc' },
  });
}

// ---------- Conversão contrato → projeto ----------

const DEFAULT_STAGES = ['Levantamento', 'Desenvolvimento', 'Revisão interna', 'Entrega ao cliente'];

/** Cria projeto avulso, sem contrato — para demandas internas ou serviços sem instrumento. */
export async function createProject(
  user: SessionUser,
  input: {
    name: string; clientId: string; clientUnitId?: string | null;
    contractualDeadline?: string | null; priority: string; folderPath?: string | null;
  },
) {
  const client = await prisma.client.findFirst({
    where: { id: input.clientId, companyId: user.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!client) return { error: 'Cliente não encontrado.' };

  const project = await prisma.$transaction(async (tx) => {
    const code = await nextCode(user.companyId, 'PRJ', tx);
    const count = await tx.project.count({ where: { companyId: user.companyId, deletedAt: null } });
    return tx.project.create({
      data: {
        companyId: user.companyId,
        code,
        name: input.name,
        clientId: input.clientId,
        clientUnitId: input.clientUnitId || null,
        contractualDeadline: parseDateInput(input.contractualDeadline),
        priority: input.priority as never,
        folderPath: input.folderPath?.trim() || null,
        boardPosition: count,
        createdById: user.id,
        stages: { create: DEFAULT_STAGES.map((name, i) => ({ name, sortOrder: i })) },
      },
    });
  });

  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'create',
    entityType: 'project', entityId: project.id, after: { code: project.code },
  });

  return { project };
}

/**
 * Cria o projeto a partir de um contrato assinado/vigente, herdando cliente,
 * objeto (como nome) e valor — sem redigitação.
 */
export async function createProjectFromContract(user: SessionUser, contractId: string) {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, companyId: user.companyId, deletedAt: null },
  });
  if (!contract) return { error: 'Contrato não encontrado.' };
  if (!['ASSINADO', 'VIGENTE'].includes(contract.status)) {
    return { error: 'Só é possível criar projeto a partir de um contrato assinado ou vigente.' };
  }
  const jaExiste = await prisma.project.findFirst({
    where: { contractId, deletedAt: null },
    select: { id: true },
  });
  if (jaExiste) return { error: 'Este contrato já possui um projeto vinculado.' };

  const project = await prisma.$transaction(async (tx) => {
    const code = await nextCode(user.companyId, 'PRJ', tx);
    return tx.project.create({
      data: {
        companyId: user.companyId,
        code,
        name: contract.subject,
        clientId: contract.clientId,
        clientUnitId: contract.clientUnitId,
        contractId: contract.id,
        budgetId: contract.budgetId,
        startDate: contract.startDate,
        contractualDeadline: contract.endDate,
        contractValue: contract.totalValue,
        createdById: user.id,
        stages: {
          create: DEFAULT_STAGES.map((name, i) => ({ name, sortOrder: i })),
        },
      },
    });
  });

  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'create',
    entityType: 'project', entityId: project.id, after: { code: project.code, contractId },
  });

  return { project };
}

// ---------- Edição ----------

export type ProjectInput = {
  name: string;
  clientUnitId?: string | null;
  technicalLeadId?: string | null;
  coordinatorId?: string | null;
  disciplines: string[];
  startDate?: string | null;
  contractualDeadline?: string | null;
  expectedEndDate?: string | null;
  priority: string;
  folderPath?: string | null;
  risks?: string | null;
  notes?: string | null;
  memberIds: string[];
};

export async function updateProject(user: SessionUser, id: string, input: ProjectInput) {
  const project = await prisma.project.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
  if (!project) return { error: 'Projeto não encontrado.' };

  await prisma.$transaction([
    prisma.project.update({
      where: { id },
      data: {
        name: input.name,
        clientUnitId: input.clientUnitId || null,
        technicalLeadId: input.technicalLeadId || null,
        coordinatorId: input.coordinatorId || null,
        disciplines: input.disciplines,
        startDate: parseDateInput(input.startDate),
        contractualDeadline: parseDateInput(input.contractualDeadline),
        expectedEndDate: parseDateInput(input.expectedEndDate),
        priority: input.priority as never,
        folderPath: input.folderPath?.trim() || null,
        risks: input.risks || null,
        notes: input.notes || null,
        updatedById: user.id,
      },
    }),
    prisma.projectMember.deleteMany({ where: { projectId: id } }),
    ...(input.memberIds.length
      ? [prisma.projectMember.createMany({
          data: input.memberIds.map((userId) => ({ projectId: id, userId })),
          skipDuplicates: true,
        })]
      : []),
  ]);

  return { ok: true };
}

/** Move o cartão do projeto para outra coluna do quadro, reposicionando os vizinhos. */
export async function moveProjectOnBoard(
  user: SessionUser, id: string, status: ProjectStatus, position: number,
) {
  const project = await prisma.project.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
  });
  if (!project) return { error: 'Projeto não encontrado.' };

  await prisma.$transaction(async (tx) => {
    // Abre espaço na coluna de destino
    await tx.project.updateMany({
      where: {
        companyId: user.companyId, deletedAt: null, status,
        boardPosition: { gte: position }, id: { not: id },
      },
      data: { boardPosition: { increment: 1 } },
    });
    const data: Prisma.ProjectUpdateInput = { status, boardPosition: position, updatedById: user.id };
    if (status === 'CONCLUIDO' || status === 'ENCERRADO') data.actualEndDate = new Date();
    await tx.project.update({ where: { id }, data });
  });

  if (project.status !== status) {
    await auditLog({
      companyId: user.companyId, userId: user.id, action: 'status_change',
      entityType: 'project', entityId: id, before: { status: project.status }, after: { status },
    });
  }
  return { ok: true };
}

/**
 * Cartões arquivados, do mais recente para o mais antigo.
 *
 * Arquivar tira do quadro sem apagar nada; esta consulta é o caminho de volta.
 * A busca cobre código, nome e cliente porque é assim que alguém procura um
 * projeto antigo — raramente pelo código.
 */
export async function listArchivedProjects(user: SessionUser, search?: string) {
  const where: Prisma.ProjectWhereInput = {
    companyId: user.companyId,
    deletedAt: null,
    archivedAt: { not: null },
  };
  if (search) {
    where.OR = [
      { code: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
      { client: { legalName: { contains: search, mode: 'insensitive' } } },
      { client: { tradeName: { contains: search, mode: 'insensitive' } } },
    ];
  }

  return prisma.project.findMany({
    where,
    include: {
      client: { select: { id: true, legalName: true, tradeName: true } },
      technicalLead: { select: { name: true } },
      _count: { select: { tasks: true, deliverables: true } },
    },
    orderBy: { archivedAt: 'desc' },
    take: 200,
  });
}

/** Arquiva ou desarquiva o cartão — sai do quadro sem perder o histórico. */
export async function setProjectArchived(user: SessionUser, id: string, archived: boolean) {
  const project = await prisma.project.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!project) return { error: 'Projeto não encontrado.' };

  await prisma.project.update({
    where: { id },
    data: { archivedAt: archived ? new Date() : null, updatedById: user.id },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: archived ? 'archive' : 'unarchive',
    entityType: 'project', entityId: id,
  });
  return { ok: true };
}

// ---------- Comentários e anexos do cartão ----------

export async function listProjectComments(user: SessionUser, projectId: string) {
  return prisma.comment.findMany({
    where: { companyId: user.companyId, entityType: 'project', entityId: projectId, deletedAt: null },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function addProjectComment(user: SessionUser, projectId: string, body: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId: user.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!project) return { error: 'Projeto não encontrado.' };

  const comment = await prisma.comment.create({
    data: { companyId: user.companyId, entityType: 'project', entityId: projectId, authorId: user.id, body },
  });
  return { comment };
}

export async function listProjectAttachments(user: SessionUser, projectId: string) {
  return prisma.attachment.findMany({
    where: { companyId: user.companyId, entityType: 'project', entityId: projectId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
}

export async function setProjectStatus(user: SessionUser, id: string, status: ProjectStatus) {
  const project = await prisma.project.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
  if (!project) return { error: 'Projeto não encontrado.' };

  const data: Prisma.ProjectUpdateInput = { status, updatedById: user.id };
  if (status === 'CONCLUIDO' || status === 'ENCERRADO') data.actualEndDate = new Date();

  await prisma.project.update({ where: { id }, data });
  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'status_change',
    entityType: 'project', entityId: id, before: { status: project.status }, after: { status },
  });
  return { ok: true };
}

// ---------- Etapas ----------

export async function createStage(user: SessionUser, projectId: string, name: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId, deletedAt: null } });
  if (!project) return { error: 'Projeto não encontrado.' };

  const count = await prisma.projectStage.count({ where: { projectId } });
  const stage = await prisma.projectStage.create({
    data: { projectId, name, sortOrder: count },
  });
  return { stage };
}

export async function setStageStatus(user: SessionUser, stageId: string, status: StageStatus) {
  const stage = await prisma.projectStage.findFirst({
    where: { id: stageId, project: { companyId: user.companyId, deletedAt: null } },
  });
  if (!stage) return { error: 'Etapa não encontrada.' };

  const data: Prisma.ProjectStageUpdateInput = { status };
  if (status === 'EM_ANDAMENTO' && !stage.startedAt) data.startedAt = new Date();
  if (status === 'CONCLUIDA') data.completedAt = new Date();

  await prisma.projectStage.update({ where: { id: stageId }, data });
  return { ok: true };
}

// ---------- Tarefas (quadro Kanban) ----------

export type TaskInput = {
  title: string;
  description?: string | null;
  stageId?: string | null;
  assigneeId?: string | null;
  priority: string;
  dueAt?: string | null;
  estimatedHours?: string | null;
};

export async function createTask(user: SessionUser, projectId: string, input: TaskInput) {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId, deletedAt: null } });
  if (!project) return { error: 'Projeto não encontrado.' };

  const count = await prisma.task.count({ where: { projectId, deletedAt: null } });
  const task = await prisma.task.create({
    data: {
      companyId: user.companyId,
      projectId,
      stageId: input.stageId || null,
      title: input.title,
      description: input.description || null,
      assigneeId: input.assigneeId || null,
      priority: input.priority as never,
      dueAt: parseDateInput(input.dueAt),
      estimatedHours: input.estimatedHours || null,
      boardPosition: count,
      createdById: user.id,
    },
  });
  return { task };
}

export async function setTaskStatus(user: SessionUser, taskId: string, status: TaskStatus) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, companyId: user.companyId, deletedAt: null },
  });
  if (!task) return { error: 'Tarefa não encontrada.' };

  const data: Prisma.TaskUpdateInput = { status, updatedById: user.id };
  if (status === 'CONCLUIDA') data.completedAt = new Date();

  await prisma.task.update({ where: { id: taskId }, data });
  return { ok: true };
}

export async function updateTask(user: SessionUser, taskId: string, input: TaskInput) {
  const task = await prisma.task.findFirst({ where: { id: taskId, companyId: user.companyId, deletedAt: null } });
  if (!task) return { error: 'Tarefa não encontrada.' };

  await prisma.task.update({
    where: { id: taskId },
    data: {
      title: input.title,
      description: input.description || null,
      stageId: input.stageId || null,
      assigneeId: input.assigneeId || null,
      priority: input.priority as never,
      dueAt: parseDateInput(input.dueAt),
      estimatedHours: input.estimatedHours || null,
      updatedById: user.id,
    },
  });
  return { ok: true };
}

export async function deleteTask(user: SessionUser, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, companyId: user.companyId, deletedAt: null } });
  if (!task) return { error: 'Tarefa não encontrada.' };
  await prisma.task.update({ where: { id: taskId }, data: { deletedAt: new Date() } });
  return { ok: true };
}

// ---------- Entregáveis e revisões ----------

export type DeliverableInput = {
  name: string;
  discipline?: string | null;
  stageId?: string | null;
  responsibleId?: string | null;
  dueAt?: string | null;
};

export async function createDeliverable(user: SessionUser, projectId: string, input: DeliverableInput) {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId, deletedAt: null } });
  if (!project) return { error: 'Projeto não encontrado.' };

  const deliverable = await prisma.deliverable.create({
    data: {
      projectId,
      name: input.name,
      discipline: input.discipline || null,
      stageId: input.stageId || null,
      responsibleId: input.responsibleId || null,
      dueAt: parseDateInput(input.dueAt),
    },
  });
  return { deliverable };
}

/** Emite uma nova revisão (R00, R01…), incrementando a partir da última existente. */
export async function issueRevision(
  user: SessionUser,
  deliverableId: string,
  input: { reason?: string | null; changes?: string | null },
) {
  const deliverable = await prisma.deliverable.findFirst({
    where: { id: deliverableId, project: { companyId: user.companyId, deletedAt: null } },
    include: { revisions: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!deliverable) return { error: 'Entregável não encontrado.' };

  const last = deliverable.revisions[0];
  const nextNumber = last ? Number(last.revisionCode.replace('R', '')) + 1 : 0;
  const revisionCode = `R${String(nextNumber).padStart(2, '0')}`;

  const revision = await prisma.$transaction(async (tx) => {
    const rev = await tx.deliverableRevision.create({
      data: {
        deliverableId,
        revisionCode,
        responsibleId: deliverable.responsibleId,
        reason: input.reason || null,
        changes: input.changes || null,
        status: 'EMITIDA',
        createdById: user.id,
      },
    });
    await tx.deliverable.update({
      where: { id: deliverableId },
      data: { currentRevision: revisionCode, status: 'EMITIDO', issuedAt: new Date() },
    });
    return rev;
  });

  return { revision };
}

export async function setDeliverableStatus(
  user: SessionUser, deliverableId: string, status: 'APROVADO' | 'REPROVADO',
) {
  const deliverable = await prisma.deliverable.findFirst({
    where: { id: deliverableId, project: { companyId: user.companyId, deletedAt: null } },
  });
  if (!deliverable) return { error: 'Entregável não encontrado.' };

  await prisma.deliverable.update({
    where: { id: deliverableId },
    data: { status, approvedAt: status === 'APROVADO' ? new Date() : null },
  });
  return { ok: true };
}

// ---------- Apontamento de horas ----------

export type TimeEntryInput = {
  taskId?: string | null;
  workDate: string;
  hours: string;
  description?: string | null;
  billable: boolean;
};

export async function createTimeEntry(user: SessionUser, projectId: string, input: TimeEntryInput) {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId, deletedAt: null } });
  if (!project) return { error: 'Projeto não encontrado.' };

  const requester = await prisma.user.findUnique({
    where: { id: user.id },
    select: { hourlyCost: true, hourlyRate: true },
  });

  const entry = await prisma.timeEntry.create({
    data: {
      companyId: user.companyId,
      userId: user.id,
      projectId,
      taskId: input.taskId || null,
      workDate: parseDateInput(input.workDate) ?? new Date(),
      hours: input.hours,
      description: input.description || null,
      billable: input.billable,
      hourlyCost: requester?.hourlyCost ?? null,
      hourlyRate: requester?.hourlyRate ?? null,
    },
  });
  return { entry };
}

export async function listTimeEntries(user: SessionUser, projectId: string) {
  return prisma.timeEntry.findMany({
    where: { projectId, companyId: user.companyId, deletedAt: null },
    include: { user: { select: { name: true } }, task: { select: { title: true } } },
    orderBy: { workDate: 'desc' },
  });
}

export async function approveTimeEntry(user: SessionUser, entryId: string) {
  const entry = await prisma.timeEntry.findFirst({ where: { id: entryId, companyId: user.companyId, deletedAt: null } });
  if (!entry) return { error: 'Apontamento não encontrado.' };
  await prisma.timeEntry.update({
    where: { id: entryId },
    data: { approvedAt: new Date(), approvedById: user.id },
  });
  return { ok: true };
}
