import type { Metadata } from 'next';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { prisma } from '@/server/db';
import { formatDateBR, formatDateTimeBR } from '@/lib/dates';
import { formatHashForDisplay } from '@/server/signature';
import { formatCNPJ } from '@/lib/br';

export const metadata: Metadata = {
  title: 'Verificação de documento — SONARE Engenharia',
  robots: { index: false, follow: false },
};

/**
 * Página pública de conferência de autenticidade (sem login).
 * Mostra apenas o necessário para confirmar que o documento é legítimo:
 * código, emissor, data e hash. Nunca expõe valores nem dados do cliente.
 */
export default async function VerifyPage(props: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await props.params;
  const code = decodeURIComponent(codigo).toUpperCase().trim();

  const proposal = await prisma.proposal.findUnique({
    where: { verificationCode: code },
    select: {
      code: true,
      status: true,
      signedElectronicallyAt: true,
      signerName: true,
      signerRegistration: true,
      documentHash: true,
      deletedAt: true,
      budgetVersion: {
        select: { versionNumber: true, validUntil: true, budget: { select: { code: true } } },
      },
    },
  }).catch(() => null);

  // o mesmo balcão confere propostas e RDOs — o código diz qual é
  const rdo = proposal ? null : await prisma.constructionDiary.findUnique({
    where: { verificationCode: code },
    select: {
      code: true, number: true, diaryDate: true, status: true,
      documentHash: true, deletedAt: true,
      project: { select: { name: true } },
      signatures: { select: { role: true, name: true, registration: true, signedAt: true }, orderBy: { signedAt: 'asc' } },
    },
  }).catch(() => null);

  const company = await prisma.company.findFirst({
    select: { legalName: true, cnpj: true, crea: true },
  }).catch(() => null);

  const valid = proposal && !proposal.deletedAt;
  const rdoValido = rdo && !rdo.deletedAt;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-horizontal-preto.png" alt="SONARE Engenharia" className="h-12 w-auto" />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {valid ? (
            <>
              <div className="flex items-center gap-2 text-green-700">
                <ShieldCheck className="h-6 w-6" aria-hidden />
                <h1 className="text-lg font-bold">Documento autêntico</h1>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Este documento foi emitido e assinado eletronicamente por
                {' '}{company?.legalName ?? 'SONARE Engenharia'}.
              </p>

              <dl className="mt-5 space-y-3 border-t border-slate-100 pt-5 text-sm">
                <Row label="Documento" value={`Proposta ${proposal.code}`} />
                <Row
                  label="Referência"
                  value={`${proposal.budgetVersion.budget.code} — V${String(proposal.budgetVersion.versionNumber).padStart(2, '0')}`}
                />
                <Row
                  label="Assinado por"
                  value={[proposal.signerName, proposal.signerRegistration].filter(Boolean).join(' · ') || '—'}
                />
                <Row
                  label="Data da assinatura"
                  value={proposal.signedElectronicallyAt ? formatDateTimeBR(proposal.signedElectronicallyAt) : '—'}
                />
                <Row
                  label="Validade da proposta"
                  value={proposal.budgetVersion.validUntil ? formatDateBR(proposal.budgetVersion.validUntil) : '—'}
                />
                <Row label="Código de conferência" value={code} mono />
                {proposal.documentHash ? (
                  <Row label="Hash SHA-256 (início)" value={formatHashForDisplay(proposal.documentHash)} mono />
                ) : null}
              </dl>

              <p className="mt-5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                Assinatura eletrônica nos termos do art. 10, §2º, da MP 2.200-2/2001. Para confirmar que o
                arquivo em seu poder não foi alterado, compare o hash SHA-256 dele com o exibido acima.
              </p>
            </>
          ) : rdoValido ? (
            <>
              <div className="flex items-center gap-2 text-green-700">
                <ShieldCheck className="h-6 w-6" aria-hidden />
                <h1 className="text-lg font-bold">Documento autêntico</h1>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Relatório Diário de Obra emitido por {company?.legalName ?? 'SONARE Engenharia'}.
              </p>

              <dl className="mt-5 space-y-3 border-t border-slate-100 pt-5 text-sm">
                <Row label="Documento" value={`RDO nº ${rdo.number} — ${formatDateBR(new Date(`${rdo.diaryDate}T12:00:00Z`))}`} />
                <Row label="Referência" value={rdo.code} mono />
                <Row label="Obra" value={rdo.project.name} />
                <Row
                  label="Situação"
                  value={rdo.status === 'APROVADO' ? 'Aprovado pela fiscalização' : 'Finalizado, em assinatura'}
                />
                {rdo.signatures.map((a) => (
                  <Row
                    key={a.role}
                    label={a.role === 'FISCALIZACAO' ? 'Fiscalização' : a.role === 'GERENCIA' ? 'Gerência de Engenharia' : 'Engenheiro(a) Residente'}
                    value={`${[a.name, a.registration].filter(Boolean).join(' · ')} — ${formatDateTimeBR(a.signedAt)}`}
                  />
                ))}
                <Row label="Código de conferência" value={code} mono />
                {rdo.documentHash ? (
                  <Row label="Hash SHA-256 (início)" value={formatHashForDisplay(rdo.documentHash)} mono />
                ) : null}
              </dl>

              <p className="mt-5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                Assinatura eletrônica nos termos do art. 10, §2º, da MP 2.200-2/2001. Para confirmar que o
                arquivo em seu poder não foi alterado, compare o hash SHA-256 dele com o exibido acima.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="h-6 w-6" aria-hidden />
                <h1 className="text-lg font-bold">Documento não localizado</h1>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Nenhum documento corresponde ao código <strong className="font-mono">{code}</strong>.
                Verifique se o código foi digitado corretamente — ele aparece no rodapé da proposta,
                junto ao QR code.
              </p>
              <p className="mt-3 text-sm text-slate-600">
                Persistindo a dúvida, entre em contato com a {company?.legalName ?? 'SONARE Engenharia'}.
              </p>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          {company?.legalName ?? 'SONARE Engenharia'}
          {company?.cnpj ? ` · CNPJ ${formatCNPJ(company.cnpj)}` : ''}
          {company?.crea ? ` · CREA ${company.crea}` : ''}
        </p>
      </div>
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-right font-medium text-slate-900 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}
