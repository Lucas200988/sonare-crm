import type { Metadata } from 'next';
import Link from 'next/link';
import { Archive, LayoutGrid, List } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { prisma } from '@/server/db';
import { listBoardProjects, listProjects, type ProjectListFilter } from '@/server/services/projects';
import { PageHeader, Card, EmptyState, Badge, inputCls } from '@/components/ui';
import { formatDateBR } from '@/lib/dates';
import { PROJECT_STATUS_BADGE } from './status-badge';
import { alertaArt } from '@/lib/art-projeto';
import { ProjectBoard } from './project-board';

export const metadata: Metadata = { title: 'Projetos — SONARE CRM' };

export default async function ProjectsPage(props: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermissionPage('project:read');
  const sp = await props.searchParams;
  const canWrite = user.permissions.has('project:write');
  const isList = sp.visao === 'lista';

  const viewToggle = (
    <div className="flex items-center gap-2">
      <Link
        href="/projetos/arquivados"
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
        title="Cartões que saíram do quadro"
      >
        <Archive className="h-3.5 w-3.5" aria-hidden /> Arquivados
      </Link>
      <div className="flex rounded-lg border border-slate-300 p-0.5">
      <Link
        href="/projetos"
        className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium ${!isList ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
      >
        <LayoutGrid className="h-3.5 w-3.5" aria-hidden /> Quadro
      </Link>
      <Link
        href="/projetos?visao=lista"
        className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium ${isList ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
      >
        <List className="h-3.5 w-3.5" aria-hidden /> Lista
      </Link>
      </div>
    </div>
  );

  if (!isList) {
    const [projects, clients] = await Promise.all([
      listBoardProjects(user),
      prisma.client.findMany({
        where: { companyId: user.companyId, deletedAt: null },
        select: { id: true, legalName: true, tradeName: true },
        orderBy: { legalName: 'asc' },
      }),
    ]);

    return (
      <div>
        <PageHeader title="Projetos" subtitle={`${projects.length} projeto(s)`} actions={viewToggle} />
        <ProjectBoard
          projects={projects.map((p) => ({
            id: p.id,
            code: p.code,
            name: p.name,
            status: p.status,
            priority: p.priority,
            contractualDeadline: p.contractualDeadline ? p.contractualDeadline.toISOString() : null,
            folderPath: p.folderPath,
            client: { legalName: p.client.legalName, tradeName: p.client.tradeName },
            members: p.members.map((m) => m.user),
            taskCount: p._count.tasks,
            deliverableCount: p._count.deliverables,
            artAlerta: alertaArt(p.artStatus, p.technicalResponsibilities),
          }))}
          clients={clients}
          canWrite={canWrite}
        />
      </div>
    );
  }

  const { items, total, page, totalPages } = await listProjects(user, {
    search: sp.q,
    status: (sp.status as ProjectListFilter['status']) ?? 'ATIVOS',
    page: sp.pagina ? Number(sp.pagina) : 1,
  });

  return (
    <div>
      <PageHeader title="Projetos" subtitle={`${total} projeto(s)`} actions={viewToggle} />

      <Card className="mb-4 p-4">
        <form method="get" className="flex flex-wrap gap-3">
          <input type="hidden" name="visao" value="lista" />
          <input
            type="search" name="q" defaultValue={sp.q ?? ''}
            placeholder="Código, nome ou cliente…"
            className={`${inputCls} max-w-xs`}
          />
          <select name="status" defaultValue={sp.status ?? 'ATIVOS'} className={`${inputCls} max-w-56`} aria-label="Status">
            <option value="ATIVOS">Ativos</option>
            {/* Arquivados têm tela própria, com busca e o botão de devolver ao quadro */}
            <option value="TODOS">Todos os status</option>
            {Object.entries(PROJECT_STATUS_BADGE).map(([value, { label }]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Filtrar
          </button>
        </form>
      </Card>

      {items.length === 0 ? (
        <EmptyState title="Nenhum projeto encontrado" description="Crie um projeto pelo quadro ou converta um contrato assinado." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Projeto</th>
                <th className="px-4 py-3 font-medium">Responsável técnico</th>
                <th className="px-4 py-3 font-medium">Prazo</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((p) => {
                const badge = PROJECT_STATUS_BADGE[p.status] ?? PROJECT_STATUS_BADGE.AGUARDANDO_INICIO;
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/projetos/${p.id}`} className="font-medium text-slate-900 hover:underline">{p.code}</Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{p.client.tradeName ?? p.client.legalName}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="line-clamp-1">{p.name}</span>
                      <p className="text-[11px] text-slate-400">{p._count.tasks} tarefa(s) · {p._count.deliverables} entregável(is)</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{p.technicalLead?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {p.contractualDeadline ? formatDateBR(p.contractualDeadline) : '—'}
                    </td>
                    <td className="px-4 py-3"><Badge color={badge.color}>{badge.label}</Badge></td>
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
                href={`/projetos?${params.toString()}`}
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
