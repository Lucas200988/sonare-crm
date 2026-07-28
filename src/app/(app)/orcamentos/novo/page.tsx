import type { Metadata } from 'next';
import { requirePermissionPage } from '@/server/auth/guards';
import { searchClientOptions, getClientOption } from '@/server/services/clients';
import { PageHeader, Card } from '@/components/ui';
import { NewBudgetForm } from './new-budget-form';

export const metadata: Metadata = { title: 'Novo orçamento — SONARE CRM' };

export default async function NewBudgetPage(props: {
  searchParams: Promise<{ cliente?: string; oportunidade?: string }>;
}) {
  const user = await requirePermissionPage('budget:write');
  const sp = await props.searchParams;

  // Carrega os clientes mais recentes; o seletor busca no servidor conforme o usuário digita.
  const clients = await searchClientOptions(user, '');

  // Quando vem de um cliente específico (link da ficha), garante que ele esteja na lista inicial
  if (sp.cliente && !clients.some((c) => c.id === sp.cliente)) {
    const preselected = await getClientOption(user, sp.cliente);
    if (preselected) clients.unshift(preselected);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Novo orçamento"
        subtitle="O código ORC-AAAA-NNN é gerado automaticamente; a primeira versão nasce como rascunho"
      />
      <Card className="p-6">
        <NewBudgetForm
          clients={clients}
          initialClientId={sp.cliente}
          initialOpportunityId={sp.oportunidade}
        />
      </Card>
    </div>
  );
}
