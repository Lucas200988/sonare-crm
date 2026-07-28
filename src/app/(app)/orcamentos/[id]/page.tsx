import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileText } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { getBudget, TRIGGER_LABELS } from '@/server/services/budgets';
import { prisma } from '@/server/db';
import { PageHeader, Card, Badge } from '@/components/ui';
import { formatBRL } from '@/lib/money';
import { formatDateBR, formatDateTimeBR } from '@/lib/dates';
import { formatDecimalBR } from '@/lib/parse';
import { getAiConfig } from '@/server/ai/scope-generator';
import { BUDGET_STATUS_BADGE, PROPOSAL_STATUS_BADGE } from '../status-badge';
import { BudgetEditor, type EditorFields, type EditorItem } from './budget-editor';
import {
  SubmitBudgetButton, ApprovalDecision, NewVersionForm,
  GenerateProposalButton, ProposalEventForm, DangerZone, PreviewButton,
} from './flow-actions';
import { ViewDocumentButton } from '@/components/pdf-viewer';

export const metadata: Metadata = { title: 'Orçamento — SONARE CRM' };

export default async function BudgetDetailPage(props: { params: Promise<{ id: string }> }) {
  const user = await requirePermissionPage('budget:read');
  const { id } = await props.params;

  const [budget, services, aiConfig] = await Promise.all([
    getBudget(user, id),
    prisma.serviceCatalog.findMany({
      where: { companyId: user.companyId, active: true, deletedAt: null },
      select: {
        id: true, name: true, unit: true, defaultPrice: true, estimatedCost: true,
        scopeTemplate: true, premisesTemplate: true, exclusionsTemplate: true,
      },
      orderBy: { code: 'asc' },
    }),
    getAiConfig(user.companyId),
  ]);
  if (!budget || !budget.currentVersion) notFound();

  const cv = budget.currentVersion;
  const badge = BUDGET_STATUS_BADGE[budget.status] ?? BUDGET_STATUS_BADGE.RASCUNHO;
  const canWrite = user.permissions.has('budget:write');
  const canApprove = user.permissions.has('budget:approve');
  const canProposal = user.permissions.has('proposal:write');
  const editable = canWrite && !cv.immutable && ['RASCUNHO', 'EM_REVISAO'].includes(budget.status);

  const initialFields: EditorFields = {
    validUntil: cv.validUntil ? formatDateBR(cv.validUntil) : '',
    serviceType: cv.serviceType ?? '',
    scope: cv.scope ?? '',
    premises: cv.premises ?? '',
    exclusions: cv.exclusions ?? '',
    executionDeadline: cv.executionDeadline ?? '',
    deliveryMethod: cv.deliveryMethod ?? '',
    paymentTerms: cv.paymentTerms ?? '',
    discount: formatDecimalBR(cv.discount.toString()),
    surcharge: formatDecimalBR(cv.surcharge.toString()),
    taxes: formatDecimalBR(cv.taxes.toString()),
    estimatedRetentions: formatDecimalBR(cv.estimatedRetentions.toString()),
    internalNotes: cv.internalNotes ?? '',
    clientNotes: cv.clientNotes ?? '',
  };
  const initialItems: EditorItem[] = cv.items.map((i) => ({
    serviceCatalogId: i.serviceCatalogId,
    description: i.description,
    unit: i.unit ?? 'un',
    quantity: formatDecimalBR(i.quantity.toString(), 4).replace(/,?0+$/, '').replace(/,$/, '') || '1',
    unitPrice: formatDecimalBR(i.unitPrice.toString()),
    unitCost: formatDecimalBR(i.unitCost.toString()),
    discount: formatDecimalBR(i.discount.toString()),
  }));

  const allProposals = budget.currentVersion.proposals;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`${budget.code} — V${String(cv.versionNumber).padStart(2, '0')}`}
        subtitle={budget.client.tradeName ?? budget.client.legalName}
        actions={
          <div className="flex items-center gap-3">
            {cv.immutable ? <Badge color="slate">Versão congelada</Badge> : null}
            <Badge color={badge.color}>{badge.label}</Badge>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card className="p-5 lg:col-span-3">
          <BudgetEditor
            budgetId={budget.id}
            editable={editable}
            initialFields={initialFields}
            initialItems={initialItems}
            services={services.map((s) => ({
              id: s.id,
              name: s.name,
              unit: s.unit,
              scopeTemplate: s.scopeTemplate,
              defaultPrice: s.defaultPrice?.toString() ?? null,
              estimatedCost: s.estimatedCost?.toString() ?? null,
            }))}
            aiEnabled={aiConfig.enabled}
            scopeTemplates={services
              .filter((s) => s.scopeTemplate)
              .map((s) => ({
                serviceId: s.id,
                serviceName: s.name,
                label: s.name,
                scope: s.scopeTemplate ?? '',
                premises: s.premisesTemplate ?? '',
                exclusions: s.exclusionsTemplate ?? '',
                unit: s.unit,
                defaultPrice: s.defaultPrice?.toString() ?? null,
              }))}
          />
        </Card>

        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <h2 className="text-sm font-semibold text-slate-900">Fluxo</h2>
            {budget.opportunity ? (
              <p className="text-xs text-slate-500">
                Oportunidade:{' '}
                <Link href={`/crm/${budget.opportunity.id}`} className="font-medium text-slate-700 hover:underline">
                  {budget.opportunity.code}
                </Link>
              </p>
            ) : null}
            <PreviewButton budgetId={budget.id} budgetCode={budget.code} />
            {editable ? <SubmitBudgetButton budgetId={budget.id} /> : null}
            {budget.status === 'APROVACAO_INTERNA' && canApprove ? <ApprovalDecision budgetId={budget.id} /> : null}
            {budget.status === 'APROVACAO_INTERNA' && !canApprove ? (
              <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-700">
                Aguardando aprovação da diretoria.
              </p>
            ) : null}
            {budget.status === 'APROVADO' && canProposal ? (
              <GenerateProposalButton budgetId={budget.id} jaEmitida={allProposals.length > 0} />
            ) : null}
            {canWrite ? <NewVersionForm budgetId={budget.id} /> : null}
            {canWrite ? (
              <DangerZone
                budgetId={budget.id}
                canDelete={allProposals.every((p) => p.status === 'RASCUNHO')}
              />
            ) : null}
          </Card>

          {budget.approvals.length > 0 ? (
            <Card className="p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Aprovações</h2>
              <ul className="space-y-2 text-xs">
                {budget.approvals.map((a) => (
                  <li key={a.id} className="rounded-lg border border-slate-200 p-2">
                    <p className="font-medium text-slate-800">{TRIGGER_LABELS[a.ruleTriggered] ?? a.ruleTriggered}</p>
                    <p className="text-slate-500">
                      {a.status === 'PENDENTE' ? 'Pendente' : `${a.status === 'APROVADA' ? 'Aprovada' : 'Recusada'} por ${a.decidedBy?.name ?? '—'}`}
                      {a.decidedAt ? ` em ${formatDateTimeBR(a.decidedAt)}` : ''}
                    </p>
                    {a.comment ? <p className="mt-1 text-slate-600">“{a.comment}”</p> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Versões</h2>
            <ul className="space-y-1.5 text-xs">
              {budget.versions.map((v) => (
                <li key={v.id} className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${v.id === cv.id ? 'bg-brand-light font-medium text-slate-900' : 'text-slate-600'}`}>
                  <span>
                    V{String(v.versionNumber).padStart(2, '0')}
                    {v.id === cv.id ? ' (atual)' : ''}
                    {v.immutable ? ' 🔒' : ''}
                  </span>
                  <span>{formatBRL(v.total)}</span>
                </li>
              ))}
            </ul>
            {budget.versions.some((v) => v.changeReason) ? (
              <p className="mt-2 text-[10px] text-slate-400">
                Última justificativa: {budget.versions.find((v) => v.changeReason)?.changeReason}
              </p>
            ) : null}
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Propostas desta versão</h2>
            {allProposals.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhuma proposta gerada.</p>
            ) : (
              <ul className="space-y-3">
                {allProposals.map((p) => {
                  const pb = PROPOSAL_STATUS_BADGE[p.status] ?? PROPOSAL_STATUS_BADGE.RASCUNHO;
                  return (
                    <li key={p.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">{p.code}</p>
                        <Badge color={pb.color}>{pb.label}</Badge>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Gerada em {formatDateTimeBR(p.createdAt)}
                        {p.emissionCount > 1
                          ? ` · ${p.emissionCount} emissões${p.lastEmittedAt ? ` (última ${formatDateTimeBR(p.lastEmittedAt)})` : ''}`
                          : ''}
                        {p.sentAt ? ` · enviada ${formatDateBR(p.sentAt)}` : ''}
                        {p.acceptedAt ? ` · aceita ${formatDateBR(p.acceptedAt)}` : ''}
                        {p.rejectedAt ? ` · recusada ${formatDateBR(p.rejectedAt)}` : ''}
                      </p>
                      {p.rejectionReason ? (
                        <p className="mt-1 text-[11px] text-red-600">Motivo: {p.rejectionReason}</p>
                      ) : null}
                      {p.pdfAttachmentId ? (
                        <div className="mt-2">
                          <ViewDocumentButton
                            attachmentId={p.pdfAttachmentId}
                            title={`Proposta ${p.code}`}
                            fileName={`${p.code}.pdf`}
                          />
                        </div>
                      ) : null}
                      {canProposal ? <ProposalEventForm proposalId={p.id} budgetId={budget.id} status={p.status} /> : null}
                      {p.status === 'ACEITA' && user.permissions.has('contract:write') ? (
                        <Link
                          href={`/contratos/novo/de-proposta/${p.id}`}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
                        >
                          Gerar contrato
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
