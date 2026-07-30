import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { listBudgets, type BudgetListFilter } from '@/server/services/budgets';
import { PageHeader, PrimaryLink, Card, EmptyState, Badge, inputCls } from '@/components/ui';
import { formatBRL } from '@/lib/money';
import { formatDateBR } from '@/lib/dates';

import { badgeDoOrcamento } from './status-badge';

export const metadata: Metadata = { title: 'Orçamentos — SONARE CRM' };

export default async function BudgetsPage(props: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermissionPage('budget:read');
  const sp = await props.searchParams;

  const { items, total, page, totalPages } = await listBudgets(user, {
    search: sp.q,
    status: (sp.status as BudgetListFilter['status']) ?? 'TODOS',
    page: sp.pagina ? Number(sp.pagina) : 1,
  });

  const canWrite = user.permissions.has('budget:write');

  return (
    <div>
      <PageHeader
        title="Orçamentos"
        subtitle={`${total} orçamento(s)`}
        actions={canWrite ? (
          <PrimaryLink href="/orcamentos/novo"><Plus className="h-4 w-4" aria-hidden /> Novo orçamento</PrimaryLink>
        ) : undefined}
      />

      <Card className="mb-4 p-4">
        <form method="get" className="flex flex-wrap gap-3">
          <input
            type="search" name="q" defaultValue={sp.q ?? ''}
            placeholder="Código, cliente ou oportunidade…"
            className={`${inputCls} max-w-xs`}
          />
          <select name="status" defaultValue={sp.status ?? 'TODOS'} className={`${inputCls} max-w-56`} aria-label="Status">
            <option value="TODOS">Todos os status</option>
            <option value="A_FAZER">A fazer (rascunho/revisão)</option>
            <option value="AGUARDANDO_RETORNO">Aguardando retorno do cliente</option>
            <option value="APROVACAO_INTERNA">Aprovação interna</option>
            <option value="APROVADO">Aprovado</option>
            <option value="RECUSADO">Recusado</option>
          </select>
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Filtrar
          </button>
        </form>
      </Card>

      {items.length === 0 ? (
        <EmptyState
          title="Nenhum orçamento encontrado"
          description="Crie um orçamento a partir de um cliente ou oportunidade."
          action={canWrite ? <PrimaryLink href="/orcamentos/novo"><Plus className="h-4 w-4" aria-hidden /> Novo orçamento</PrimaryLink> : undefined}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Oportunidade</th>
                <th className="px-4 py-3 font-medium">Versão</th>
                <th className="px-4 py-3 font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Validade</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((b) => {
                const badge = badgeDoOrcamento(b.status, b.currentVersion?.proposals);
                return (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/orcamentos/${b.id}`} className="font-medium text-slate-900 hover:underline">
                        {b.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{b.client.tradeName ?? b.client.legalName}</td>
                    <td className="px-4 py-3 text-slate-500">{b.opportunity ? `${b.opportunity.code}` : '—'}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {b.currentVersion ? `V${String(b.currentVersion.versionNumber).padStart(2, '0')}` : '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {b.currentVersion ? formatBRL(b.currentVersion.total) : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {b.currentVersion?.validUntil ? formatDateBR(b.currentVersion.validUntil) : '—'}
                    </td>
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
                href={`/orcamentos?${params.toString()}`}
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
