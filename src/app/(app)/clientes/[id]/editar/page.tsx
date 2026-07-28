import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermissionPage } from '@/server/auth/guards';
import { prisma } from '@/server/db';
import { updateClientAction } from '@/actions/clients';
import { PageHeader, Card } from '@/components/ui';
import { ClientForm } from '../../client-form';

export const metadata: Metadata = { title: 'Editar cliente — SONARE CRM' };

export default async function EditClientPage(props: { params: Promise<{ id: string }> }) {
  const user = await requirePermissionPage('client:write');
  const { id } = await props.params;

  const [client, leadSources, users] = await Promise.all([
    prisma.client.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } }),
    prisma.leadSource.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.user.findMany({
      where: { companyId: user.companyId, active: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  if (!client) notFound();

  const boundAction = updateClientAction.bind(null, client.id);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={`Editar: ${client.legalName}`} />
      <Card className="p-6">
        <ClientForm
          action={boundAction}
          initial={{
            ...client,
            personType: client.personType,
            status: client.status,
          }}
          leadSources={leadSources}
          users={users}
          submitLabel="Salvar alterações"
        />
      </Card>
    </div>
  );
}
