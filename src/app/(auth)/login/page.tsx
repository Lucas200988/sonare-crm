import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth/session';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Entrar — SONARE CRM' };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect('/dashboard');

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-horizontal-branco.png"
            alt="SONARE Engenharia"
            className="h-14 w-auto"
          />
          <p className="mt-4 text-sm text-slate-400">
            Sistema de gestão comercial, técnica e financeira
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">
          Acesso restrito. Todas as ações são registradas em auditoria.
        </p>
      </div>
    </main>
  );
}
