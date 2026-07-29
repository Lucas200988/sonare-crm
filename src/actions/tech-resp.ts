'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/server/auth/guards';
import * as techResp from '@/server/services/tech-resp';
import { parseDecimalBR } from '@/lib/parse';

export type ActionState = { error?: string; info?: string };

const optional = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().nullable().optional(),
);

const schema = z.object({
  number: z.string().trim().min(1, 'Informe o número da ART/RRT.'),
  docType: z.enum(['ART', 'RRT', 'TRT']),
  council: optional,
  professionalId: optional,
  professionalName: optional,
  registration: optional,
  projectId: optional,
  issuedAt: optional,
  value: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? parseDecimalBR(v) : null),
    z.string().regex(/^\d+(\.\d{1,2})?$/, 'Valor inválido.').nullable().optional(),
  ),
  serviceDescription: optional,
  notes: optional,
});

export async function createTechRespAction(
  _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('techresp:write');
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await techResp.createTechResp(user, parsed.data);
  if ('error' in result) return { error: result.error };

  revalidatePath('/art');
  return { info: `${parsed.data.docType} ${parsed.data.number} cadastrada.` };
}

export async function updateTechRespAction(
  id: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('techresp:write');
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await techResp.updateTechResp(user, id, parsed.data);
  if ('error' in result) return { error: result.error };

  revalidatePath('/art');
  return { info: 'Registro atualizado.' };
}

export async function dischargeTechRespAction(
  id: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('techresp:write');
  const data = String(formData.get('dischargedAt') ?? '');

  const result = await techResp.dischargeTechResp(user, id, data);
  if ('error' in result) return { error: result.error };

  revalidatePath('/art');
  return { info: 'Baixa registrada.' };
}

export async function cancelTechRespAction(id: string): Promise<ActionState> {
  const user = await requirePermission('techresp:write');
  const result = await techResp.setTechRespStatus(user, id, 'CANCELADA');
  if ('error' in result) return { error: result.error };
  revalidatePath('/art');
  return { info: 'Registro cancelado.' };
}

export async function deleteTechRespAction(id: string): Promise<ActionState> {
  const user = await requirePermission('techresp:write');
  const result = await techResp.deleteTechResp(user, id);
  if ('error' in result) return { error: result.error };
  revalidatePath('/art');
  return { info: 'Registro removido.' };
}
