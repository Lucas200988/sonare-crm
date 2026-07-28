import type { Metadata } from 'next';
import { requirePermissionPage } from '@/server/auth/guards';
import { prisma } from '@/server/db';
import { searchClientOptions, getClientOption } from '@/server/services/clients';
import { createOpportunityAction } from '@/actions/opportunities';
import { PageHeader, Card } from '@/components/ui';
import { OpportunityForm } from '../opportunity-form';

export const metadata: Metadata = { title: 'Nova oportunidade — SONARE CRM' };

export default async function NewOpportunityPage(props: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const user = await requirePermissionPage('opportunity:write');
  const sp = await props.searchParams;

  const [clients, services, users, leadSources] = await Promise.all([
    searchClientOptions(user, ''),
    prisma.serviceCatalog.findMany({
      where: { companyId: user.companyId, active: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { code: 'asc' },
    }),
    prisma.user.findMany({
      where: { companyId: user.companyId, active: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.leadSource.findMany({
      where: { companyId: user.companyId, active: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);

  // Cliente vindo por link da ficha precisa estar na lista inicial do seletor
  if (sp.cliente && !clients.some((c) => c.id === sp.cliente)) {
    const preselected = await getClientOption(user, sp.cliente);
    if (preselected) clients.unshift(preselected);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Nova oportunidade" subtitle="O código OPP-AAAA-NNN é gerado automaticamente" />
      <Card className="p-6">
        <OpportunityForm
          action={createOpportunityAction}
          initial={sp.cliente ? { clientId: sp.cliente } : undefined}
          clients={clients}
          services={services}
          users={users}
          leadSources={leadSources}
          submitLabel="Criar oportunidade"
        />
      </Card>
    </div>
  );
}
