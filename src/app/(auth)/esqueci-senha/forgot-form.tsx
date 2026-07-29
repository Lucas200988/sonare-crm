'use client';

import { useActionState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { requestResetAction, type ResetState } from '@/actions/password-reset';

const campoCls =
  'w-full rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-brand focus:ring-1 focus:ring-brand';

export function ForgotForm() {
  const [state, formAction, pending] = useActionState<ResetState, FormData>(requestResetAction, {});

  if (state.info) {
    return (
      <div className="space-y-3 text-sm">
        <p className="flex items-start gap-2 text-green-400">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.info}
        </p>
        {state.aviso ? (
          <p className="flex items-start gap-2 rounded-lg border border-amber-800 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {state.aviso}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-300">
          E-mail cadastrado
        </label>
        <input
          id="email" name="email" type="email" autoComplete="email" required
          placeholder="voce@sonareengenharia.com.br"
          className={campoCls}
        />
        <p className="mt-2 text-xs text-slate-500">
          Enviaremos um link para você criar uma nova senha. Ele vale por 2 horas.
        </p>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? 'Enviando…' : 'Enviar link de recuperação'}
      </button>
    </form>
  );
}
