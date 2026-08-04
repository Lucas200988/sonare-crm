import 'server-only';
import { escopoDeProjetos } from '@/server/auth/project-scope';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { parseDateInput } from '@/lib/dates';
import type { Prisma, TechRespStatus } from '@/generated/prisma/client';
import type { SessionUser } from '@/server/auth/session';

/**
 * Responsabilidade técnica (ART do CREA, RRT do CAU, TRT dos técnicos).
 *
 * O registro é feito no portal do conselho; aqui fica o controle: qual
 * documento cobre qual projeto, quem é o profissional e o que falta baixar.
 * Sem isso, a empresa descobre uma ART pendente só na fiscalização.
 */

export type TechRespFilter = {
  search?: string;
  status?: TechRespStatus | 'PENDENTES' | 'TODOS';
  projectId?: string;
  page?: number;
};

export async function listTechResps(user: SessionUser, filter: TechRespFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = 30;
  const where: Prisma.TechnicalResponsibilityWhereInput = {
    companyId: user.companyId, deletedAt: null,
    // ART pertence ao projeto: quem não vê o cartão não vê a ART dele
    project: { companyId: user.companyId, deletedAt: null, ...escopoDeProjetos(user) },
  };

  if (filter.projectId) where.projectId = filter.projectId;
  if (filter.status === 'PENDENTES') where.status = { in: ['PENDENTE', 'EMITIDA'] };
  else if (filter.status && filter.status !== 'TODOS') where.status = filter.status;

  if (filter.search) {
    where.OR = [
      { number: { contains: filter.search, mode: 'insensitive' } },
      { professionalName: { contains: filter.search, mode: 'insensitive' } },
      { serviceDescription: { contains: filter.search, mode: 'insensitive' } },
      { project: { name: { contains: filter.search, mode: 'insensitive' } } },
    ];
  }

  const [total, items, soma] = await prisma.$transaction([
    prisma.technicalResponsibility.count({ where }),
    prisma.technicalResponsibility.findMany({
      where,
      include: {
        project: { select: { id: true, code: true, name: true } },
        professional: { select: { id: true, name: true } },
      },
      orderBy: [{ status: 'asc' }, { issuedAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.technicalResponsibility.aggregate({ where, _sum: { value: true } }),
  ]);

  return {
    items, total, page, pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    somaValor: soma._sum.value?.toString() ?? '0',
  };
}

export type TechRespInput = {
  number: string;
  docType: string;
  council?: string | null;
  professionalId?: string | null;
  professionalName?: string | null;
  registration?: string | null;
  projectId?: string | null;
  issuedAt?: string | null;
  value?: string | null;
  serviceDescription?: string | null;
  notes?: string | null;
};

export async function createTechResp(user: SessionUser, input: TechRespInput) {
  const duplicada = await prisma.technicalResponsibility.findFirst({
    where: {
      companyId: user.companyId, number: input.number,
      docType: input.docType, deletedAt: null,
    },
    select: { id: true },
  });
  if (duplicada) return { error: `A ${input.docType} nº ${input.number} já está cadastrada.` };

  // Quando o profissional é do time, o nome e o registro vêm do cadastro dele
  let nome = input.professionalName?.trim() || null;
  let registro = input.registration?.trim() || null;
  if (input.professionalId) {
    const profissional = await prisma.user.findFirst({
      where: { id: input.professionalId, companyId: user.companyId },
      select: { name: true, creaCau: true },
    });
    if (profissional) {
      nome = nome ?? profissional.name;
      registro = registro ?? profissional.creaCau;
    }
  }

  const emitida = parseDateInput(input.issuedAt ?? null);

  const registrada = await prisma.technicalResponsibility.create({
    data: {
      companyId: user.companyId,
      number: input.number.trim(),
      docType: input.docType,
      council: input.council?.trim() || null,
      professionalId: input.professionalId || null,
      professionalName: nome,
      registration: registro,
      projectId: input.projectId || null,
      issuedAt: emitida,
      value: input.value || null,
      serviceDescription: input.serviceDescription?.trim() || null,
      notes: input.notes?.trim() || null,
      // Com data de emissão informada, já nasce emitida
      status: emitida ? 'EMITIDA' : 'PENDENTE',
    },
  });

  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'create',
    entityType: 'technical_responsibility', entityId: registrada.id,
    after: { numero: registrada.number, tipo: registrada.docType },
  });
  return { techResp: registrada };
}

export async function updateTechResp(user: SessionUser, id: string, input: TechRespInput) {
  const existente = await prisma.technicalResponsibility.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
  });
  if (!existente) return { error: 'Registro não encontrado.' };

  await prisma.technicalResponsibility.update({
    where: { id },
    data: {
      number: input.number.trim(),
      docType: input.docType,
      council: input.council?.trim() || null,
      professionalId: input.professionalId || null,
      professionalName: input.professionalName?.trim() || null,
      registration: input.registration?.trim() || null,
      projectId: input.projectId || null,
      issuedAt: parseDateInput(input.issuedAt ?? null),
      value: input.value || null,
      serviceDescription: input.serviceDescription?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  });
  return { ok: true };
}

/** Baixa da ART: encerra a responsabilidade após a conclusão do serviço. */
export async function dischargeTechResp(user: SessionUser, id: string, dataBaixa: string) {
  const registro = await prisma.technicalResponsibility.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
  });
  if (!registro) return { error: 'Registro não encontrado.' };
  if (registro.status === 'BAIXADA') return { error: 'Esta ART já está baixada.' };
  if (registro.status === 'CANCELADA') return { error: 'Não é possível baixar uma ART cancelada.' };

  const data = parseDateInput(dataBaixa);
  if (!data) return { error: 'Informe a data da baixa.' };

  await prisma.technicalResponsibility.update({
    where: { id },
    data: { status: 'BAIXADA', dischargedAt: data },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'discharge',
    entityType: 'technical_responsibility', entityId: id,
  });
  return { ok: true };
}

export async function setTechRespStatus(user: SessionUser, id: string, status: TechRespStatus) {
  const registro = await prisma.technicalResponsibility.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
  });
  if (!registro) return { error: 'Registro não encontrado.' };

  await prisma.technicalResponsibility.update({
    where: { id },
    data: {
      status,
      dischargedAt: status === 'BAIXADA' ? registro.dischargedAt : null,
    },
  });
  return { ok: true };
}

export async function deleteTechResp(user: SessionUser, id: string) {
  const registro = await prisma.technicalResponsibility.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
  });
  if (!registro) return { error: 'Registro não encontrado.' };
  await prisma.technicalResponsibility.update({ where: { id }, data: { deletedAt: new Date() } });
  return { ok: true };
}

/** Projetos ativos sem nenhuma ART — o risco que ninguém percebe. */
export async function getProjectsWithoutTechResp(user: SessionUser) {
  return prisma.project.findMany({
    where: {
      companyId: user.companyId, deletedAt: null, archivedAt: null,
      ...escopoDeProjetos(user),
      status: { notIn: ['CANCELADO', 'ENCERRADO'] },
      technicalResponsibilities: { none: { deletedAt: null } },
    },
    select: { id: true, code: true, name: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
}
