'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/server/auth/guards';
import * as equipment from '@/server/services/equipment';
import { parseDecimalBR } from '@/lib/parse';

export type ActionState = { error?: string; info?: string };

const opcional = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().nullable().optional(),
);

const cadastroSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do equipamento.'),
  brand: opcional,
  model: opcional,
  serialNumber: opcional,
  category: opcional,
  homeLocation: opcional,
  purchaseDate: opcional,
  purchaseValue: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? parseDecimalBR(v) : null),
    z.string().regex(/^\d+(\.\d{1,2})?$/, 'Valor inválido.').nullable().optional(),
  ),
  calibrationDueAt: opcional,
  notes: opcional,
});

export async function saveEquipmentAction(
  id: string | null, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('equipment:write');
  const parsed = cadastroSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await equipment.upsertEquipment(user, parsed.data, id ?? undefined);
  if ('error' in result) return { error: result.error };

  revalidatePath('/equipamentos');
  return { info: id ? 'Equipamento atualizado.' : `${result.equipment.code} cadastrado.` };
}

const saidaSchema = z.object({
  kind: z.enum(['OBRA', 'EMPRESTIMO', 'ALUGUEL', 'MANUTENCAO']),
  holderUserId: opcional,
  holderName: opcional,
  projectId: opcional,
  clientId: opcional,
  destination: opcional,
  expectedReturnAt: opcional,
  conditionOut: opcional,
  notes: opcional,
});

export async function checkOutAction(
  equipmentId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('equipment:write');
  const parsed = saidaSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await equipment.checkOut(user, equipmentId, parsed.data);
  if ('error' in result) return { error: result.error };

  revalidatePath('/equipamentos');
  return { info: 'Saída registrada.' };
}

const devolucaoSchema = z.object({
  conditionIn: opcional,
  notes: opcional,
  paraManutencao: z.preprocess((v) => v === 'on' || v === 'true', z.boolean()),
});

export async function checkInAction(
  movementId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('equipment:write');
  const parsed = devolucaoSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await equipment.checkIn(user, movementId, parsed.data);
  if ('error' in result) return { error: result.error };

  revalidatePath('/equipamentos');
  return { info: 'Devolução registrada.' };
}

export async function setEquipmentStatusAction(
  id: string, status: 'DISPONIVEL' | 'MANUTENCAO' | 'BAIXADO',
): Promise<ActionState> {
  const user = await requirePermission('equipment:write');
  const result = await equipment.setEquipmentStatus(user, id, status);
  if ('error' in result) return { error: result.error };

  revalidatePath('/equipamentos');
  return {};
}
