import type { Metadata } from 'next';
import { ExportButton } from '@/components/export-button';
import Link from 'next/link';
import { requirePermissionPage } from '@/server/auth/guards';
import { prisma } from '@/server/db';
import { listPayables, type PayableFilter } from '@/server/services/finance';
import { PageHeader, Card, EmptyState, Badge, inputCls } from '@/components/ui';
import { formatBRL } from '@/lib/money';
import { formatDateBR } from '@/lib/dates';
import { NewPayable, PayButton, ReopenButton, DeletePayableButton } from './payable-actions';
import { PAYABLE_BADGE } from '../status-badge';

export const metadata: Metadata = { title: 'Contas a pagar — SONARE CRM' };

export default async function PayablesPage(props: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermissionPage('finance:read');
  const sp = await props.searchParams;
  const canWrite = user.permissions.has('finance:write');

  const [{ items, total, page, totalPages, somaValor }, projects] = await Promise.all([
    listPayables(user, {
      search: sp.q,
      situacao: (sp.situacao as PayableFilter['situacao']) ?? 'ABERTO',
      page: sp.pagina ? Number(sp.pagina) : 1,
    }),
    canWrite
      ? prisma.project.findMany({
          where: { companyId: user.companyId, deletedAt: null, archivedAt: null },
          select: { id: true, code: true, name: true },
          orderBy: { code: 'desc' },
          take: 100,
        })
      : Promise.resolve([]),
  ]);

  const inicioDia = new Date();
  inicioDia.setHours(0, 0, 0, 0);

  return (
    <div>
      <PageHeader
        title="Contas a pagar"
        subtitle={`${total} conta(s) · ${formatBRL(somaValor)}`}
        actions={<div className="flex items-center gap-2"><ExportButton tipo="pagar" />{canWrite ? <NewPayable projects={projects} /> : null}</div>}
      />

      <Card className="mb-4 p-4">
        <form method="get" className="flex flex-wrap gap-3">
          <input
            type="search" name="q" defaultValue={sp.q ?? ''}
            placeholder="Descrição, fornecedor ou categoria…"
            className={`${inputCls} max-w-xs`}
          />
          <select name="situacao" defaultValue={sp.situacao ?? 'ABERTO'} className={`${inputCls} max-w-48`} aria-label="Situação">
            <option value="ABERTO">Em aberto</option>
            <option value="VENCIDO">Vencidas</option>
            <option value="PAGO">Pagas</option>
            <option value="TODOS">Todas</option>
          </select>
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Filtrar
          </button>
        </form>
      </Card>

      {items.length === 0 ? (
        <EmptyState
          title="Nenhuma conta encontrada"
          description="Lance aqui as despesas da empresa — fornecedores, impostos, aluguel e taxas."
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Vencimento</th>
                <th className="px-4 py-3 font-medium">Descrição</th>
                <th className="px-4 py-3 font-medium">Fornecedor</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 text-right font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Situação</th>
                {canWrite ? <th className="px-4 py-3" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((p) => {
                const vencida = p.status === 'A_PAGAR' && p.dueDate < inicioDia;
                const badge = PAYABLE_BADGE[p.status] ?? PAYABLE_BADGE.A_PAGAR;

                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className={`px-4 py-3 ${vencida ? 'font-semibold text-red-600' : 'text-slate-700'}`}>
                      {formatDateBR(p.dueDate)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <span className="line-clamp-1">{p.description}</span>
                      {p.project ? <p className="text-[11px] text-slate-400">{p.project.code}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.supplier ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{p.category ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {formatBRL(p.amount)}
                      {p.status === 'PAGO' && p.paidAmount && Number(p.paidAmount) !== Number(p.amount) ? (
                        <p className="text-[11px] font-normal text-slate-400">pago {formatBRL(p.paidAmount)}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={vencida ? 'red' : badge.color}>{vencida ? 'Vencida' : badge.label}</Badge>
                      {p.paidAt ? <p className="text-[11px] text-slate-400">{formatDateBR(p.paidAt)}</p> : null}
                    </td>
                    {canWrite ? (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {p.status === 'A_PAGAR' ? (
                            <>
                              <PayButton payableId={p.id} valor={p.amount.toString()} descricao={p.description} />
                              <DeletePayableButton payableId={p.id} />
                            </>
                          ) : (
                            <ReopenButton payableId={p.id} />
                          )}
                        </div>
                      </td>
                    ) : null}
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
                href={`/financeiro/pagar?${params.toString()}`}
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
