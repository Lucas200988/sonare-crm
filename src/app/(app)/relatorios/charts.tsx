// Gráficos em SVG puro — evita mais uma biblioteca no pacote para
// visualizações simples como estas.

import { formatBRL } from '@/lib/money';

export type PontoFluxo = {
  mes: string; rotulo: string; entrada: number; saida: number; saldo: number;
};

/** Barras de entrada e saída por mês, com a linha do zero visível. */
export function CashFlowChart({ dados }: { dados: PontoFluxo[] }) {
  const maximo = Math.max(...dados.map((d) => Math.max(d.entrada, d.saida)), 1);
  const largura = 100 / dados.length;

  return (
    <div>
      <svg viewBox="0 0 100 42" className="h-48 w-full" role="img" aria-label="Entradas e saídas por mês">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f} x1="0" x2="100" y1={36 - f * 34} y2={36 - f * 34}
            stroke="#e2e8f0" strokeWidth="0.2"
          />
        ))}
        {dados.map((d, i) => {
          const alturaEntrada = (d.entrada / maximo) * 34;
          const alturaSaida = (d.saida / maximo) * 34;
          const x = i * largura;
          const larguraBarra = largura * 0.32;
          return (
            <g key={d.mes}>
              <rect
                x={x + largura * 0.12} y={36 - alturaEntrada}
                width={larguraBarra} height={alturaEntrada}
                fill="#16a34a" rx="0.3"
              >
                <title>{`${d.rotulo}: entrou ${formatBRL(d.entrada.toFixed(2))}`}</title>
              </rect>
              <rect
                x={x + largura * 0.5} y={36 - alturaSaida}
                width={larguraBarra} height={alturaSaida}
                fill="#dc2626" rx="0.3"
              >
                <title>{`${d.rotulo}: saiu ${formatBRL(d.saida.toFixed(2))}`}</title>
              </rect>
              <text
                x={x + largura / 2} y="40"
                textAnchor="middle" fontSize="2.4" fill="#94a3b8"
              >
                {d.rotulo}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-green-600" aria-hidden /> Entradas
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-red-600" aria-hidden /> Saídas
        </span>
      </div>
    </div>
  );
}

export type EtapaFunil = { etapa: string; cor: string | null; quantidade: number; valor: string };

/** Funil em barras horizontais — largura proporcional ao valor em jogo. */
export function FunnelChart({ etapas }: { etapas: EtapaFunil[] }) {
  const maximo = Math.max(...etapas.map((e) => Number(e.valor)), 1);

  if (etapas.every((e) => e.quantidade === 0)) {
    return <p className="text-sm text-slate-500">Nenhuma oportunidade aberta no pipeline.</p>;
  }

  return (
    <ul className="space-y-2">
      {etapas.map((e) => {
        const largura = Math.max(2, (Number(e.valor) / maximo) * 100);
        return (
          <li key={e.etapa}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-slate-700">{e.etapa}</span>
              <span className="shrink-0 text-slate-500">
                {e.quantidade} · {formatBRL(e.valor)}
              </span>
            </div>
            <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{ width: `${largura}%`, backgroundColor: e.cor ?? '#94a3b8' }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Barra empilhada simples para faixas de inadimplência. */
export function BandsChart({ faixas }: {
  faixas: Array<{ titulo: string; total: string; quantidade: number }>;
}) {
  const total = faixas.reduce((acc, f) => acc + Number(f.total), 0);
  const cores = ['#fbbf24', '#fb923c', '#f87171', '#dc2626'];

  if (total === 0) {
    return <p className="text-sm text-slate-500">Nenhuma parcela vencida em aberto.</p>;
  }

  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full">
        {faixas.map((f, i) => {
          const pct = (Number(f.total) / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={f.titulo}
              style={{ width: `${pct}%`, backgroundColor: cores[i] }}
              title={`${f.titulo}: ${formatBRL(f.total)}`}
            />
          );
        })}
      </div>
      <ul className="mt-3 space-y-1.5">
        {faixas.map((f, i) => (
          <li key={f.titulo} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: cores[i] }} aria-hidden />
              {f.titulo}
            </span>
            <span className="text-slate-800">
              {f.quantidade > 0 ? `${f.quantidade} · ${formatBRL(f.total)}` : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
