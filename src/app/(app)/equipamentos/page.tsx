import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { prisma } from '@/server/db';
import { listEquipment, getEquipmentSummary, type EquipmentFilter } from '@/server/services/equipment';
import { PageHeader, Card, EmptyState, Badge, inputCls } from '@/components/ui';
import { formatDateBR } from '@/lib/dates';
import { formatDecimalBR } from '@/lib/parse';
import {
  NewEquipment, EditEquipmentButton, CheckOutButton, CheckInButton, StatusButton,
} from './equipment-actions';

export const metadata: Metadata = { title: 'Equipamentos — SONARE CRM' };

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  DISPONIVEL: { label: 'Disponível', color: 'green' },
  EM_USO: { label: 'Fora', color: 'blue' },
  MANUTENCAO: { label: 'Manutenção', color: 'amber' },
  BAIXADO: { label: 'Baixado', color: 'slate' },
};

const MOTIVO: Record<string, string> = {
  OBRA: 'obra',
  EMPRESTIMO: 'empréstimo',
  ALUGUEL: 'aluguel',
  MANUTENCAO: 'manutenção',
};

const FILTROS = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'FORA', label: 'Fora' },
  { value: 'DISPONIVEL', label: 'Disponíveis' },
  { value: 'MANUTENCAO', label: 'Manutenção' },
] as const;

export default async function EquipmentPage(props: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermissionPage('equipment:read');
  const sp = await props.searchParams;
  const canWrite = user.permissions.has('equipment:write');
  const statusAtual = sp.status ?? 'TODOS';

  const [items, resumo, projects, clients, users] = await Promise.all([
    listEquipment(user, { search: sp.q, status: statusAtual as EquipmentFilter['status'] }),
    getEquipmentSummary(user),
    prisma.project.findMany({
      where: { companyId: user.companyId, deletedAt: null, archivedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'desc' },
      take: 100,
    }),
    prisma.client.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      select: { id: true, legalName: true, tradeName: true },
      orderBy: { legalName: 'asc' },
      take: 200,
    }),
    prisma.user.findMany({
      where: { companyId: user.companyId, active: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const clientOptions = clients.map((c) => ({ id: c.id, name: c.tradeName ?? c.legalName }));

  return (
    <div>
      <PageHeader
        title="Equipamentos"
        subtitle={`${resumo.total} cadastrado(s) · ${resumo.fora} fora`}
        actions={canWrite ? <NewEquipment /> : null}
      />

      {resumo.atrasados > 0 || resumo.calibracao > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {resumo.atrasados > 0 ? (
            <p className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {resumo.atrasados} equipamento(s) com devolução atrasada.
            </p>
          ) : null}
          {resumo.calibracao > 0 ? (
            <p className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {resumo.calibracao} com calibração vencida.
            </p>
          ) : null}
        </div>
      ) : null}

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input
          name="q" defaultValue={sp.q ?? ''} placeholder="Buscar por nome, modelo ou nº de série…"
          className={`${inputCls} max-w-xs`} aria-label="Buscar equipamento"
        />
        <select name="status" defaultValue={statusAtual} className={`${inputCls} max-w-[10rem]`} aria-label="Filtrar por situação">
          {FILTROS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
          Filtrar
        </button>
      </form>

      {items.length === 0 ? (
        <EmptyState
          title="Nenhum equipamento"
          description="Cadastre os instrumentos para controlar quem está com cada um."
        />
      ) : (
        <div className="space-y-3">
          {items.map((e) => {
            const badge = STATUS_BADGE[e.status] ?? STATUS_BADGE.DISPONIVEL;
            const m = e.movimentoAberto;
            const comQuem = m?.holderUser?.name ?? m?.holderName ?? null;

            return (
              <Card key={e.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {e.name}
                      <span className="ml-2 font-mono text-xs font-normal text-slate-400">{e.code}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {[e.brand, e.model, e.serialNumber ? `nº ${e.serialNumber}` : null]
                        .filter(Boolean).join(' · ') || 'Sem marca/modelo informados'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {e.calibracaoVencida ? <Badge color="red">Calibração vencida</Badge> : null}
                    {e.atrasado ? <Badge color="red">Atrasado</Badge> : null}
                    <Badge color={badge.color}>{badge.label}</Badge>
                  </div>
                </div>

                {m ? (
                  <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    Com <strong>{comQuem}</strong> desde {formatDateBR(m.checkedOutAt)}
                    {' '}({MOTIVO[m.kind] ?? m.kind})
                    {m.project ? (
                      <> · projeto <Link href={`/projetos/${m.project.id}`} className="underline">{m.project.code}</Link></>
                    ) : null}
                    {m.client ? <> · {m.client.tradeName ?? m.client.legalName}</> : null}
                    {m.destination ? <> · {m.destination}</> : null}
                    {m.expectedReturnAt ? (
                      <span className={e.atrasado ? 'font-semibold text-red-700' : ''}>
                        {' '}· devolver até {formatDateBR(m.expectedReturnAt)}
                      </span>
                    ) : null}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    {e.homeLocation ? `Guardado em ${e.homeLocation}.` : 'Sem saída em aberto.'}
                    {e.calibrationDueAt ? ` Calibração até ${formatDateBR(e.calibrationDueAt)}.` : ''}
                  </p>
                )}

                {canWrite ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    {m ? (
                      <CheckInButton movementId={m.id} equipmentName={e.name} />
                    ) : e.status !== 'BAIXADO' ? (
                      <CheckOutButton
                        equipmentId={e.id} equipmentName={e.name}
                        projects={projects} clients={clientOptions} users={users}
                      />
                    ) : null}
                    {!m ? <StatusButton id={e.id} status={e.status} /> : null}
                    <EditEquipmentButton
                      equipment={{
                        id: e.id, name: e.name, brand: e.brand, model: e.model,
                        serialNumber: e.serialNumber, category: e.category,
                        homeLocation: e.homeLocation, notes: e.notes,
                        purchaseDate: e.purchaseDate ? formatDateBR(e.purchaseDate) : '',
                        purchaseValue: e.purchaseValue ? formatDecimalBR(e.purchaseValue.toString()) : '',
                        calibrationDueAt: e.calibrationDueAt ? formatDateBR(e.calibrationDueAt) : '',
                      }}
                    />
                    <Link
                      href={`/equipamentos/${e.id}`}
                      className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      Histórico
                    </Link>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
