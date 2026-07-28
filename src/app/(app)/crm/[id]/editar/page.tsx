import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermissionPage } from '@/server/auth/guards';
import { prisma } from '@/server/db';
import { searchClientOptions, getClientOption } from '@/server/services/clients';
import { updateOpportunityAction } from '@/actions/opportunities';
import { PageHeader, Card } from '@/components/ui';
import { formatDateBR } from '@/lib/dates';
import { OpportunityForm } from '../../opportunity-form';

export const metadata: Metadata = { title: 'Editar oportunidade — SONARE CRM' };

export default async function EditOpportunityPage(props: { params: Promise<{ id: string }> }) {
  const user = await requirePermissionPage('opportunity:write');
  const { id } = await props.params;

  const [opp, clients, services, users, leadSources] = await Promise.all([
    prisma.opportunity.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } }),
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
  if (!opp) notFound();

  // O cliente já vinculado precisa estar na lista inicial do seletor
  if (!clients.some((c) => c.id === opp.clientId)) {
    const current = await getClientOption(user, opp.clientId);
    if (current) clients.unshift(current);
  }

  const boundAction = updateOpportunityAction.bind(null, opp.id);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={`Editar ${opp.code}`} subtitle={opp.title} />
      <Card className="p-6">
        <OpportunityForm
          action={boundAction}
          initial={{
            title: opp.title,
            clientId: opp.clientId,
            clientUnitId: opp.clientUnitId,
            primaryContactId: opp.primaryContactId,
            description: opp.description,
            serviceCatalogId: opp.serviceCatalogId,
            discipline: opp.discipline,
            commercialOwnerId: opp.commercialOwnerId,
            technicalOwnerId: opp.technicalOwnerId,
            leadSourceId: opp.leadSourceId,
            estimatedValue: opp.estimatedValue?.toString().replace('.', ',') ?? '',
            probability: opp.probability?.toString().replace('.', ',') ?? '',
            expectedCloseDate: opp.expectedCloseDate ? formatDateBR(opp.expectedCloseDate) : '',
            estimatedDuration: opp.estimatedDuration,
            priority: opp.priority,
            competitors: opp.competitors,
            hiringReason: opp.hiringReason,
            clientNeed: opp.clientNeed,
            nextAction: opp.nextAction,
            nextActionDate: opp.nextActionDate ? formatDateBR(opp.nextActionDate) : '',
            notes: opp.notes,
          }}
          clients={clients}
          services={services}
          users={users}
          leadSources={leadSources}
          submitLabel="Salvar alterações"
        />
      </Card>
    </div>
  );
}
