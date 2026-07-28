import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { getOpportunity, getOpportunityTimeline } from '@/server/services/opportunities';
import { prisma } from '@/server/db';
import { PageHeader, Card, Badge } from '@/components/ui';
import { formatBRL, formatPercent } from '@/lib/money';
import { formatDateBR, formatDateTimeBR } from '@/lib/dates';
import { ActivitiesSection, type ActivityRow } from './activities-section';
import { StageSelect } from './stage-select';

export const metadata: Metadata = { title: 'Oportunidade — SONARE CRM' };

const PRIORITY_BADGE: Record<string, { color: string; label: string }> = {
  BAIXA: { color: 'slate', label: 'Baixa' },
  MEDIA: { color: 'blue', label: 'Média' },
  ALTA: { color: 'amber', label: 'Alta' },
  URGENTE: { color: 'red', label: 'Urgente' },
};

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{value || '—'}</dd>
    </div>
  );
}

export default async function OpportunityDetailPage(props: { params: Promise<{ id: string }> }) {
  const user = await requirePermissionPage('opportunity:read');
  const { id } = await props.params;

  const [opp, timeline, stages, users, lossReasons] = await Promise.all([
    getOpportunity(user, id),
    getOpportunityTimeline(user, id),
    prisma.opportunityStage.findMany({
      where: { companyId: user.companyId, active: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, kind: true },
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
  if (!opp) notFound();

  const canWrite = user.permissions.has('opportunity:write');
  const priority = PRIORITY_BADGE[opp.priority];

  const activityRows: ActivityRow[] = opp.activities.map((a) => ({
    id: a.id,
    activityType: a.activityType,
    title: a.title,
    notes: a.notes,
    status: a.status,
    dueAt: a.dueAt?.toISOString() ?? null,
    completedAt: a.completedAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    responsible: a.responsible,
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`${opp.code} — ${opp.title}`}
        subtitle={opp.client.legalName}
        actions={
          <div className="flex items-center gap-3">
            <Badge color={priority.color}>Prioridade {priority.label}</Badge>
            <Badge color={opp.stage.kind === 'GANHA' ? 'green' : opp.stage.kind === 'PERDIDA' ? 'red' : 'blue'}>
              {opp.stage.name}
            </Badge>
            {canWrite ? (
              <Link
                href={`/crm/${opp.id}/editar`}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Pencil className="h-4 w-4" aria-hidden /> Editar
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Dados da oportunidade</h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Info label="Cliente" value={<Link href={`/clientes/${opp.client.id}`} className="hover:underline">{opp.client.legalName}</Link>} />
            <Info label="Unidade / obra" value={opp.clientUnit?.name} />
            <Info label="Contato" value={opp.primaryContact?.name} />
            <Info label="Serviço" value={opp.serviceCatalog?.name} />
            <Info label="Disciplina" value={opp.discipline} />
            <Info label="Origem" value={opp.leadSource?.name} />
            <Info label="Resp. comercial" value={opp.commercialOwner?.name} />
            <Info label="Resp. técnico" value={opp.technicalOwner?.name} />
            <Info label="Valor estimado" value={opp.estimatedValue ? formatBRL(opp.estimatedValue) : null} />
            <Info label="Probabilidade" value={opp.probability ? formatPercent(opp.probability) : null} />
            <Info label="Previsão de fechamento" value={opp.expectedCloseDate ? formatDateBR(opp.expectedCloseDate) : null} />
            <Info label="Prazo de execução" value={opp.estimatedDuration} />
            <Info label="Criada em" value={formatDateBR(opp.createdAt)} />
            <Info label="Concorrentes" value={opp.competitors} />
            {opp.closedAt ? <Info label="Encerrada em" value={formatDateBR(opp.closedAt)} /> : null}
            {opp.lossReason ? <Info label="Motivo da perda" value={opp.lossReason.name} /> : null}
          </dl>
          {opp.description ? (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Descrição</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{opp.description}</p>
            </div>
          ) : null}
          {opp.clientNeed ? (
            <div className="mt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Necessidade do cliente</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{opp.clientNeed}</p>
            </div>
          ) : null}
          {opp.nextAction ? (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <strong>Próxima ação:</strong> {opp.nextAction}
              {opp.nextActionDate ? ` (${formatDateBR(opp.nextActionDate)})` : ''}
            </p>
          ) : null}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            {canWrite ? (
              <StageSelect
                opportunityId={opp.id}
                currentStageId={opp.stageId}
                stages={stages}
                lossReasons={lossReasons}
              />
            ) : (
              <Info label="Etapa" value={opp.stage.name} />
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Orçamentos</h2>
            {opp.budgets.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum orçamento.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {opp.budgets.map((b) => (
                  <li key={b.id}>
                    <Link href={`/orcamentos/${b.id}`} className="font-medium text-slate-900 hover:underline">
                      {b.code}
                    </Link>
                    <span className="ml-2 text-xs text-slate-500">{b.status}</span>
                  </li>
                ))}
              </ul>
            )}
            {user.permissions.has('budget:write') ? (
              <Link
                href={`/orcamentos/novo?cliente=${opp.client.id}&oportunidade=${opp.id}`}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Criar orçamento
              </Link>
            ) : null}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Histórico de etapas</h2>
            <ol className="space-y-2">
              {timeline.length === 0 ? (
                <li className="text-sm text-slate-500">Sem eventos.</li>
              ) : timeline.map((e) => {
                const after = e.after as { stage?: string } | null;
                return (
                  <li key={e.id} className="border-l-2 border-slate-200 pl-3 text-sm">
                    <p className="text-slate-800">
                      {e.action === 'create' ? 'Oportunidade criada' : `Movida para "${after?.stage ?? '?'}"`}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {e.user?.name ? `${e.user.name} · ` : ''}{formatDateTimeBR(e.createdAt)}
                    </p>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>

        <Card className="p-5 lg:col-span-3">
          <ActivitiesSection
            opportunityId={opp.id}
            activities={activityRows}
            users={users}
            canWrite={user.permissions.has('activity:write')}
          />
        </Card>
      </div>
    </div>
  );
}
