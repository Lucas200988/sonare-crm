import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermissionPage } from '@/server/auth/guards';
import { prisma } from '@/server/db';
import { PageHeader, Card } from '@/components/ui';
import { formatBRL } from '@/lib/money';
import { formatDateBR } from '@/lib/dates';
import { ConvertProposalForm } from './convert-form';

export const metadata: Metadata = { title: 'Converter proposta em contrato — SONARE CRM' };

export default async function ConvertProposalPage(props: {
  params: Promise<{ proposalId: string }>;
}) {
  const user = await requirePermissionPage('contract:write');
  const { proposalId } = await props.params;

  const [proposal, templates] = await Promise.all([
    prisma.proposal.findFirst({
      where: { id: proposalId, companyId: user.companyId, deletedAt: null },
      include: {
        budgetVersion: {
          include: {
            items: { orderBy: { sortOrder: 'asc' } },
            budget: { include: { client: true, clientUnit: true } },
          },
        },
        contracts: { where: { deletedAt: null }, select: { id: true, code: true } },
      },
    }),
    prisma.contractTemplate.findMany({
      where: { companyId: user.companyId, active: true },
      select: { id: true, name: true, kind: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  if (!proposal) notFound();

  const cv = proposal.budgetVersion;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Converter ${proposal.code} em contrato`}
        subtitle="Os dados abaixo são herdados automaticamente da proposta"
      />

      <Card className="mb-4 p-5">
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <Info label="Cliente" value={cv.budget.client.legalName} />
          <Info label="Unidade / obra" value={cv.budget.clientUnit?.name ?? '—'} />
          <Info label="Objeto" value={cv.serviceType ?? '—'} />
          <Info label="Valor total" value={formatBRL(cv.total)} />
          <Info label="Prazo de execução" value={cv.executionDeadline ?? '—'} />
          <Info label="Aceita em" value={proposal.acceptedAt ? formatDateBR(proposal.acceptedAt) : '—'} />
        </dl>
        {cv.paymentTerms ? (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Condições de pagamento</p>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{cv.paymentTerms}</p>
          </div>
        ) : null}
      </Card>

      <Card className="p-6">
        {proposal.contracts.length > 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Esta proposta já gerou o contrato <strong>{proposal.contracts[0].code}</strong>.
          </p>
        ) : proposal.status !== 'ACEITA' ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            A proposta ainda não foi aceita pelo cliente. Registre o aceite na tela do orçamento
            antes de gerar o contrato.
          </p>
        ) : (
          <ConvertProposalForm proposalId={proposal.id} templates={templates} />
        )}
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-900">{value}</dd>
    </div>
  );
}
