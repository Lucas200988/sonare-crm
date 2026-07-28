import type { Metadata } from 'next';
import { requirePermissionPage } from '@/server/auth/guards';
import { prisma } from '@/server/db';
import { createClientAction } from '@/actions/clients';
import { PageHeader, Card } from '@/components/ui';
import { ClientForm } from '../client-form';

export const metadata: Metadata = { title: 'Novo cliente — SONARE CRM' };

export default async function NewClientPage() {
  const user = await requirePermissionPage('client:write');

  const [leadSources, users] = await Promise.all([
    prisma.leadSource.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.user.findMany({
      where: { companyId: user.companyId, active: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Novo cliente" subtitle="Cadastro de pessoa física ou jurídica" />
      <Card className="p-6">
        <ClientForm
          action={createClientAction}
          leadSources={leadSources}
          users={users}
          submitLabel="Cadastrar cliente"
        />
      </Card>
    </div>
  );
}
