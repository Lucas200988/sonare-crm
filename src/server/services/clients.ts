import 'server-only';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { isValidCNPJ, isValidCPF, onlyDigits } from '@/lib/br';
import type { Prisma, PersonType, ClientStatus } from '@/generated/prisma/client';
import type { SessionUser } from '@/server/auth/session';

export type ClientListParams = {
  search?: string;
  status?: ClientStatus | 'TODOS';
  personType?: PersonType | 'TODOS';
  leadSourceId?: string;
  page?: number;
  pageSize?: number;
};

export async function listClients(user: SessionUser, params: ClientListParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 20);

  const where: Prisma.ClientWhereInput = {
    companyId: user.companyId,
    deletedAt: null,
  };
  if (params.status && params.status !== 'TODOS') where.status = params.status;
  if (params.personType && params.personType !== 'TODOS') where.personType = params.personType;
  if (params.leadSourceId) where.leadSourceId = params.leadSourceId;
  if (params.search) {
    const s = params.search.trim();
    const digits = onlyDigits(s);
    where.OR = [
      { legalName: { contains: s, mode: 'insensitive' } },
      { tradeName: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
      ...(digits.length >= 4 ? [{ cnpj: { contains: digits } }, { cpf: { contains: digits } }, { phone: { contains: digits } }] : []),
    ];
  }

  const [total, items] = await prisma.$transaction([
    prisma.client.count({ where }),
    prisma.client.findMany({
      where,
      include: {
        leadSource: true,
        commercialOwner: { select: { id: true, name: true } },
        _count: { select: { opportunities: true, contracts: true, projects: true } },
      },
      orderBy: { legalName: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/**
 * Opções de cliente para seletores com busca (orçamento, oportunidade).
 * Sem termo de busca devolve os mais recentes; com termo, filtra por nome,
 * documento, e-mail ou telefone. Traz junto unidades, contatos e oportunidades
 * abertas para preencher os campos dependentes sem nova consulta.
 */
export async function searchClientOptions(user: SessionUser, query: string, take = 30) {
  const where: Prisma.ClientWhereInput = {
    companyId: user.companyId,
    deletedAt: null,
    status: { not: 'BLOQUEADO' },
  };
  const s = query.trim();
  if (s.length >= 2) {
    const digits = onlyDigits(s);
    where.OR = [
      { legalName: { contains: s, mode: 'insensitive' } },
      { tradeName: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
      ...(digits.length >= 3
        ? [{ cnpj: { contains: digits } }, { cpf: { contains: digits } }, { phone: { contains: digits } }]
        : []),
    ];
  }

  const found = await prisma.client.findMany({
    where,
    select: {
      id: true, legalName: true, tradeName: true, cnpj: true, cpf: true, city: true, state: true,
      units: { where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } },
      contacts: { where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } },
      opportunities: {
        where: { deletedAt: null, closedAt: null },
        select: { id: true, code: true, title: true },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: s.length >= 2 ? { legalName: 'asc' } : { createdAt: 'desc' },
    take,
  });

  return found.map(({ cnpj, cpf, ...c }) => ({ ...c, document: cnpj ?? cpf ?? null }));
}

/** Uma opção específica, para pré-selecionar o cliente vindo por link. */
export async function getClientOption(user: SessionUser, id: string) {
  const c = await prisma.client.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
    select: {
      id: true, legalName: true, tradeName: true, cnpj: true, cpf: true, city: true, state: true,
      units: { where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } },
      contacts: { where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } },
      opportunities: {
        where: { deletedAt: null, closedAt: null },
        select: { id: true, code: true, title: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!c) return null;
  const { cnpj, cpf, ...rest } = c;
  return { ...rest, document: cnpj ?? cpf ?? null };
}

export async function getClient(user: SessionUser, id: string) {
  return prisma.client.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
    include: {
      leadSource: true,
      commercialOwner: { select: { id: true, name: true } },
      contacts: { where: { deletedAt: null }, orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] },
      units: { where: { deletedAt: null }, orderBy: { name: 'asc' } },
      opportunities: {
        where: { deletedAt: null },
        include: { stage: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
      contracts: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 10 },
      projects: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });
}

export type ClientInput = {
  personType: PersonType;
  legalName: string;
  tradeName?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
  stateRegistration?: string | null;
  cityRegistration?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  addressDistrict?: string | null;
  zipCode?: string | null;
  city?: string | null;
  state?: string | null;
  notes?: string | null;
  status?: ClientStatus;
  leadSourceId?: string | null;
  segment?: string | null;
  commercialOwnerId?: string | null;
  tags?: string[];
};

/** Valida documento e checa duplicidade entre clientes não excluídos. Retorna mensagem de erro ou null. */
async function validateDocuments(
  companyId: string, input: ClientInput, excludeId?: string,
): Promise<string | null> {
  if (input.personType === 'FISICA') {
    if (input.cpf) {
      if (!isValidCPF(input.cpf)) return 'CPF inválido.';
      const dup = await prisma.client.findFirst({
        where: { companyId, cpf: onlyDigits(input.cpf), deletedAt: null, NOT: excludeId ? { id: excludeId } : undefined },
        select: { legalName: true },
      });
      if (dup) return `CPF já cadastrado para o cliente "${dup.legalName}".`;
    }
  } else if (input.cnpj) {
    if (!isValidCNPJ(input.cnpj)) return 'CNPJ inválido.';
    const dup = await prisma.client.findFirst({
      where: { companyId, cnpj: onlyDigits(input.cnpj), deletedAt: null, NOT: excludeId ? { id: excludeId } : undefined },
      select: { legalName: true },
    });
    if (dup) return `CNPJ já cadastrado para o cliente "${dup.legalName}".`;
  }
  return null;
}

function normalizeClientData(input: ClientInput) {
  return {
    ...input,
    cpf: input.personType === 'FISICA' && input.cpf ? onlyDigits(input.cpf) : null,
    cnpj: input.personType === 'JURIDICA' && input.cnpj ? onlyDigits(input.cnpj) : null,
    zipCode: input.zipCode ? onlyDigits(input.zipCode) : null,
    tags: input.tags ?? [],
  };
}

export async function createClient(user: SessionUser, input: ClientInput) {
  const docError = await validateDocuments(user.companyId, input);
  if (docError) return { error: docError };

  const client = await prisma.client.create({
    data: {
      ...normalizeClientData(input),
      companyId: user.companyId,
      createdById: user.id,
      firstContactAt: new Date(),
    },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'create', entityType: 'client', entityId: client.id, after: client,
  });
  return { client };
}

export async function updateClient(user: SessionUser, id: string, input: ClientInput) {
  const before = await prisma.client.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
  if (!before) return { error: 'Cliente não encontrado.' };

  const docError = await validateDocuments(user.companyId, input, id);
  if (docError) return { error: docError };

  const client = await prisma.client.update({
    where: { id },
    data: { ...normalizeClientData(input), updatedById: user.id },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'update', entityType: 'client', entityId: id, before, after: client,
  });
  return { client };
}

export async function softDeleteClient(user: SessionUser, id: string) {
  const before = await prisma.client.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
    include: { _count: { select: { contracts: true, projects: true } } },
  });
  if (!before) return { error: 'Cliente não encontrado.' };
  if (before._count.contracts > 0 || before._count.projects > 0) {
    return { error: 'Cliente possui contratos ou projetos vinculados. Inative-o em vez de excluir.' };
  }
  await prisma.client.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'delete', entityType: 'client', entityId: id, before,
  });
  return { ok: true };
}

// ---------- Contatos ----------

export type ContactInput = {
  name: string;
  position?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  department?: string | null;
  decisionMaker?: boolean;
  isPrimary?: boolean;
  isFinancial?: boolean;
  isTechnical?: boolean;
  isContractual?: boolean;
  notes?: string | null;
};

export async function upsertContact(user: SessionUser, clientId: string, input: ContactInput, contactId?: string) {
  const client = await prisma.client.findFirst({ where: { id: clientId, companyId: user.companyId, deletedAt: null } });
  if (!client) return { error: 'Cliente não encontrado.' };

  if (input.isPrimary) {
    await prisma.clientContact.updateMany({
      where: { clientId, isPrimary: true, NOT: contactId ? { id: contactId } : undefined },
      data: { isPrimary: false },
    });
  }

  const contact = contactId
    ? await prisma.clientContact.update({ where: { id: contactId }, data: input })
    : await prisma.clientContact.create({ data: { ...input, clientId } });

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: contactId ? 'update' : 'create', entityType: 'client_contact', entityId: contact.id, after: contact,
  });
  return { contact };
}

export async function deleteContact(user: SessionUser, contactId: string) {
  const contact = await prisma.clientContact.findFirst({
    where: { id: contactId, client: { companyId: user.companyId } },
  });
  if (!contact) return { error: 'Contato não encontrado.' };
  await prisma.clientContact.update({ where: { id: contactId }, data: { deletedAt: new Date() } });
  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'delete', entityType: 'client_contact', entityId: contactId, before: contact,
  });
  return { ok: true };
}

// ---------- Unidades / obras ----------

export type UnitInput = {
  name: string;
  unitType?: string | null;
  consumerUnit?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressDistrict?: string | null;
  zipCode?: string | null;
  city?: string | null;
  state?: string | null;
  notes?: string | null;
};

export async function upsertUnit(user: SessionUser, clientId: string, input: UnitInput, unitId?: string) {
  const client = await prisma.client.findFirst({ where: { id: clientId, companyId: user.companyId, deletedAt: null } });
  if (!client) return { error: 'Cliente não encontrado.' };

  const data = { ...input, zipCode: input.zipCode ? onlyDigits(input.zipCode) : null };
  const unit = unitId
    ? await prisma.clientUnit.update({ where: { id: unitId }, data })
    : await prisma.clientUnit.create({ data: { ...data, clientId } });

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: unitId ? 'update' : 'create', entityType: 'client_unit', entityId: unit.id, after: unit,
  });
  return { unit };
}

export async function deleteUnit(user: SessionUser, unitId: string) {
  const unit = await prisma.clientUnit.findFirst({
    where: { id: unitId, client: { companyId: user.companyId } },
  });
  if (!unit) return { error: 'Unidade não encontrada.' };
  await prisma.clientUnit.update({ where: { id: unitId }, data: { deletedAt: new Date() } });
  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'delete', entityType: 'client_unit', entityId: unitId, before: unit,
  });
  return { ok: true };
}
