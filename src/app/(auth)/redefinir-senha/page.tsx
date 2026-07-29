import type { Metadata } from 'next';
import Link from 'next/link';
import { checkResetToken } from '@/server/services/password-reset';
import { ResetForm } from './reset-form';

export const metadata: Metadata = { title: 'Nova senha — SONARE CRM' };

export default async function ResetPasswordPage(props: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await props.searchParams;
  const check = token ? await checkResetToken(token) : { valido: false };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-horizontal-branco.png" alt="SONARE Engenharia" className="h-14 w-auto" />
          <p className="mt-4 text-sm text-slate-400">
            {check.valido ? `Olá, ${check.nome}` : 'Recuperação de acesso'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          {check.valido && token ? (
            <ResetForm token={token} />
          ) : (
            <div className="space-y-3 text-sm text-slate-300">
              <p className="font-medium text-red-400">Link inválido ou expirado</p>
              <p className="text-slate-400">
                Links de redefinição valem por 2 horas e só podem ser usados uma vez.
              </p>
              <Link
                href="/esqueci-senha"
                className="inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                Pedir um novo link
              </Link>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          <Link href="/login" className="hover:text-slate-300">← Voltar para o login</Link>
        </p>
      </div>
    </main>
  );
}
