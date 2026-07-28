import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { prisma } from '@/server/db';

const SESSION_COOKIE = 'sonare_session';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sessionTtlMs(): number {
  const hours = Number(process.env.SESSION_TTL_HOURS ?? 12);
  return hours * 60 * 60 * 1000;
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('hex');
  const h = await headers();
  const expiresAt = new Date(Date.now() + sessionTtlMs());

  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt,
      ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: h.get('user-agent'),
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export type SessionUser = {
  id: string;
  companyId: string;
  name: string;
  email: string;
  roles: string[]; // códigos de papéis
  permissions: Set<string>; // códigos de permissões efetivas
};

/**
 * Retorna o usuário autenticado da sessão atual (ou null).
 * Cacheado por requisição via React cache().
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        include: {
          roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
          extraPermissions: { include: { permission: true } },
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  const { user } = session;
  if (!user.active || user.deletedAt) return null;

  const permissions = new Set<string>();
  for (const ur of user.roles) {
    for (const rp of ur.role.permissions) permissions.add(rp.permission.code);
  }
  for (const up of user.extraPermissions) permissions.add(up.permission.code);

  return {
    id: user.id,
    companyId: user.companyId,
    name: user.name,
    email: user.email,
    roles: user.roles.map((ur) => ur.role.code),
    permissions,
  };
});

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: sha256(token) },
      data: { revokedAt: new Date() },
    });
  }
  cookieStore.delete(SESSION_COOKIE);
}

/** Remove sessões expiradas/revogadas antigas (chamado oportunisticamente). */
export async function pruneSessions(): Promise<void> {
  await prisma.session.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }] },
  });
}
