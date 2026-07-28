import 'server-only';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { hashPassword, validatePasswordPolicy } from '@/server/auth/password';
import type { SessionUser } from '@/server/auth/session';
import type { PermissionCode } from '@/config/permissions';

/** Lista usuários com seus papéis e permissões extras. */
export async function listUsers(user: SessionUser) {
  return prisma.user.findMany({
    where: { companyId: user.companyId, deletedAt: null },
    include: {
      roles: { include: { role: true } },
      extraPermissions: { include: { permission: true } },
    },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });
}

export async function listRoles(user: SessionUser) {
  return prisma.role.findMany({
    where: { companyId: user.companyId },
    include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
    orderBy: { name: 'asc' },
  });
}

export type UserInput = {
  name: string;
  email: string;
  roleIds: string[];
  creaCau?: string | null;
  hourlyCost?: string | null;
  hourlyRate?: string | null;
};

/** Cria usuário com senha inicial; ele deve trocá-la no primeiro acesso. */
export async function createUser(
  user: SessionUser,
  input: UserInput & { password: string },
) {
  const email = input.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: existing.deletedAt
      ? 'Já houve um usuário com este e-mail. Contate o suporte para reativá-lo.'
      : 'Já existe um usuário com este e-mail.' };
  }

  const policyError = validatePasswordPolicy(input.password);
  if (policyError) return { error: policyError };
  if (input.roleIds.length === 0) return { error: 'Selecione ao menos um perfil de acesso.' };

  const roles = await prisma.role.findMany({
    where: { id: { in: input.roleIds }, companyId: user.companyId },
  });
  if (roles.length !== input.roleIds.length) return { error: 'Perfil de acesso inválido.' };

  const created = await prisma.user.create({
    data: {
      companyId: user.companyId,
      name: input.name.trim(),
      email,
      passwordHash: await hashPassword(input.password),
      creaCau: input.creaCau || null,
      hourlyCost: input.hourlyCost || null,
      hourlyRate: input.hourlyRate || null,
      createdById: user.id,
      roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
    },
  });

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'create', entityType: 'user', entityId: created.id,
    after: { name: created.name, email: created.email, roles: roles.map((r) => r.code) },
  });
  return { user: created };
}

export async function updateUser(user: SessionUser, userId: string, input: UserInput) {
  const target = await prisma.user.findFirst({
    where: { id: userId, companyId: user.companyId, deletedAt: null },
    include: { roles: { include: { role: true } } },
  });
  if (!target) return { error: 'Usuário não encontrado.' };
  if (input.roleIds.length === 0) return { error: 'Selecione ao menos um perfil de acesso.' };

  // Trava: ninguém pode retirar o próprio acesso de administrador
  if (target.id === user.id) {
    const eraAdmin = target.roles.some((r) => r.role.code === 'ADMIN');
    const roles = await prisma.role.findMany({ where: { id: { in: input.roleIds } } });
    const continuaAdmin = roles.some((r) => r.code === 'ADMIN');
    if (eraAdmin && !continuaAdmin) {
      return { error: 'Você não pode remover o próprio perfil de administrador.' };
    }
  }

  const email = input.email.trim().toLowerCase();
  if (email !== target.email) {
    const dup = await prisma.user.findUnique({ where: { email } });
    if (dup) return { error: 'Já existe um usuário com este e-mail.' };
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId } });
    return tx.user.update({
      where: { id: userId },
      data: {
        name: input.name.trim(),
        email,
        creaCau: input.creaCau || null,
        hourlyCost: input.hourlyCost || null,
        hourlyRate: input.hourlyRate || null,
        updatedById: user.id,
        roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
      },
    });
  });

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'update', entityType: 'user', entityId: userId,
    before: { name: target.name, email: target.email, roles: target.roles.map((r) => r.role.code) },
    after: { name: updated.name, email: updated.email },
  });
  return { user: updated };
}

/** Desativa em vez de excluir: preserva o histórico de auditoria e autoria. */
export async function setUserActive(user: SessionUser, userId: string, active: boolean) {
  if (userId === user.id && !active) {
    return { error: 'Você não pode desativar o próprio acesso.' };
  }

  const target = await prisma.user.findFirst({
    where: { id: userId, companyId: user.companyId, deletedAt: null },
    include: { roles: { include: { role: true } } },
  });
  if (!target) return { error: 'Usuário não encontrado.' };

  // Não deixar a empresa sem nenhum administrador ativo
  if (!active && target.roles.some((r) => r.role.code === 'ADMIN')) {
    const outrosAdmins = await prisma.user.count({
      where: {
        companyId: user.companyId, deletedAt: null, active: true,
        id: { not: userId },
        roles: { some: { role: { code: 'ADMIN' } } },
      },
    });
    if (outrosAdmins === 0) {
      return { error: 'Este é o último administrador ativo. Promova outro usuário antes de desativá-lo.' };
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { active, updatedById: user.id } });
  // Ao desativar, encerra as sessões abertas
  if (!active) {
    await prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: active ? 'activate' : 'deactivate', entityType: 'user', entityId: userId,
    after: { name: target.name, active },
  });
  return { ok: true as const };
}

export async function resetPassword(user: SessionUser, userId: string, password: string) {
  const target = await prisma.user.findFirst({
    where: { id: userId, companyId: user.companyId, deletedAt: null },
  });
  if (!target) return { error: 'Usuário não encontrado.' };

  const policyError = validatePasswordPolicy(password);
  if (policyError) return { error: policyError };

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(password),
      passwordChangedAt: new Date(),
      updatedById: user.id,
    },
  });
  // Sessões antigas deixam de valer
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'reset_password', entityType: 'user', entityId: userId,
    after: { name: target.name },
  });
  return { ok: true as const };
}

/** Permissões avulsas, além das que vêm do perfil. */
export async function setExtraPermissions(
  user: SessionUser,
  userId: string,
  codes: PermissionCode[],
) {
  const target = await prisma.user.findFirst({
    where: { id: userId, companyId: user.companyId, deletedAt: null },
  });
  if (!target) return { error: 'Usuário não encontrado.' };

  const permissions = await prisma.permission.findMany({ where: { code: { in: codes } } });

  await prisma.$transaction([
    prisma.userPermission.deleteMany({ where: { userId } }),
    ...(permissions.length > 0
      ? [prisma.userPermission.createMany({
          data: permissions.map((p) => ({ userId, permissionId: p.id })),
        })]
      : []),
  ]);

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'update', entityType: 'user_permissions', entityId: userId,
    after: { permissions: codes },
  });
  return { ok: true as const };
}
