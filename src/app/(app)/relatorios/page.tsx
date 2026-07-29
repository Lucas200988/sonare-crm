import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, Clock, TrendingUp, Users } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import {
  getCashFlowSeries, getSalesFunnel, getConversionRate, getProjectsOverview,
  getHoursByProject, getTopClients, getDelinquency,
} from '@/server/services/reports';
import { PageHeader, Card, Badge } from '@/components/ui';
import { formatBRL } from '@/lib/money';
import { formatDateBR } from '@/lib/dates';
import { CashFlowChart, FunnelChart, BandsChart } from './charts';

export const metadata: Metadata = { title: 'Relatórios — SONARE CRM' };

export default async function ReportsPage() {
  const user = await requirePermissionPage('report:read');
  const veFinanceiro = user.permissions.has('finance:read');

  const [fluxo, funil, conversao, projetos, horas, topClientes, inadimplencia] = await Promise.all([
    veFinanceiro ? getCashFlowSeries(user) : Promise.resolve([]),
    getSalesFunnel(user),
    getConversionRate(user),
    getProjectsOverview(user),
    getHoursByProject(user),
    veFinanceiro ? getTopClients(user) : Promise.resolve([]),
    veFinanceiro ? getDelinquency(user) : Promise.resolve([]),
  ]);

  const totalFunil = funil.reduce((acc, e) => acc + Number(e.valor), 0);

  return (
    <div>
      <PageHeader title="Relatórios" subtitle="Indicadores da operação — dados dos últimos 12 meses" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {veFinanceiro ? (
          <Card className="p-5 lg:col-span-2">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">Fluxo de caixa</h2>
            <p className="mb-4 text-xs text-slate-500">
              Recebimentos e pagamentos confirmados, mês a mês.
            </p>
            <CashFlowChart dados={fluxo} />
          </Card>
        ) : null}

        <Card className="p-5">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <TrendingUp className="h-4 w-4 text-brand" aria-hidden /> Funil comercial
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            Oportunidades abertas por etapa · {formatBRL(totalFunil.toFixed(2))} em jogo
          </p>
          <FunnelChart etapas={funil} />
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold text-slate-900">Conversão de propostas</h2>
          <p className="mb-4 text-xs text-slate-500">Considera apenas as já decididas pelo cliente.</p>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900">{conversao.taxa}%</span>
            <span className="text-xs text-slate-500">
              {conversao.aceitas} de {conversao.aceitas + conversao.recusadas} decididas
            </span>
          </div>

          <dl className="mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Emitidas</dt>
              <dd className="text-slate-900">{conversao.emitidas}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Aguardando retorno</dt>
              <dd className="text-slate-900">{conversao.emAberto}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Valor ganho</dt>
              <dd className="font-medium text-green-700">{formatBRL(conversao.valorGanho)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Valor perdido</dt>
              <dd className="text-red-600">{formatBRL(conversao.valorPerdido)}</dd>
            </div>
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold text-slate-900">Carteira de projetos</h2>
          <p className="mb-4 text-xs text-slate-500">
            {projetos.ativos} ativo(s) · {formatBRL(projetos.valorCarteira)} contratados
          </p>

          {projetos.atrasados.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum projeto com prazo vencido.</p>
          ) : (
            <>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-red-600">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                {projetos.atrasados.length} com prazo vencido
              </p>
              <ul className="space-y-1.5">
                {projetos.atrasados.slice(0, 6).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                    <Link href={`/projetos/${p.id}`} className="min-w-0 flex-1 truncate text-slate-700 hover:underline">
                      {p.name}
                    </Link>
                    <span className="shrink-0 text-red-600">
                      {p.contractualDeadline ? formatDateBR(p.contractualDeadline) : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {veFinanceiro ? (
          <Card className="p-5">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden /> Inadimplência
            </h2>
            <p className="mb-4 text-xs text-slate-500">Saldo vencido por tempo de atraso.</p>
            <BandsChart faixas={inadimplencia} />
          </Card>
        ) : null}

        {veFinanceiro ? (
          <Card className="p-5">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Users className="h-4 w-4 text-brand" aria-hidden /> Clientes que mais faturaram
            </h2>
            <p className="mb-4 text-xs text-slate-500">Pelo valor efetivamente recebido.</p>

            {topClientes.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum recebimento registrado ainda.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {topClientes.map((c, i) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-4 shrink-0 text-xs text-slate-400">{i + 1}</span>
                      <span className="truncate text-sm text-slate-700">{c.nome}</span>
                    </span>
                    <span className="shrink-0 text-sm font-medium text-slate-900">{formatBRL(c.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Clock className="h-4 w-4 text-brand" aria-hidden /> Horas por projeto
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            Custo calculado pelo valor/hora cadastrado de cada pessoa em Usuários.
          </p>

          {horas.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nenhuma hora apontada. O apontamento fica na aba Horas do projeto.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 font-medium">Projeto</th>
                    <th className="py-2 text-right font-medium">Horas</th>
                    <th className="py-2 text-right font-medium">Custo</th>
                    <th className="py-2 text-right font-medium">Contrato</th>
                    <th className="py-2 text-right font-medium">Margem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {horas.slice(0, 12).map((h) => {
                    const margem = h.valor > 0 ? ((h.valor - Number(h.custo)) / h.valor) * 100 : null;
                    return (
                      <tr key={h.id}>
                        <td className="py-2">
                          <Link href={`/projetos/${h.id}`} className="text-slate-800 hover:underline">
                            {h.name}
                          </Link>
                          <p className="text-[11px] text-slate-400">{h.code}</p>
                        </td>
                        <td className="py-2 text-right text-slate-700">{h.horas}h</td>
                        <td className="py-2 text-right text-slate-700">{formatBRL(h.custo)}</td>
                        <td className="py-2 text-right text-slate-700">
                          {h.valor > 0 ? formatBRL(h.valor.toFixed(2)) : '—'}
                        </td>
                        <td className="py-2 text-right">
                          {margem === null ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <Badge color={margem < 20 ? 'red' : margem < 40 ? 'amber' : 'green'}>
                              {margem.toFixed(0)}%
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
