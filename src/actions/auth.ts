'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { verifyPassword } from '@/server/auth/password';
import { createSession, destroySession, getSessionUser } from '@/server/auth/session';
import { rateLimit } from '@/server/auth/rate-limit';
import { auditLog } from '@/server/audit/audit';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
});

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  }
  const { email, password } = parsed.data;

  if (!rateLimit(`login:${email}`, 5, 15 * 60_000)) {
    return { error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const genericError = { error: 'E-mail ou senha incorretos.' };

  if (!user || !user.active || user.deletedAt) {
    return genericError;
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    await auditLog({
      companyId: user.companyId,
      userId: user.id,
      action: 'login_failed',
      entityType: 'user',
      entityId: user.id,
    });
    return genericError;
  }

  await createSession(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await auditLog({
    companyId: user.companyId,
    userId: user.id,
    action: 'login',
    entityType: 'user',
    entityId: user.id,
  });

  redirect('/dashboard');
}

export async function logoutAction(): Promise<void> {
  const user = await getSessionUser();
  await destroySession();
  if (user) {
    await auditLog({
      companyId: user.companyId,
      userId: user.id,
      action: 'logout',
      entityType: 'user',
      entityId: user.id,
    });
  }
  redirect('/login');
}
