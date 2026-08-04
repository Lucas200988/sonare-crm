import type { Metadata } from 'next';
import { requirePermissionPage } from '@/server/auth/guards';
import { listUsers, listRoles } from '@/server/services/users';
import { PERMISSIONS, ALL_PERMISSIONS } from '@/config/permissions';
import { PageHeader, Card } from '@/components/ui';
import { UsersManager, RolePermissions, type UserRow, type RoleOption } from './user-sections';

export const metadata: Metadata = { title: 'Usuários — SONARE CRM' };

export default async function UsersPage() {
  const admin = await requirePermissionPage('user:manage');
  const [users, roles] = await Promise.all([listUsers(admin), listRoles(admin)]);

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    active: u.active,
    creaCau: u.creaCau,
    hourlyCost: u.hourlyCost?.toString() ?? null,
    hourlyRate: u.hourlyRate?.toString() ?? null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    roleIds: u.roles.map((r) => r.roleId),
    roleNames: u.roles.map((r) => r.role.name),
    extraPermissions: u.extraPermissions.map((p) => p.permission.code),
  }));

  const roleOptions: RoleOption[] = roles.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    permissionCount: r.permissions.length,
  }));

  const permissionOptions = ALL_PERMISSIONS.map((code) => ({
    code,
    description: PERMISSIONS[code],
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Usuários e permissões"
        subtitle="Quem acessa o sistema e o que cada um pode fazer"
      />

      <Card className="p-5">
        <UsersManager
          users={rows}
          roles={roleOptions}
          permissions={permissionOptions}
          currentUserId={admin.id}
        />
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="text-base font-semibold text-slate-900">Perfis de acesso</h2>
        <p className="mt-1 text-xs text-slate-500">
          Cada perfil reúne um conjunto de permissões. Um usuário pode ter mais de um perfil —
          as permissões se somam. É aqui que se <strong>tira</strong> um acesso: permissão
          concedida à parte, na ficha do usuário, só soma.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((r) => (
            <RolePermissions
              key={r.id}
              role={{
                id: r.id, name: r.name, userCount: r._count.users,
                codes: r.permissions.map((p) => p.permission.code),
              }}
              permissions={permissionOptions}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
