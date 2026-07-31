import type { Metadata } from 'next';
import { ExportButton } from '@/components/export-button';
import Link from 'next/link';
import { requirePermissionPage } from '@/server/auth/guards';
import { prisma } from '@/server/db';
import { listReceivables, refreshOverdue, type ReceivableFilter } from '@/server/services/finance';
import { PageHeader, Card, EmptyState, Badge, inputCls } from '@/components/ui';
import { formatBRL } from '@/lib/money';
import { formatDateBR } from '@/lib/dates';
import {
  NewReceivable, ReceiveButton, CancelReceivableButton,
  ReverseReceiptButton, DeleteReceivableButton,
} from './receivable-actions';
import { RECEIVABLE_BADGE } from '../status-badge';

export const metadata: Metadata = { title: 'Contas a receber — SONARE CRM' };

export default async function ReceivablesPage(props: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermissionPage('finance:read');
  const sp = await props.searchParams;
  const canWrite = user.permissions.has('finance:write');
  await refreshOverdue(user);

  const [{ items, total, page, totalPages, somaValor }, clients] = await Promise.all([
    listReceivables(user, {
      search: sp.q,
      situacao: (sp.situacao as ReceivableFilter['situacao']) ?? 'ABERTO',
      page: sp.pagina ? Number(sp.pagina) : 1,
    }),
    canWrite
      ? prisma.client.findMany({
          where: { companyId: user.companyId, deletedAt: null },
          select: { id: true, legalName: true, tradeName: true },
          orderBy: { legalName: 'asc' },
        })
      : Promise.resolve([]),
  ]);

  const inicioDia = new Date();
  inicioDia.setHours(0, 0, 0, 0);

  return (
    <div>
      <PageHeader
        title="Contas a receber"
        subtitle={`${total} parcela(s) · ${formatBRL(somaValor)}`}
        actions={<div className="flex items-center gap-2"><ExportButton tipo="receber" />{canWrite ? <NewReceivable clients={clients} /> : null}</div>}
      />

      <Card className="mb-4 p-4">
        <form method="get" className="flex flex-wrap gap-3">
          <input
            type="search" name="q" defaultValue={sp.q ?? ''}
            placeholder="Código, descrição ou cliente…"
            className={`${inputCls} max-w-xs`}
          />
          <select name="situacao" defaultValue={sp.situacao ?? 'ABERTO'} className={`${inputCls} max-w-48`} aria-label="Situação">
            <option value="ABERTO">Em aberto</option>
            <option value="VENCIDO">Vencidas</option>
            <option value="RECEBIDO">Recebidas</option>
            <option value="TODOS">Todas</option>
          </select>
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Filtrar
          </button>
        </form>
      </Card>

      {items.length === 0 ? (
        <EmptyState
          title="Nenhuma parcela encontrada"
          description="As parcelas nascem do contrato assinado ou podem ser lançadas avulsas."
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Vencimento</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Descrição</th>
                <th className="px-4 py-3 text-right font-medium">Valor</th>
                <th className="px-4 py-3 text-right font-medium">Recebido</th>
                <th className="px-4 py-3 font-medium">Situação</th>
                {canWrite ? <th className="px-4 py-3" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((r) => {
                const recebido = r.receipts.reduce((acc, x) => acc + Number(x.amount), 0);
                const saldo = Math.max(0, Number(r.netValue) - recebido);
                const vencida = r.dueDate < inicioDia && r.status !== 'RECEBIDO' && r.status !== 'CANCELADO';
                const badge = RECEIVABLE_BADGE[r.status] ?? RECEIVABLE_BADGE.PREVISTO;

                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className={`px-4 py-3 ${vencida ? 'font-semibold text-red-600' : 'text-slate-700'}`}>
                      {formatDateBR(r.dueDate)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{r.client.tradeName ?? r.client.legalName}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="line-clamp-1">{r.description}</span>
                      <p className="text-[11px] text-slate-400">
                        {r.code}
                        {r.contract ? ` · ${r.contract.code}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">{formatBRL(r.netValue)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {recebido > 0 ? formatBRL(recebido.toFixed(2)) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={vencida ? 'red' : badge.color}>{vencida ? 'Vencida' : badge.label}</Badge>
                    </td>
                    {canWrite ? (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {saldo > 0 && r.status !== 'CANCELADO' ? (
                            <ReceiveButton
                              receivableId={r.id}
                              saldo={saldo.toFixed(2)}
                              cliente={r.client.tradeName ?? r.client.legalName}
                            />
                          ) : null}
                          {recebido === 0 && r.status !== 'CANCELADO' ? (
                            <CancelReceivableButton receivableId={r.id} />
                          ) : null}
                          {recebido > 0 ? (
                            <ReverseReceiptButton receivableId={r.id} valor={recebido.toFixed(2)} />
                          ) : null}
                          {recebido === 0 ? (
                            <DeleteReceivableButton receivableId={r.id} />
                          ) : null}
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
                href={`/financeiro/receber?${params.toString()}`}
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
