import type { Metadata } from 'next';
import { ExportButton } from '@/components/export-button';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { prisma } from '@/server/db';
import { listInvoices } from '@/server/services/finance';
import { PageHeader, Card, EmptyState, Badge, inputCls } from '@/components/ui';
import { formatBRL } from '@/lib/money';
import { formatDateBR } from '@/lib/dates';
import { NewInvoice, CancelInvoiceButton } from './invoice-actions';

export const metadata: Metadata = { title: 'Notas fiscais — SONARE CRM' };

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  REGISTRADA: { label: 'Registrada', color: 'slate' },
  EMITIDA: { label: 'Emitida', color: 'green' },
  ENVIADA: { label: 'Enviada', color: 'blue' },
  CANCELADA: { label: 'Cancelada', color: 'red' },
};

export default async function InvoicesPage(props: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermissionPage('invoice:read');
  const sp = await props.searchParams;
  const canWrite = user.permissions.has('invoice:write');

  const [{ items, total, page, totalPages, somaValor }, clients] = await Promise.all([
    listInvoices(user, {
      search: sp.q,
      status: sp.status ?? 'TODOS',
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

  return (
    <div>
      <PageHeader
        title="Notas fiscais"
        subtitle={`${total} nota(s) · ${formatBRL(somaValor)} líquido`}
        actions={<div className="flex items-center gap-2"><ExportButton tipo="notas" />{canWrite ? <NewInvoice clients={clients} /> : null}</div>}
      />

      <Card className="mb-4 p-4">
        <form method="get" className="flex flex-wrap gap-3">
          <input
            type="search" name="q" defaultValue={sp.q ?? ''}
            placeholder="Número, descrição ou cliente…"
            className={`${inputCls} max-w-xs`}
          />
          <select name="status" defaultValue={sp.status ?? 'TODOS'} className={`${inputCls} max-w-48`} aria-label="Situação">
            <option value="TODOS">Todas</option>
            <option value="EMITIDA">Emitidas</option>
            <option value="ENVIADA">Enviadas</option>
            <option value="CANCELADA">Canceladas</option>
          </select>
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Filtrar
          </button>
        </form>
      </Card>

      <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        O sistema não emite a NFS-e — a emissão continua no portal da prefeitura. Aqui você
        registra a nota emitida e a vincula às parcelas, para o financeiro saber o que já foi faturado.
      </p>

      {items.length === 0 ? (
        <EmptyState
          title="Nenhuma nota registrada"
          description="Registre as notas emitidas para acompanhar o faturamento junto das cobranças."
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Nota</th>
                <th className="px-4 py-3 font-medium">Emissão</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Parcelas</th>
                <th className="px-4 py-3 text-right font-medium">Bruto</th>
                <th className="px-4 py-3 text-right font-medium">Líquido</th>
                <th className="px-4 py-3 font-medium">Situação</th>
                {canWrite ? <th className="px-4 py-3" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((n) => {
                const badge = STATUS_BADGE[n.status] ?? STATUS_BADGE.REGISTRADA;
                return (
                  <tr key={n.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {n.number}{n.series ? `/${n.series}` : ''}
                      {n.externalLink ? (
                        <a
                          href={n.externalLink} target="_blank" rel="noopener noreferrer"
                          className="ml-1.5 inline-flex text-brand hover:underline"
                          aria-label="Abrir nota no portal"
                        >
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDateBR(n.issueDate)}</td>
                    <td className="px-4 py-3 text-slate-700">{n.client.tradeName ?? n.client.legalName}</td>
                    <td className="px-4 py-3 text-[11px] text-slate-500">
                      {n.receivables.length > 0
                        ? n.receivables.map((r) => r.receivable.code).join(', ')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">{formatBRL(n.grossValue)}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">{formatBRL(n.netValue)}</td>
                    <td className="px-4 py-3">
                      <Badge color={badge.color}>{badge.label}</Badge>
                      {n.cancellationReason ? (
                        <p className="text-[11px] text-slate-400">{n.cancellationReason}</p>
                      ) : null}
                    </td>
                    {canWrite ? (
                      <td className="px-4 py-3 text-right">
                        {n.status !== 'CANCELADA' ? <CancelInvoiceButton invoiceId={n.id} /> : null}
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
                href={`/financeiro/notas?${params.toString()}`}
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
