import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { listArchivedProjects } from '@/server/services/projects';
import { PageHeader, Card, EmptyState, Badge, inputCls } from '@/components/ui';
import { formatDateBR } from '@/lib/dates';
import { PROJECT_STATUS_BADGE } from '../status-badge';
import { DeleteProjectButton, UnarchiveButton } from './unarchive-button';

export const metadata: Metadata = { title: 'Projetos arquivados — SONARE CRM' };

export default async function ArchivedProjectsPage(props: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermissionPage('project:read');
  const sp = await props.searchParams;
  const canWrite = user.permissions.has('project:write');
  const busca = sp.q?.trim() || undefined;

  const items = await listArchivedProjects(user, busca);

  return (
    <div>
      <PageHeader
        title="Projetos arquivados"
        subtitle={busca ? `${items.length} resultado(s) para “${busca}”` : `${items.length} cartão(ões) fora do quadro`}
        actions={
          <Link
            href="/projetos"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar ao quadro
          </Link>
        }
      />

      <Card className="mb-4 p-4">
        <form method="get" className="flex flex-wrap gap-3">
          <input
            type="search" name="q" defaultValue={sp.q ?? ''}
            placeholder="Código, nome do projeto ou cliente…"
            aria-label="Buscar entre os arquivados"
            className={`${inputCls} max-w-sm`}
          />
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Buscar
          </button>
          {busca ? (
            <Link href="/projetos/arquivados" className="self-center text-sm text-slate-500 hover:underline">
              Limpar
            </Link>
          ) : null}
        </form>
      </Card>

      {items.length === 0 ? (
        <EmptyState
          title={busca ? 'Nada encontrado' : 'Nenhum cartão arquivado'}
          description={
            busca
              ? 'Tente outro termo — a busca cobre código, nome do projeto e cliente.'
              : 'Cartões arquivados pelo quadro aparecem aqui e podem voltar a qualquer momento.'
          }
        />
      ) : (
        <div className="space-y-2">
          {items.map((p) => {
            const badge = PROJECT_STATUS_BADGE[p.status] ?? PROJECT_STATUS_BADGE.AGUARDANDO_INICIO;
            return (
              <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    <Link href={`/projetos/${p.id}`} className="hover:underline">{p.code}</Link>
                    <span className="ml-2 font-normal text-slate-600">{p.name}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {p.client.tradeName ?? p.client.legalName}
                    {p.technicalLead ? ` · ${p.technicalLead.name}` : ''}
                    {' · '}
                    {p._count.tasks} tarefa(s) · {p._count.deliverables} entregável(is)
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Arquivado em {p.archivedAt ? formatDateBR(p.archivedAt) : '—'}
                    {p.contractualDeadline ? ` · prazo contratual ${formatDateBR(p.contractualDeadline)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge color={badge.color}>{badge.label}</Badge>
                  {canWrite ? (
                    <div className="flex flex-col items-end gap-1.5">
                      <UnarchiveButton projectId={p.id} projectName={p.name} />
                      <DeleteProjectButton projectId={p.id} projectName={p.name} />
                    </div>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
