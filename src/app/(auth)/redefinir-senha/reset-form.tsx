'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { resetPasswordAction, type ResetState } from '@/actions/password-reset';

const campoCls =
  'w-full rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-brand focus:ring-1 focus:ring-brand';

export function ResetForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ResetState, FormData>(resetPasswordAction, {});

  if (state.info) {
    return (
      <div className="space-y-4">
        <p className="flex items-start gap-2 text-sm text-green-400">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.info}
        </p>
        <Link
          href="/login"
          className="inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Ir para o login
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="token" value={token} />

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-300">
          Nova senha
        </label>
        <input
          id="password" name="password" type="password" autoComplete="new-password"
          required minLength={8} className={campoCls}
        />
        <p className="mt-1.5 text-xs text-slate-500">
          Mínimo de 8 caracteres, com letras e números.
        </p>
      </div>

      <div>
        <label htmlFor="confirmacao" className="mb-1.5 block text-sm font-medium text-slate-300">
          Repita a nova senha
        </label>
        <input
          id="confirmacao" name="confirmacao" type="password" autoComplete="new-password"
          required minLength={8} className={campoCls}
        />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {state.error}
        </p>
      ) : null}

      <p className="text-xs text-slate-500">
        Ao salvar, as sessões abertas nesta conta serão encerradas.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? 'Salvando…' : 'Salvar nova senha'}
      </button>
    </form>
  );
}
