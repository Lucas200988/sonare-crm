import type { Metadata } from 'next';
import { Plus } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { getBoard, getResumoPorOportunidade } from '@/server/services/opportunities';
import { getEntregasPorOportunidade } from '@/server/services/email-delivery';
import { prisma } from '@/server/db';
import { PageHeader, PrimaryLink, inputCls } from '@/components/ui';
import { KanbanBoard, type BoardCard } from './kanban-board';

export const metadata: Metadata = { title: 'CRM / Pipeline — SONARE CRM' };

export default async function CrmPage(props: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermissionPage('opportunity:read');
  const sp = await props.searchParams;

  const [{ stages, opportunities }, users, lossReasons] = await Promise.all([

    getBoard(user, {
      commercialOwnerId: sp.responsavel || undefined,
      leadSourceId: sp.origem || undefined,
      search: sp.q || undefined,
      includeClosed: true, // colunas de ganho/perda ficam no fim do quadro
    }),
    prisma.user.findMany({
      where: { companyId: user.companyId, active: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.lossReason.findMany({
      where: { companyId: user.companyId, active: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  // dependem dos ids do quadro, então só podem vir depois da consulta acima
  const ids = opportunities.map((o) => o.id);
  const [entregas, resumos] = await Promise.all([
    getEntregasPorOportunidade(user.companyId, ids),
    getResumoPorOportunidade(user.companyId, ids),
  ]);

  const cards: BoardCard[] = opportunities.map((o) => ({
    id: o.id,
    code: o.code,
    title: o.title,
    stageId: o.stageId,
    estimatedValue: o.estimatedValue?.toString() ?? null,
    priority: o.priority,
    nextActionDate: o.nextActionDate?.toISOString() ?? null,
    client: { id: o.client.id, legalName: o.client.legalName, tradeName: o.client.tradeName },
    commercialOwner: o.commercialOwner,
    nextActivity: o.activities[0]
      ? { title: o.activities[0].title, dueAt: o.activities[0].dueAt?.toISOString() ?? null }
      : null,
    resumo: resumos.get(o.id) ?? null,
    entrega: (() => {
      const e = entregas.get(o.id);
      return e ? { ...e, sentAt: e.sentAt.toISOString() } : null;
    })(),
  }));

  const canWrite = user.permissions.has('opportunity:write');

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="CRM / Pipeline"
        subtitle={`${cards.length} oportunidade(s) aberta(s)`}
        actions={canWrite ? (
          <PrimaryLink href="/crm/nova"><Plus className="h-4 w-4" aria-hidden /> Nova oportunidade</PrimaryLink>
        ) : undefined}
      />

      <form method="get" className="mb-4 flex flex-wrap gap-3">
        <input
          type="search" name="q" defaultValue={sp.q ?? ''}
          placeholder="Buscar por título, código ou cliente…"
          className={`${inputCls} max-w-xs`}
        />
        <select name="responsavel" defaultValue={sp.responsavel ?? ''} className={`${inputCls} max-w-52`} aria-label="Responsável">
          <option value="">Todos os responsáveis</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
          Filtrar
        </button>
      </form>

      <KanbanBoard
        stages={stages.map((s) => ({
          id: s.id, name: s.name, kind: s.kind, color: s.color, celebrate: s.celebrate,
        }))}
        cards={cards}
        lossReasons={lossReasons}
        canWrite={canWrite}
      />
    </div>
  );
}
