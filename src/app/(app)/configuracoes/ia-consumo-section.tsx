import { Activity } from 'lucide-react';
import { formatUsd } from '@/lib/ia-custo';
import { formatDateTimeBR } from '@/lib/dates';
import type { resumoDeConsumoIa } from '@/server/services/ia-consumo';

type Resumo = Exclude<Awaited<ReturnType<typeof resumoDeConsumoIa>>, { error: string }>;

const custo = (v: number | null) => (v === null ? 'sem estimativa' : formatUsd(v));
const tokens = (v: number) => v.toLocaleString('pt-BR');

/**
 * Consumo de IA do mês — só aparece para quem tem a permissão ai:metrics
 * (concedida por usuário, fora dos papéis). Custos são estimativa pela
 * tabela de preços em src/lib/ia-custo.ts.
 */
export function IaConsumoSection({ resumo }: { resumo: Resumo }) {
  const { mes, ultimasChamadas } = resumo;

  return (
    <div>
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <Activity className="h-4 w-4 text-brand" aria-hidden /> Consumo de IA — mês atual
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Toda chamada de IA do sistema (Jarvis, escopo, revisão) fica registrada. Custo em dólar,
        estimado pela tabela de preços do provedor — visível somente para o seu usuário.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador rotulo="Chamadas" valor={String(mes.chamadas)} />
        <Indicador rotulo="Tokens" valor={tokens(mes.tokens)} />
        <Indicador rotulo="Custo estimado" valor={custo(mes.custoUsd)} destaque />
        <Indicador rotulo="Erros" valor={String(mes.erros)} alerta={mes.erros > 0} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Quebra titulo="Por uso" itens={mes.porCasoDeUso} />
        <Quebra titulo="Por usuário" itens={mes.porUsuario} />
        <Quebra titulo="Por modelo" itens={mes.porModelo} />
      </div>

      {ultimasChamadas.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Últimas chamadas (30 dias)
          </p>
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Quando</th>
                <th className="py-1.5 pr-3 font-medium">Quem</th>
                <th className="py-1.5 pr-3 font-medium">Uso</th>
                <th className="py-1.5 pr-3 font-medium">Modelo</th>
                <th className="py-1.5 pr-3 text-right font-medium">Tokens</th>
                <th className="py-1.5 pr-3 text-right font-medium">Latência</th>
                <th className="py-1.5 text-right font-medium">Custo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ultimasChamadas.map((c, i) => (
                <tr key={i} className={c.status !== 'ok' ? 'text-red-700' : 'text-slate-600'}>
                  <td className="py-1.5 pr-3">{formatDateTimeBR(c.em)}</td>
                  <td className="py-1.5 pr-3">{c.usuario}</td>
                  <td className="py-1.5 pr-3">{c.casoDeUso}{c.status !== 'ok' ? ` (${c.status})` : ''}</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px]">{c.modelo}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{tokens(c.tokens)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{(c.latenciaMs / 1000).toFixed(1)}s</td>
                  <td className="py-1.5 text-right tabular-nums">{c.custoUsd === null ? '—' : formatUsd(c.custoUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-xs text-slate-400">Nenhuma chamada de IA registrada ainda.</p>
      )}
    </div>
  );
}

function Indicador({ rotulo, valor, destaque, alerta }: {
  rotulo: string; valor: string; destaque?: boolean; alerta?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className={`mt-0.5 text-lg font-bold ${alerta ? 'text-red-600' : destaque ? 'text-brand' : 'text-slate-900'}`}>
        {valor}
      </p>
    </div>
  );
}

function Quebra({ titulo, itens }: {
  titulo: string;
  itens: Array<{ chave: string; chamadas: number; tokens: number; custoUsd: number | null }>;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      {itens.length === 0 ? (
        <p className="text-xs text-slate-400">—</p>
      ) : (
        <ul className="space-y-1 text-xs text-slate-600">
          {itens.map((i) => (
            <li key={i.chave} className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate">{i.chave}</span>
              <span className="shrink-0 tabular-nums text-slate-500">
                {i.chamadas}× · {tokens(i.tokens)} tk · {custo(i.custoUsd)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
