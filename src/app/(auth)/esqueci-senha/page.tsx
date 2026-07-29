import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotForm } from './forgot-form';

export const metadata: Metadata = { title: 'Recuperar senha — SONARE CRM' };

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-horizontal-branco.png" alt="SONARE Engenharia" className="h-14 w-auto" />
          <p className="mt-4 text-sm text-slate-400">Recuperação de acesso</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          <ForgotForm />
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          <Link href="/login" className="hover:text-slate-300">← Voltar para o login</Link>
        </p>
      </div>
    </main>
  );
}
