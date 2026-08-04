'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, KeyRound, Pencil, Plus, ShieldCheck, UserPlus, X } from 'lucide-react';
import {
  createUserAction, updateUserAction, setUserActiveAction,
  resetPasswordAction, setExtraPermissionsAction, setRolePermissionsAction, type ActionState,
} from '@/actions/users';
import { inputCls, Field, FormError, Badge } from '@/components/ui';
import { formatDateTimeBR } from '@/lib/dates';

export type RoleOption = { id: string; code: string; name: string; permissionCount: number };

export type UserRow = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  creaCau: string | null;
  hourlyCost: string | null;
  hourlyRate: string | null;
  lastLoginAt: string | null;
  roleIds: string[];
  roleNames: string[];
  extraPermissions: string[];
};

export type PermissionOption = { code: string; description: string };

const ROLE_COLOR: Record<string, string> = {
  ADMIN: 'red', DIRETORIA: 'violet', COMERCIAL: 'blue',
  ENGENHARIA: 'green', FINANCEIRO: 'amber', EXTERNO: 'slate', CLIENTE: 'slate',
};

export function UsersManager({
  users, roles, permissions, currentUserId,
}: {
  users: UserRow[];
  roles: RoleOption[];
  permissions: PermissionOption[];
  currentUserId: string;
}) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {users.filter((u) => u.active).length} ativo(s) de {users.length}
        </p>
        <button
          type="button"
          onClick={() => { setCreating((v) => !v); setEditingId(null); }}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          {creating ? <X className="h-4 w-4" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
          {creating ? 'Fechar' : 'Novo usuário'}
        </button>
      </div>

      {creating ? (
        <div className="rounded-xl border border-brand/30 bg-brand-light/40 p-4">
          <UserForm roles={roles} onDone={() => setCreating(false)} />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Usuário</th>
              <th className="px-4 py-3 font-medium">Perfis de acesso</th>
              <th className="px-4 py-3 font-medium">Último acesso</th>
              <th className="px-4 py-3 font-medium">Situação</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <UserRowItem
                key={u.id}
                user={u}
                roles={roles}
                permissions={permissions}
                isCurrent={u.id === currentUserId}
                editing={editingId === u.id}
                onToggleEdit={() => setEditingId(editingId === u.id ? null : u.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserRowItem({
  user, roles, permissions, isCurrent, editing, onToggleEdit,
}: {
  user: UserRow;
  roles: RoleOption[];
  permissions: PermissionOption[];
  isCurrent: boolean;
  editing: boolean;
  onToggleEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <tr className={user.active ? '' : 'bg-slate-50/60'}>
        <td className="px-4 py-3">
          <p className={`font-medium ${user.active ? 'text-slate-900' : 'text-slate-400'}`}>
            {user.name}
            {isCurrent ? <span className="ml-2 text-[11px] text-slate-400">(você)</span> : null}
          </p>
          <p className="text-xs text-slate-500">{user.email}</p>
          {user.creaCau ? <p className="text-[11px] text-slate-400">{user.creaCau}</p> : null}
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {user.roleNames.map((r, i) => (
              <Badge key={r} color={ROLE_COLOR[user.roleIds[i] ? roles.find((x) => x.id === user.roleIds[i])?.code ?? '' : ''] ?? 'slate'}>
                {r}
              </Badge>
            ))}
            {user.extraPermissions.length > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                +{user.extraPermissions.length} permissão(ões)
              </span>
            ) : null}
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-slate-500">
          {user.lastLoginAt ? formatDateTimeBR(user.lastLoginAt) : 'nunca acessou'}
        </td>
        <td className="px-4 py-3">
          {user.active
            ? <Badge color="green">Ativo</Badge>
            : <Badge color="slate">Inativo</Badge>}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={onToggleEdit}
              className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label={`Editar ${user.name}`}
            >
              <Pencil className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              disabled={pending || isCurrent}
              onClick={() => startTransition(async () => {
                setError(null);
                const r = await setUserActiveAction(user.id, !user.active);
                if (r.error) setError(r.error);
                else router.refresh();
              })}
              className="rounded px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
              title={isCurrent ? 'Você não pode desativar o próprio acesso' : undefined}
            >
              {user.active ? 'Desativar' : 'Reativar'}
            </button>
          </div>
        </td>
      </tr>

      {error ? (
        <tr><td colSpan={5} className="px-4 pb-2"><FormError message={error} /></td></tr>
      ) : null}

      {editing ? (
        <tr>
          <td colSpan={5} className="bg-slate-50 px-4 py-4">
            <div className="space-y-4">
              <UserForm user={user} roles={roles} onDone={onToggleEdit} />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <PasswordReset userId={user.id} userName={user.name} />
                <ExtraPermissions
                  userId={user.id}
                  permissions={permissions}
                  current={user.extraPermissions}
                />
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function UserForm({
  user, roles, onDone,
}: {
  user?: UserRow;
  roles: RoleOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const action = user
    ? updateUserAction.bind(null, user.id)
    : createUserAction;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const r = await action(prev, fd);
      if (!r.error) { router.refresh(); if (!user) onDone(); }
      return r;
    },
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nome completo" htmlFor={`n-${user?.id ?? 'novo'}`} required>
          <input
            id={`n-${user?.id ?? 'novo'}`} name="name" defaultValue={user?.name}
            required className={inputCls}
          />
        </Field>
        <Field label="E-mail (usado no login)" htmlFor={`e-${user?.id ?? 'novo'}`} required>
          <input
            id={`e-${user?.id ?? 'novo'}`} name="email" type="email" defaultValue={user?.email}
            required className={inputCls}
          />
        </Field>
      </div>

      {!user ? (
        <Field label="Senha inicial" htmlFor="senha-nova" required>
          <input
            id="senha-nova" name="password" type="text" required minLength={8}
            placeholder="Mínimo 8 caracteres, com letras e números"
            className={inputCls}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Combine uma senha com a pessoa e peça que ela troque depois do primeiro acesso.
          </p>
        </Field>
      ) : null}

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-700">
          Perfis de acesso <span className="text-red-500">*</span>
        </legend>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((r) => (
            <label key={r.id} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2 text-sm">
              <input
                type="checkbox" name="roleIds" value={r.id}
                defaultChecked={user?.roleIds.includes(r.id)}
                className="mt-0.5 rounded border-slate-300"
              />
              <span>
                <span className="block font-medium text-slate-800">{r.name}</span>
                <span className="block text-[11px] text-slate-500">{r.permissionCount} permissões</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <details className="rounded-lg border border-slate-200 bg-white p-3">
        <summary className="cursor-pointer text-xs font-medium text-slate-600">
          Dados profissionais (opcional)
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="CREA / CAU" htmlFor={`c-${user?.id ?? 'novo'}`}>
            <input id={`c-${user?.id ?? 'novo'}`} name="creaCau" defaultValue={user?.creaCau ?? ''} className={inputCls} />
          </Field>
          <Field label="Custo/hora (R$)" htmlFor={`hc-${user?.id ?? 'novo'}`}>
            <input id={`hc-${user?.id ?? 'novo'}`} name="hourlyCost" defaultValue={user?.hourlyCost ?? ''} inputMode="decimal" className={inputCls} />
          </Field>
          <Field label="Valor/hora faturável (R$)" htmlFor={`hr-${user?.id ?? 'novo'}`}>
            <input id={`hr-${user?.id ?? 'novo'}`} name="hourlyRate" defaultValue={user?.hourlyRate ?? ''} inputMode="decimal" className={inputCls} />
          </Field>
        </div>
      </details>

      <FormError message={state.error} />
      {state.info ? (
        <p className="flex items-center gap-1.5 text-xs text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {state.info}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit" disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {user ? <Pencil className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
          {pending ? 'Salvando…' : user ? 'Salvar alterações' : 'Criar usuário'}
        </button>
        {user ? (
          <button type="button" onClick={onDone} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-white">
            Fechar
          </button>
        ) : null}
      </div>
    </form>
  );
}

function PasswordReset({ userId, userName }: { userId: string; userName: string }) {
  const action = resetPasswordAction.bind(null, userId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        <KeyRound className="h-3.5 w-3.5 text-brand" aria-hidden /> Redefinir senha
      </p>
      <input
        name="password" type="text" minLength={8} required
        placeholder="Nova senha (mín. 8 caracteres)"
        className={inputCls}
        aria-label={`Nova senha de ${userName}`}
      />
      <FormError message={state.error} />
      {state.info ? <p className="mt-1 text-[11px] text-green-700">{state.info}</p> : null}
      <button
        type="submit" disabled={pending}
        className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {pending ? 'Redefinindo…' : 'Redefinir e encerrar sessões'}
      </button>
    </form>
  );
}

function ExtraPermissions({
  userId, permissions, current,
}: {
  userId: string;
  permissions: PermissionOption[];
  current: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(current);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        <ShieldCheck className="h-3.5 w-3.5 text-brand" aria-hidden /> Permissões extras
      </p>
      <p className="mb-2 text-[11px] text-slate-500">
        Concedidas além do perfil, para exceções pontuais.
      </p>
      <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
        {permissions.map((p) => (
          <label key={p.code} className="flex items-start gap-2 text-[11px] text-slate-700">
            <input
              type="checkbox" checked={selected.includes(p.code)}
              onChange={(e) => setSelected((prev) =>
                e.target.checked ? [...prev, p.code] : prev.filter((c) => c !== p.code))}
              className="mt-0.5 rounded border-slate-300"
            />
            <span><code className="text-slate-500">{p.code}</code> — {p.description}</span>
          </label>
        ))}
      </div>
      <FormError message={error} />
      {msg ? <p className="mt-1 text-[11px] text-green-700">{msg}</p> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => {
          setError(null); setMsg(null);
          const r = await setExtraPermissionsAction(userId, selected);
          if (r.error) setError(r.error);
          else { setMsg(r.info ?? 'Salvo.'); router.refresh(); }
        })}
        className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {pending ? 'Salvando…' : 'Salvar permissões'}
      </button>
    </div>
  );
}

/**
 * Permissões de um perfil.
 *
 * É aqui que se tira acesso: permissão extra só soma, então sem esta tela uma
 * permissão concedida a um perfil ficaria valendo para sempre.
 */
export function RolePermissions({
  role, permissions,
}: {
  role: { id: string; name: string; codes: string[]; userCount: number };
  permissions: PermissionOption[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [selected, setSelected] = useState<string[]>(role.codes);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const alterado = selected.length !== role.codes.length
    || selected.some((c) => !role.codes.includes(c));

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{role.name}</p>
          <p className="text-[11px] text-slate-500">
            {role.userCount} usuário(s) · {selected.length} permissões
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
        >
          {aberto ? 'Fechar' : 'Editar'}
        </button>
      </div>

      {aberto ? (
        <>
          <div className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
            {permissions.map((p) => (
              <label key={p.code} className="flex items-start gap-2 text-[11px] text-slate-700">
                <input
                  type="checkbox" checked={selected.includes(p.code)}
                  onChange={(e) => setSelected((prev) =>
                    e.target.checked ? [...prev, p.code] : prev.filter((c) => c !== p.code))}
                  className="mt-0.5 rounded border-slate-300"
                />
                <span><code className="text-slate-500">{p.code}</code> — {p.description}</span>
              </label>
            ))}
          </div>
          <FormError message={error} />
          {msg ? <p className="mt-1 text-[11px] text-green-700">{msg}</p> : null}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={pending || !alterado}
              onClick={() => startTransition(async () => {
                setError(null); setMsg(null);
                const r = await setRolePermissionsAction(role.id, selected);
                if (r.error) setError(r.error);
                else { setMsg(r.info ?? 'Salvo.'); router.refresh(); }
              })}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {pending ? 'Salvando…' : 'Salvar perfil'}
            </button>
            {alterado ? (
              <button
                type="button"
                onClick={() => { setSelected(role.codes); setError(null); setMsg(null); }}
                className="text-[11px] text-slate-500 hover:underline"
              >
                Desfazer
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Vale para os {role.userCount} usuário(s) deste perfil. Quem tiver a permissão
            concedida à parte continua com ela.
          </p>
        </>
      ) : (
        <ul className="mt-2 max-h-24 space-y-0.5 overflow-y-auto text-[10px] text-slate-500">
          {selected.map((c) => <li key={c}>{c}</li>)}
        </ul>
      )}
    </div>
  );
}
