import 'server-only';
import { redirect } from 'next/navigation';
import { getSessionUser, type SessionUser } from '@/server/auth/session';
import type { PermissionCode } from '@/config/permissions';

export class ForbiddenError extends Error {
  constructor(permission: string) {
    super(`Permissão negada: ${permission}`);
    this.name = 'ForbiddenError';
  }
}

/** Exige usuário autenticado; redireciona para /login se não houver sessão. */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}

/** Exige uma permissão específica. Lança ForbiddenError (actions) — as páginas tratam com redirect. */
export async function requirePermission(permission: PermissionCode): Promise<SessionUser> {
  const user = await requireAuth();
  if (!user.permissions.has(permission)) throw new ForbiddenError(permission);
  return user;
}

/** Versão para páginas: redireciona para o dashboard com aviso em vez de lançar erro. */
export async function requirePermissionPage(permission: PermissionCode): Promise<SessionUser> {
  const user = await requireAuth();
  if (!user.permissions.has(permission)) redirect('/dashboard?erro=sem-permissao');
  return user;
}

export function hasPermission(user: SessionUser, permission: PermissionCode): boolean {
  return user.permissions.has(permission);
}
