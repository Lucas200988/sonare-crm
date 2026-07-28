import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, CalendarClock } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { getFinanceSummary, listReceivables, listPayables } from '@/server/services/finance';
import { PageHeader, Card } from '@/components/ui';
import { formatBRL } from '@/lib/money';
import { formatDateBR } from '@/lib/dates';

export const metadata: Metadata = { title: 'Financeiro — SONARE CRM' };

/** Cartão de indicador: valor grande, contexto pequeno. */
function Indicador({
  titulo, valor, detalhe, tom = 'neutro', href,
}: {
  titulo: string; valor: string; detalhe: string;
  tom?: 'neutro' | 'alerta' | 'positivo'; href?: string;
}) {
  const cores = {
    neutro: 'text-slate-900',
    alerta: 'text-red-600',
    positivo: 'text-green-700',
  }[tom];

  const conteudo = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-bold ${cores}`}>{formatBRL(valor)}</p>
      <p className="mt-0.5 text-xs text-slate-500">{detalhe}</p>
    </>
  );

  if (href) {
    return (
      <Card className="p-4 transition hover:border-slate-300 hover:shadow">
        <Link href={href} className="block">{conteudo}</Link>
      </Card>
    );
  }
  return <Card className="p-4">{conteudo}</Card>;
}

export default async function FinancePage() {
  const user = await requirePermissionPage('finance:read');

  const [resumo, vencidas, aPagarVencidas] = await Promise.all([
    getFinanceSummary(user),
    listReceivables(user, { situacao: 'VENCIDO' }),
    listPayables(user, { situacao: 'VENCIDO' }),
  ]);

  const saldoMes = Number(resumo.receber.recebidoMes) - Number(resumo.pagar.pagoMes);

  return (
    <div>
      <PageHeader title="Financeiro" subtitle="Situação de caixa e vencimentos" />

      <section className="mb-6">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <ArrowDownCircle className="h-4 w-4 text-green-600" aria-hidden /> A receber
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Indicador
            titulo="Vencido"
            valor={resumo.receber.vencidoValor}
            detalhe={`${resumo.receber.vencidoQtd} parcela(s) em atraso`}
            tom={resumo.receber.vencidoQtd > 0 ? 'alerta' : 'neutro'}
            href="/financeiro/receber?situacao=VENCIDO"
          />
          <Indicador
            titulo="Vence em 7 dias"
            valor={resumo.receber.proximoValor}
            detalhe={`${resumo.receber.proximoQtd} parcela(s)`}
            href="/financeiro/receber"
          />
          <Indicador
            titulo="Recebido no mês"
            valor={resumo.receber.recebidoMes}
            detalhe="Baixas confirmadas"
            tom="positivo"
          />
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <ArrowUpCircle className="h-4 w-4 text-red-500" aria-hidden /> A pagar
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Indicador
            titulo="Vencido"
            valor={resumo.pagar.vencidoValor}
            detalhe={`${resumo.pagar.vencidoQtd} conta(s) em atraso`}
            tom={resumo.pagar.vencidoQtd > 0 ? 'alerta' : 'neutro'}
            href="/financeiro/pagar?situacao=VENCIDO"
          />
          <Indicador
            titulo="Vence em 7 dias"
            valor={resumo.pagar.proximoValor}
            detalhe={`${resumo.pagar.proximoQtd} conta(s)`}
            href="/financeiro/pagar"
          />
          <Indicador
            titulo="Pago no mês"
            valor={resumo.pagar.pagoMes}
            detalhe="Saídas confirmadas"
          />
        </div>
      </section>

      <Card className="mb-6 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Resultado do mês</p>
        <p className={`mt-1 text-2xl font-bold ${saldoMes >= 0 ? 'text-green-700' : 'text-red-600'}`}>
          {formatBRL(saldoMes.toFixed(2))}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          Recebido menos pago no mês corrente — pelo caixa, não por competência.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <AlertTriangle className="h-4 w-4 text-red-500" aria-hidden /> Recebimentos em atraso
          </h2>
          {vencidas.items.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma parcela vencida. </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {vencidas.items.slice(0, 6).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-800">{r.client.tradeName ?? r.client.legalName}</p>
                    <p className="truncate text-xs text-slate-500">{r.description}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-slate-900">{formatBRL(r.netValue)}</p>
                    <p className="text-[11px] text-red-600">{formatDateBR(r.dueDate)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link href="/financeiro/receber?situacao=VENCIDO" className="mt-2 inline-block text-xs font-medium text-brand hover:underline">
            Ver todas
          </Link>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <CalendarClock className="h-4 w-4 text-amber-500" aria-hidden /> Contas em atraso
          </h2>
          {aPagarVencidas.items.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma conta vencida.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {aPagarVencidas.items.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-800">{p.description}</p>
                    <p className="truncate text-xs text-slate-500">{p.supplier ?? p.category ?? '—'}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-slate-900">{formatBRL(p.amount)}</p>
                    <p className="text-[11px] text-red-600">{formatDateBR(p.dueDate)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link href="/financeiro/pagar?situacao=VENCIDO" className="mt-2 inline-block text-xs font-medium text-brand hover:underline">
            Ver todas
          </Link>
        </Card>
      </div>
    </div>
  );
}
