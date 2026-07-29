import 'server-only';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { nextCode } from '@/server/services/sequence';
import { parseDateInput } from '@/lib/dates';
import type { Prisma, EquipmentMovementKind, EquipmentStatus } from '@/generated/prisma/client';
import type { SessionUser } from '@/server/auth/session';

/**
 * Controle de equipamentos: quem está com o quê, desde quando e para onde foi.
 *
 * O problema que isto resolve é o equipamento que sai para uma obra, é
 * emprestado a um terceiro e some do radar. Por isso a peça central não é o
 * cadastro, é a movimentação: cada saída fica aberta até alguém registrar a
 * devolução, e é essa saída em aberto que define o status do equipamento.
 */

export type EquipmentFilter = {
  search?: string;
  status?: EquipmentStatus | 'FORA' | 'TODOS';
};

/** Saída ainda não devolvida — quem está com o equipamento agora. */
const MOVIMENTO_ABERTO = {
  where: { returnedAt: null },
  orderBy: { checkedOutAt: 'desc' },
  take: 1,
  include: {
    project: { select: { id: true, code: true, name: true } },
    client: { select: { id: true, legalName: true, tradeName: true } },
    holderUser: { select: { id: true, name: true } },
  },
} as const;

export async function listEquipment(user: SessionUser, filter: EquipmentFilter = {}) {
  const where: Prisma.EquipmentWhereInput = { companyId: user.companyId, deletedAt: null };

  if (filter.status === 'FORA') where.status = 'EM_USO';
  else if (filter.status && filter.status !== 'TODOS') where.status = filter.status;

  if (filter.search) {
    where.OR = [
      { name: { contains: filter.search, mode: 'insensitive' } },
      { code: { contains: filter.search, mode: 'insensitive' } },
      { brand: { contains: filter.search, mode: 'insensitive' } },
      { model: { contains: filter.search, mode: 'insensitive' } },
      { serialNumber: { contains: filter.search, mode: 'insensitive' } },
    ];
  }

  const items = await prisma.equipment.findMany({
    where,
    include: { movements: MOVIMENTO_ABERTO },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  });

  const agora = new Date();
  return items.map((e) => {
    const aberto = e.movements[0] ?? null;
    return {
      ...e,
      movimentoAberto: aberto,
      // Passou da data combinada e ninguém devolveu: é o que precisa de cobrança.
      atrasado: Boolean(aberto?.expectedReturnAt && aberto.expectedReturnAt < agora),
      calibracaoVencida: Boolean(e.calibrationDueAt && e.calibrationDueAt < agora),
    };
  });
}

export async function getEquipment(user: SessionUser, id: string) {
  return prisma.equipment.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
    include: {
      movements: {
        orderBy: { checkedOutAt: 'desc' },
        include: {
          project: { select: { id: true, code: true, name: true } },
          client: { select: { id: true, legalName: true, tradeName: true } },
          holderUser: { select: { id: true, name: true } },
        },
      },
    },
  });
}

// ---------- Cadastro ----------

export type EquipmentInput = {
  name: string;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  category?: string | null;
  homeLocation?: string | null;
  purchaseDate?: string | null;
  purchaseValue?: string | null;
  calibrationDueAt?: string | null;
  notes?: string | null;
};

export async function upsertEquipment(user: SessionUser, input: EquipmentInput, id?: string) {
  const data = {
    name: input.name,
    brand: input.brand || null,
    model: input.model || null,
    serialNumber: input.serialNumber || null,
    category: input.category || null,
    homeLocation: input.homeLocation || null,
    purchaseDate: parseDateInput(input.purchaseDate),
    purchaseValue: input.purchaseValue || null,
    calibrationDueAt: parseDateInput(input.calibrationDueAt),
    notes: input.notes || null,
  };

  if (id) {
    const atual = await prisma.equipment.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
    });
    if (!atual) return { error: 'Equipamento não encontrado.' };
    const equipment = await prisma.equipment.update({ where: { id }, data });
    await auditLog({
      companyId: user.companyId, userId: user.id,
      action: 'update', entityType: 'equipment', entityId: id, before: atual, after: equipment,
    });
    return { equipment };
  }

  const code = await nextCode(user.companyId, 'EQP');
  const equipment = await prisma.equipment.create({
    data: { ...data, companyId: user.companyId, code },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'create', entityType: 'equipment', entityId: equipment.id, after: equipment,
  });
  return { equipment };
}

/** Baixa ou reativa o equipamento sem apagar o histórico de movimentações. */
export async function setEquipmentStatus(user: SessionUser, id: string, status: EquipmentStatus) {
  const atual = await prisma.equipment.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
    include: { movements: { where: { returnedAt: null }, take: 1 } },
  });
  if (!atual) return { error: 'Equipamento não encontrado.' };
  if (atual.movements.length > 0 && status !== 'EM_USO') {
    return { error: 'Este equipamento está fora. Registre a devolução antes de mudar o status.' };
  }

  await prisma.equipment.update({ where: { id }, data: { status } });
  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'update', entityType: 'equipment', entityId: id,
    before: { status: atual.status }, after: { status },
  });
  return { ok: true as const };
}

// ---------- Movimentação ----------

export type CheckoutInput = {
  kind: EquipmentMovementKind;
  holderUserId?: string | null;
  holderName?: string | null;
  projectId?: string | null;
  clientId?: string | null;
  destination?: string | null;
  expectedReturnAt?: string | null;
  conditionOut?: string | null;
  notes?: string | null;
};

/**
 * Registra a saída do equipamento.
 *
 * Exige responsável — nome de usuário ou texto livre — porque uma saída sem
 * responsável é exatamente o descontrole que se quer evitar.
 */
export async function checkOut(user: SessionUser, equipmentId: string, input: CheckoutInput) {
  const equipment = await prisma.equipment.findFirst({
    where: { id: equipmentId, companyId: user.companyId, deletedAt: null },
    include: { movements: { where: { returnedAt: null }, take: 1 } },
  });
  if (!equipment) return { error: 'Equipamento não encontrado.' };
  if (equipment.movements.length > 0) {
    return { error: 'Este equipamento já está fora. Registre a devolução primeiro.' };
  }
  if (equipment.status === 'BAIXADO') {
    return { error: 'Equipamento baixado não pode sair.' };
  }
  if (!input.holderUserId && !input.holderName?.trim()) {
    return { error: 'Informe quem está levando o equipamento.' };
  }

  const movement = await prisma.$transaction(async (tx) => {
    const created = await tx.equipmentMovement.create({
      data: {
        companyId: user.companyId,
        equipmentId,
        kind: input.kind,
        holderUserId: input.holderUserId || null,
        holderName: input.holderName?.trim() || null,
        projectId: input.projectId || null,
        clientId: input.clientId || null,
        destination: input.destination?.trim() || null,
        expectedReturnAt: parseDateInput(input.expectedReturnAt),
        conditionOut: input.conditionOut?.trim() || null,
        notes: input.notes?.trim() || null,
        checkedOutById: user.id,
      },
    });
    await tx.equipment.update({
      where: { id: equipmentId },
      // Foi para assistência: o status reflete isso, não "em uso".
      data: { status: input.kind === 'MANUTENCAO' ? 'MANUTENCAO' : 'EM_USO' },
    });
    return created;
  });

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'checkout', entityType: 'equipment', entityId: equipmentId,
    after: { kind: input.kind, destino: input.destination, responsavel: input.holderName },
  });
  return { movement };
}

export async function checkIn(
  user: SessionUser, movementId: string,
  input: { conditionIn?: string | null; notes?: string | null; paraManutencao?: boolean },
) {
  const movement = await prisma.equipmentMovement.findFirst({
    where: { id: movementId, companyId: user.companyId, returnedAt: null },
  });
  if (!movement) return { error: 'Saída não encontrada ou já devolvida.' };

  await prisma.$transaction(async (tx) => {
    await tx.equipmentMovement.update({
      where: { id: movementId },
      data: {
        returnedAt: new Date(),
        returnedById: user.id,
        conditionIn: input.conditionIn?.trim() || null,
        notes: input.notes?.trim() || movement.notes,
      },
    });
    await tx.equipment.update({
      where: { id: movement.equipmentId },
      // Voltou com problema: segue para manutenção em vez de disponível.
      data: { status: input.paraManutencao ? 'MANUTENCAO' : 'DISPONIVEL' },
    });
  });

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'checkin', entityType: 'equipment', entityId: movement.equipmentId,
    after: { estado: input.conditionIn, manutencao: Boolean(input.paraManutencao) },
  });
  return { ok: true as const };
}

/** Resumo para o painel: o que está fora, atrasado e com calibração vencida. */
export async function getEquipmentSummary(user: SessionUser) {
  const agora = new Date();
  const [total, fora, atrasados, calibracao] = await prisma.$transaction([
    prisma.equipment.count({ where: { companyId: user.companyId, deletedAt: null } }),
    prisma.equipmentMovement.count({ where: { companyId: user.companyId, returnedAt: null } }),
    prisma.equipmentMovement.count({
      where: { companyId: user.companyId, returnedAt: null, expectedReturnAt: { lt: agora } },
    }),
    prisma.equipment.count({
      where: { companyId: user.companyId, deletedAt: null, calibrationDueAt: { lt: agora } },
    }),
  ]);
  return { total, fora, atrasados, calibracao };
}
