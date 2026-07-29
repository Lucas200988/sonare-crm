'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { loginAction, type LoginState } from '@/actions/auth';

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-300">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          placeholder="voce@sonareengenharia.com.br"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-300">
          Senha
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          placeholder="••••••••"
        />
      </div>
      {state.error ? (
        <p role="alert" className="rounded-lg border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
      <p className="text-center">
        <Link href="/esqueci-senha" className="text-xs text-slate-400 hover:text-slate-200">
          Esqueci minha senha
        </Link>
      </p>
    </form>
  );
}
