'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/server/auth/guards';
import * as users from '@/server/services/users';
import { ALL_PERMISSIONS, type PermissionCode } from '@/config/permissions';
import { parseDecimalBR } from '@/lib/parse';

export type ActionState = { error?: string; info?: string };

const optional = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().nullable().optional(),
);
const decimalOpt = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() !== '' ? parseDecimalBR(v) : null),
  z.string().regex(/^\d+(\.\d+)?$/, 'Valor inválido').nullable().optional(),
);

const baseSchema = {
  name: z.string().trim().min(3, 'Informe o nome completo.'),
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  creaCau: optional,
  hourlyCost: decimalOpt,
  hourlyRate: decimalOpt,
};

/** Os papéis chegam como múltiplos campos "roleIds" do formulário. */
function readRoleIds(formData: FormData): string[] {
  return formData.getAll('roleIds').map(String).filter(Boolean);
}

export async function createUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requirePermission('user:manage');
  const parsed = z.object({
    ...baseSchema,
    password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres.'),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await users.createUser(admin, { ...parsed.data, roleIds: readRoleIds(formData) });
  if ('error' in result) return { error: result.error };

  revalidatePath('/usuarios');
  return { info: `Usuário ${result.user.name} criado.` };
}

export async function updateUserAction(
  userId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const admin = await requirePermission('user:manage');
  const parsed = z.object(baseSchema).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await users.updateUser(admin, userId, { ...parsed.data, roleIds: readRoleIds(formData) });
  if ('error' in result) return { error: result.error };

  revalidatePath('/usuarios');
  return { info: 'Usuário atualizado.' };
}

export async function setUserActiveAction(userId: string, active: boolean): Promise<ActionState> {
  const admin = await requirePermission('user:manage');
  const result = await users.setUserActive(admin, userId, active);
  if ('error' in result) return { error: result.error };
  revalidatePath('/usuarios');
  return { info: active ? 'Usuário reativado.' : 'Usuário desativado e sessões encerradas.' };
}

export async function resetPasswordAction(
  userId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const admin = await requirePermission('user:manage');
  const password = String(formData.get('password') ?? '');
  const result = await users.resetPassword(admin, userId, password);
  if ('error' in result) return { error: result.error };
  revalidatePath('/usuarios');
  return { info: 'Senha redefinida. As sessões abertas foram encerradas.' };
}

export async function setExtraPermissionsAction(
  userId: string, codes: string[],
): Promise<ActionState> {
  const admin = await requirePermission('user:manage');
  const validas = codes.filter((c): c is PermissionCode =>
    (ALL_PERMISSIONS as string[]).includes(c));

  const result = await users.setExtraPermissions(admin, userId, validas);
  if ('error' in result) return { error: result.error };
  revalidatePath('/usuarios');
  return { info: 'Permissões extras salvas.' };
}
