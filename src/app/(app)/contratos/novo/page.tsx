import type { Metadata } from 'next';
import Link from 'next/link';
import { FileSignature } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { prisma } from '@/server/db';
import { searchClientOptions, getClientOption } from '@/server/services/clients';
import { PageHeader, Card } from '@/components/ui';
import { formatBRL } from '@/lib/money';
import { formatDateBR } from '@/lib/dates';
import { NewContractForm } from './new-contract-form';

export const metadata: Metadata = { title: 'Novo contrato — SONARE CRM' };

export default async function NewContractPage(props: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const user = await requirePermissionPage('contract:write');
  const sp = await props.searchParams;

  const [clients, templates, acceptedProposals] = await Promise.all([
    searchClientOptions(user, ''),
    prisma.contractTemplate.findMany({
      where: { companyId: user.companyId, active: true },
      select: { id: true, name: true, kind: true },
      orderBy: { name: 'asc' },
    }),
    // Propostas aceitas que ainda não viraram contrato
    prisma.proposal.findMany({
      where: {
        companyId: user.companyId, deletedAt: null, status: 'ACEITA',
        contracts: { none: { deletedAt: null } },
      },
      include: {
        budgetVersion: {
          include: { budget: { include: { client: { select: { legalName: true } } } } },
        },
      },
      orderBy: { acceptedAt: 'desc' },
    }),
  ]);

  if (sp.cliente && !clients.some((c) => c.id === sp.cliente)) {
    const preselected = await getClientOption(user, sp.cliente);
    if (preselected) clients.unshift(preselected);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Novo contrato"
        subtitle="Converta uma proposta aceita ou crie um contrato avulso"
      />

      {acceptedProposals.length > 0 ? (
        <Card className="mb-4 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FileSignature className="h-4 w-4 text-brand" aria-hidden />
            Propostas aceitas aguardando contrato
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            A conversão aproveita cliente, objeto, valor e condições de pagamento — sem redigitar.
          </p>
          <ul className="mt-3 divide-y divide-slate-100">
            {acceptedProposals.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {p.code} — {p.budgetVersion.budget.client.legalName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {p.budgetVersion.serviceType ?? 'Serviços de engenharia'} ·{' '}
                    {formatBRL(p.budgetVersion.total)}
                    {p.acceptedAt ? ` · aceita em ${formatDateBR(p.acceptedAt)}` : ''}
                  </p>
                </div>
                <Link
                  href={`/contratos/novo/de-proposta/${p.id}`}
                  className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
                >
                  Gerar contrato
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Contrato avulso</h2>
        <NewContractForm clients={clients} templates={templates} initialClientId={sp.cliente} />
      </Card>
    </div>
  );
}
