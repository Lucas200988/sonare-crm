import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { getClient, getClientDeleteBlockers } from '@/server/services/clients';
import { PageHeader, Card, Badge } from '@/components/ui';
import { formatCNPJ, formatCPF, formatPhoneBR, formatCEP } from '@/lib/br';
import { formatDateBR } from '@/lib/dates';
import { formatBRL } from '@/lib/money';
import { ContactsSection } from './contacts-section';
import { UnitsSection } from './units-section';
import { DeleteClientButton } from './delete-client';

export const metadata: Metadata = { title: 'Cliente — SONARE CRM' };

const STATUS_BADGE: Record<string, { color: string; label: string }> = {
  ATIVO: { color: 'green', label: 'Ativo' },
  INATIVO: { color: 'slate', label: 'Inativo' },
  BLOQUEADO: { color: 'red', label: 'Bloqueado' },
};

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{value || '—'}</dd>
    </div>
  );
}

export default async function ClientDetailPage(props: { params: Promise<{ id: string }> }) {
  const user = await requirePermissionPage('client:read');
  const { id } = await props.params;
  const client = await getClient(user, id);
  if (!client) notFound();

  const canWrite = user.permissions.has('client:write');
  const canDelete = user.permissions.has('client:delete');
  // contagem exata: a lista da ficha traz no maximo 10 de cada
  const vinculos = canDelete ? await getClientDeleteBlockers(user, id) : null;
  const badge = STATUS_BADGE[client.status];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={client.legalName}
        subtitle={client.tradeName ?? undefined}
        actions={
          <div className="flex items-center gap-3">
            <Badge color={badge.color}>{badge.label}</Badge>
            {canWrite ? (
              <Link
                href={`/clientes/${client.id}/editar`}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Pencil className="h-4 w-4" aria-hidden /> Editar
              </Link>
            ) : null}
            {canDelete && vinculos ? (
              <DeleteClientButton
                clientId={client.id}
                nome={client.tradeName ?? client.legalName}
                vinculos={[...vinculos.contratos, ...vinculos.projetos]}
              />
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Dados cadastrais</h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Info
              label={client.personType === 'JURIDICA' ? 'CNPJ' : 'CPF'}
              value={client.personType === 'JURIDICA'
                ? (client.cnpj ? formatCNPJ(client.cnpj) : null)
                : (client.cpf ? formatCPF(client.cpf) : null)}
            />
            <Info label="E-mail" value={client.email} />
            <Info label="Telefone" value={client.phone ? formatPhoneBR(client.phone) : null} />
            <Info label="WhatsApp" value={client.whatsapp ? formatPhoneBR(client.whatsapp) : null} />
            <Info label="Segmento" value={client.segment} />
            <Info label="Origem" value={client.leadSource?.name} />
            <Info label="Responsável comercial" value={client.commercialOwner?.name} />
            <Info label="Cliente desde" value={formatDateBR(client.firstContactAt ?? client.createdAt)} />
            <Info
              label="Endereço"
              value={[
                [client.addressStreet, client.addressNumber].filter(Boolean).join(', '),
                client.addressDistrict,
                client.city && `${client.city}/${client.state ?? ''}`,
                client.zipCode && formatCEP(client.zipCode),
              ].filter(Boolean).join(' — ')}
            />
          </dl>
          {client.tags.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {client.tags.map((t) => <Badge key={t} color="blue">{t}</Badge>)}
            </div>
          ) : null}
          {client.notes ? (
            <p className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{client.notes}</p>
          ) : null}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Resumo</h2>
          <dl className="space-y-3">
            <Info label="Oportunidades" value={String(client.opportunities.length)} />
            <Info label="Contratos" value={String(client.contracts.length)} />
            <Info label="Projetos" value={String(client.projects.length)} />
          </dl>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <ContactsSection clientId={client.id} contacts={client.contacts} canWrite={canWrite} />
        </Card>

        <Card className="p-5">
          <UnitsSection clientId={client.id} units={client.units} canWrite={canWrite} />
        </Card>

        <Card className="p-5 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Oportunidades</h2>
            {user.permissions.has('opportunity:write') ? (
              <Link
                href={`/crm/nova?cliente=${client.id}`}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Nova oportunidade
              </Link>
            ) : null}
          </div>
          {client.opportunities.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Nenhuma oportunidade registrada.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Código</th>
                    <th className="py-2 pr-4 font-medium">Título</th>
                    <th className="py-2 pr-4 font-medium">Etapa</th>
                    <th className="py-2 pr-4 font-medium">Valor estimado</th>
                    <th className="py-2 font-medium">Criada em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {client.opportunities.map((o) => (
                    <tr key={o.id}>
                      <td className="py-2.5 pr-4">
                        <Link href={`/crm/${o.id}`} className="font-medium text-slate-900 hover:underline">{o.code}</Link>
                      </td>
                      <td className="py-2.5 pr-4 text-slate-700">{o.title}</td>
                      <td className="py-2.5 pr-4">
                        <Badge color={o.stage.kind === 'GANHA' ? 'green' : o.stage.kind === 'PERDIDA' ? 'red' : 'blue'}>
                          {o.stage.name}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-slate-700">{o.estimatedValue ? formatBRL(o.estimatedValue) : '—'}</td>
                      <td className="py-2.5 text-slate-500">{formatDateBR(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
