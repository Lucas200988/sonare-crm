import type { Metadata } from 'next';
import { ArrowDownCircle, ArrowUpCircle, CheckCircle2 } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { getReconciliation } from '@/server/services/reconciliation';
import { PageHeader, Card, EmptyState } from '@/components/ui';
import { formatBRL } from '@/lib/money';
import { formatDateBR } from '@/lib/dates';
import { ImportOfxForm, PendingRow } from './reconciliation-actions';

export const metadata: Metadata = { title: 'Conciliação bancária — SONARE CRM' };

export default async function ReconciliationPage() {
  const user = await requirePermissionPage('finance:read');
  const canWrite = user.permissions.has('finance:write');
  const { pendentes, totais, conciliadoAte } = await getReconciliation(user);

  return (
    <div>
      <PageHeader
        title="Conciliação bancária"
        subtitle={
          conciliadoAte
            ? `Extrato conciliado até ${formatDateBR(conciliadoAte)}`
            : 'Importe o primeiro extrato para começar'
        }
      />

      {canWrite ? <div className="mb-4"><ImportOfxForm /></div> : null}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Para revisar</p>
          <p className={`text-2xl font-bold ${totais.pendentes > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
            {totais.pendentes}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Conciliadas</p>
          <p className="text-2xl font-bold text-green-700">{totais.conciliadas}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Ignoradas</p>
          <p className="text-2xl font-bold text-slate-500">{totais.ignoradas}</p>
        </Card>
      </div>

      {pendentes.length === 0 ? (
        <EmptyState
          title="Nada para revisar"
          description="Todas as linhas importadas do extrato têm par no sistema ou foram ignoradas."
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Descrição no extrato</th>
                <th className="px-4 py-3 text-right font-medium">Valor</th>
                {canWrite ? <th className="px-4 py-3 font-medium">Ações</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendentes.map((t) => {
                const entrada = Number(t.amount) > 0;
                return (
                  <tr key={t.id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700">{formatDateBR(t.postedAt)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="line-clamp-2">{t.memo ?? '(sem descrição)'}</span>
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${entrada ? 'text-green-700' : 'text-red-600'}`}>
                      <span className="inline-flex items-center gap-1">
                        {entrada
                          ? <ArrowDownCircle className="h-3.5 w-3.5" aria-hidden />
                          : <ArrowUpCircle className="h-3.5 w-3.5" aria-hidden />}
                        {formatBRL(Math.abs(Number(t.amount)).toFixed(2))}
                      </span>
                    </td>
                    {canWrite ? (
                      <td className="px-4 py-3">
                        <PendingRow id={t.id} entrada={entrada} />
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" aria-hidden />
        Linhas com valor e data batendo com um único lançamento são conciliadas
        sozinhas na importação; aqui fica só o que precisa de decisão.
      </p>
    </div>
  );
}
