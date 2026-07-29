import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermissionPage } from '@/server/auth/guards';
import { getEquipment } from '@/server/services/equipment';
import { PageHeader, Card, EmptyState, Badge } from '@/components/ui';
import { formatBRL } from '@/lib/money';
import { formatDateBR, formatDateTimeBR } from '@/lib/dates';

export const metadata: Metadata = { title: 'Equipamento — SONARE CRM' };

const MOTIVO: Record<string, string> = {
  OBRA: 'Uso em obra',
  EMPRESTIMO: 'Empréstimo',
  ALUGUEL: 'Aluguel',
  MANUTENCAO: 'Manutenção',
};

export default async function EquipmentDetailPage(props: { params: Promise<{ id: string }> }) {
  const user = await requirePermissionPage('equipment:read');
  const { id } = await props.params;
  const equipment = await getEquipment(user, id);
  if (!equipment) notFound();

  const ficha: Array<[string, string | null]> = [
    ['Marca', equipment.brand],
    ['Modelo', equipment.model],
    ['Nº de série', equipment.serialNumber],
    ['Categoria', equipment.category],
    ['Guardado em', equipment.homeLocation],
    ['Compra', equipment.purchaseDate ? formatDateBR(equipment.purchaseDate) : null],
    ['Valor de compra', equipment.purchaseValue ? formatBRL(equipment.purchaseValue) : null],
    ['Calibração até', equipment.calibrationDueAt ? formatDateBR(equipment.calibrationDueAt) : null],
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={equipment.name}
        subtitle={equipment.code}
        actions={<Link href="/equipamentos" className="text-sm text-slate-600 hover:underline">Voltar</Link>}
      />

      <Card className="mb-4 p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Ficha</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
          {ficha.map(([rotulo, valor]) => (
            <div key={rotulo}>
              <dt className="text-slate-500">{rotulo}</dt>
              <dd className="text-slate-800">{valor ?? '—'}</dd>
            </div>
          ))}
        </dl>
        {equipment.notes ? (
          <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-600">{equipment.notes}</p>
        ) : null}
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">
          Movimentações ({equipment.movements.length})
        </h2>
        {equipment.movements.length === 0 ? (
          <EmptyState title="Sem movimentações" description="Este equipamento ainda não saiu." />
        ) : (
          <ul className="space-y-2">
            {equipment.movements.map((m) => {
              const comQuem = m.holderUser?.name ?? m.holderName ?? '—';
              return (
                <li key={m.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">{comQuem}</p>
                    <Badge color={m.returnedAt ? 'green' : 'blue'}>
                      {m.returnedAt ? 'Devolvido' : 'Em aberto'}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {MOTIVO[m.kind] ?? m.kind} · saída {formatDateTimeBR(m.checkedOutAt)}
                    {m.expectedReturnAt ? ` · previsto ${formatDateBR(m.expectedReturnAt)}` : ''}
                    {m.returnedAt ? ` · devolvido ${formatDateTimeBR(m.returnedAt)}` : ''}
                  </p>
                  {m.project || m.client || m.destination ? (
                    <p className="mt-1 text-[11px] text-slate-600">
                      {m.project ? `Projeto ${m.project.code} — ${m.project.name}. ` : ''}
                      {m.client ? `${m.client.tradeName ?? m.client.legalName}. ` : ''}
                      {m.destination ?? ''}
                    </p>
                  ) : null}
                  {m.conditionOut || m.conditionIn ? (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {m.conditionOut ? `Saiu: ${m.conditionOut}. ` : ''}
                      {m.conditionIn ? `Voltou: ${m.conditionIn}.` : ''}
                    </p>
                  ) : null}
                  {m.notes ? <p className="mt-1 text-[11px] text-slate-500">{m.notes}</p> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
