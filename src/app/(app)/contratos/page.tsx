import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { listContracts, type ContractListFilter } from '@/server/services/contracts';
import { PageHeader, PrimaryLink, Card, EmptyState, Badge, inputCls } from '@/components/ui';
import { formatBRL } from '@/lib/money';
import { formatDateBR } from '@/lib/dates';
import { CONTRACT_STATUS_BADGE } from './status-badge';

export const metadata: Metadata = { title: 'Contratos — SONARE CRM' };

export default async function ContractsPage(props: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermissionPage('contract:read');
  const sp = await props.searchParams;

  const { items, total, page, totalPages } = await listContracts(user, {
    search: sp.q,
    status: (sp.status as ContractListFilter['status']) ?? 'TODOS',
    page: sp.pagina ? Number(sp.pagina) : 1,
  });

  const canWrite = user.permissions.has('contract:write');

  return (
    <div>
      <PageHeader
        title="Contratos"
        subtitle={`${total} contrato(s)`}
        actions={canWrite ? (
          <PrimaryLink href="/contratos/novo"><Plus className="h-4 w-4" aria-hidden /> Novo contrato</PrimaryLink>
        ) : undefined}
      />

      <Card className="mb-4 p-4">
        <form method="get" className="flex flex-wrap gap-3">
          <input
            type="search" name="q" defaultValue={sp.q ?? ''}
            placeholder="Código, número, objeto ou cliente…"
            className={`${inputCls} max-w-xs`}
          />
          <select name="status" defaultValue={sp.status ?? 'TODOS'} className={`${inputCls} max-w-56`} aria-label="Status">
            <option value="TODOS">Todos os status</option>
            <option value="MINUTA">Minuta</option>
            <option value="ENVIADO_AO_CLIENTE">Enviado ao cliente</option>
            <option value="AGUARDANDO_ASSINATURA">Aguardando assinatura</option>
            <option value="VIGENTES">Assinados e vigentes</option>
            <option value="ENCERRADO">Encerrados</option>
            <option value="RESCINDIDO">Rescindidos</option>
          </select>
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Filtrar
          </button>
        </form>
      </Card>

      {items.length === 0 ? (
        <EmptyState
          title="Nenhum contrato encontrado"
          description="Contratos nascem da proposta aceita ou podem ser criados avulsos."
          action={canWrite ? <PrimaryLink href="/contratos/novo"><Plus className="h-4 w-4" aria-hidden /> Novo contrato</PrimaryLink> : undefined}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Objeto</th>
                <th className="px-4 py-3 font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Vigência</th>
                <th className="px-4 py-3 font-medium">Aditivos</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((c) => {
                const badge = CONTRACT_STATUS_BADGE[c.status] ?? CONTRACT_STATUS_BADGE.MINUTA;
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/contratos/${c.id}`} className="font-medium text-slate-900 hover:underline">
                        {c.contractNumber ?? c.code}
                      </Link>
                      {c.proposal ? <p className="text-[11px] text-slate-400">{c.proposal.code}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{c.client.tradeName ?? c.client.legalName}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="line-clamp-1">{c.subject}</span>
                      {c.clientUnit ? <p className="text-[11px] text-slate-400">{c.clientUnit.name}</p> : null}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{formatBRL(c.totalValue)}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {c.startDate ? formatDateBR(c.startDate) : '—'}
                      {c.endDate ? ` a ${formatDateBR(c.endDate)}` : ''}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{c._count.amendments || '—'}</td>
                    <td className="px-4 py-3"><Badge color={badge.color}>{badge.label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Paginação" className="mt-4 flex justify-center gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
            const params = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
            params.set('pagina', String(p));
            return (
              <Link
                key={p}
                href={`/contratos?${params.toString()}`}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${p === page ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
              >
                {p}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
