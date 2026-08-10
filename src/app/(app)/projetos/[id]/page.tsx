import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { prisma } from '@/server/db';
import {
  getProject, listAssignableUsers, listTimeEntries,
  listProjectComments, listProjectAttachments,
} from '@/server/services/projects';
import { Card } from '@/components/ui';
import { CardHeader, CardTabs } from './card-header';
import { StagesSection, DeliverablesSection, TimeEntriesSection } from './project-sections';
import { CommentsSection, AttachmentsSection } from './activity-sections';
import { TaskBoard } from './task-board';
import { ProjectFinanceSection } from './finance-section';
import { ArtPanel } from './art-panel';
import { ApprovalPanel } from './approval-panel';
import { ObraPanel } from './obra-panel';
import { getProjectFinance } from '@/server/services/finance';
import { existeAcessoRestrito } from '@/server/auth/project-scope';
import { getAprovacao } from '@/server/services/aprovacoes';

export const metadata: Metadata = { title: 'Projeto — SONARE CRM' };

export default async function ProjectDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermissionPage('project:read');
  const { id } = await props.params;
  const aba = (await props.searchParams).aba ?? 'visao';

  const [project, assignableUsers] = await Promise.all([
    getProject(user, id),
    listAssignableUsers(user),
  ]);
  if (!project) notFound();

  const canWrite = user.permissions.has('project:write');
  const canWriteTasks = user.permissions.has('task:write');
  const canWriteDeliverables = user.permissions.has('deliverable:write');
  const canWriteTime = user.permissions.has('timeentry:write');
  const canApproveTime = user.permissions.has('timeentry:approve');
  const veHoras = canWriteTime || canApproveTime;
  const veFinanceiro = user.permissions.has('finance:read');
  const podeFinanceiro = user.permissions.has('finance:write');

  const [clientUnits, comments, attachments, timeEntries, financeiro, acessoRestrito, processo] = await Promise.all([
    prisma.clientUnit.findMany({
      where: { clientId: project.clientId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    listProjectComments(user, id),
    listProjectAttachments(user, id),
    veHoras ? listTimeEntries(user, id) : Promise.resolve([]),
    veFinanceiro ? getProjectFinance(user, id) : Promise.resolve(null),
    existeAcessoRestrito(user.companyId),
    getAprovacao(user, id),
  ]);

  const stageOptions = project.stages.map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/projetos" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar ao quadro
      </Link>

      <CardHeader
        projectId={project.id}
        code={project.code}
        name={project.name}
        status={project.status}
        priority={project.priority}
        archived={project.archivedAt !== null}
        clientName={project.client.tradeName ?? project.client.legalName}
        contract={project.contract ? { id: project.contract.id, code: project.contract.code } : null}
        contractValue={project.contractValue ? project.contractValue.toString() : null}
        contractualDeadline={project.contractualDeadline ? project.contractualDeadline.toISOString() : null}
        technicalLead={project.technicalLead?.name ?? null}
        members={project.members.map((m) => m.user)}
        responsaveis={[
          project.technicalLead
            ? { ...project.technicalLead, papel: 'Responsável técnico' } : null,
          project.coordinator
            ? { ...project.coordinator, papel: 'Coordenador' } : null,
        ].filter((r) => r !== null)}
        acessoRestrito={acessoRestrito}
        disciplines={project.disciplines}
        folderPath={project.folderPath}
        canWrite={canWrite}
        initial={{
          name: project.name,
          clientUnitId: project.clientUnitId ?? '',
          technicalLeadId: project.technicalLeadId ?? '',
          coordinatorId: project.coordinatorId ?? '',
          disciplines: project.disciplines.join(', '),
          startDate: project.startDate ? project.startDate.toISOString().slice(0, 10) : '',
          contractualDeadline: project.contractualDeadline ? project.contractualDeadline.toISOString().slice(0, 10) : '',
          expectedEndDate: project.expectedEndDate ? project.expectedEndDate.toISOString().slice(0, 10) : '',
          priority: project.priority,
          folderPath: project.folderPath ?? '',
          risks: project.risks ?? '',
          notes: project.notes ?? '',
          memberIds: project.members.map((m) => m.user.id),
        }}
        clientUnits={clientUnits}
        users={assignableUsers}
      />

      <CardTabs
        projectId={project.id}
        current={aba}
        counts={{
          tarefas: project.tasks.length,
          entregaveis: project.deliverables.length,
          arquivos: attachments.length,
          comentarios: comments.length,
        }}
        showHoras={veHoras}
        showFinanceiro={veFinanceiro}
      />

      <div className="mt-4 space-y-4">
        {aba === 'visao' ? (
          <>
            <ArtPanel
              projectId={project.id}
              status={project.artStatus}
              notes={project.artNotes}
              arts={project.technicalResponsibilities.map((t) => ({
                id: t.id, numero: t.number, docType: t.docType, status: t.status,
                issuedAt: t.issuedAt ? t.issuedAt.toISOString() : null,
              }))}
              canWrite={canWrite}
            />
            <ObraPanel
              projectId={project.id}
              config={{
                enabled: project.diaryEnabled,
                siteAddress: project.siteAddress,
                siteLat: project.siteLat,
                siteLng: project.siteLng,
                siteRadiusM: project.siteRadiusM,
              }}
              canWrite={canWrite}
            />
            <ApprovalPanel
              projectId={project.id}
              processo={processo ? {
                id: processo.id,
                orgao: processo.orgao,
                status: processo.status,
                steps: processo.steps.map((s) => ({
                  id: s.id, code: s.code, name: s.name, status: s.status,
                  protocol: s.protocol,
                  protocolAt: s.protocolAt ? s.protocolAt.toISOString() : null,
                  deadlineDays: s.deadlineDays,
                  respondedAt: s.respondedAt ? s.respondedAt.toISOString() : null,
                  chargedAt: s.chargedAt ? s.chargedAt.toISOString() : null,
                  outcome: s.outcome, notes: s.notes,
                })),
              } : null}
              canWrite={canWrite}
            />
            <Card className="p-4">
              <StagesSection
                projectId={project.id}
                stages={project.stages.map((s) => ({
                  id: s.id, name: s.name, status: s.status,
                  startedAt: s.startedAt ? s.startedAt.toISOString() : null,
                  completedAt: s.completedAt ? s.completedAt.toISOString() : null,
                }))}
                canWrite={canWrite}
              />
            </Card>
            <Card className="p-4">
              <CommentsSection
                projectId={project.id}
                comments={comments.map((c) => ({
                  id: c.id, body: c.body,
                  createdAt: c.createdAt.toISOString(), author: c.author,
                }))}
              />
            </Card>
          </>
        ) : null}

        {aba === 'tarefas' ? (
          <Card className="p-4">
            <TaskBoard
              projectId={project.id}
              tasks={project.tasks.map((t) => ({
                id: t.id, title: t.title, status: t.status, priority: t.priority,
                dueAt: t.dueAt ? t.dueAt.toISOString() : null,
                stageId: t.stageId, assignee: t.assignee,
              }))}
              stages={stageOptions}
              users={assignableUsers}
              canWrite={canWriteTasks}
            />
          </Card>
        ) : null}

        {aba === 'entregaveis' ? (
          <Card className="p-4">
            <DeliverablesSection
              projectId={project.id}
              deliverables={project.deliverables.map((d) => ({
                id: d.id, name: d.name, discipline: d.discipline, status: d.status,
                currentRevision: d.currentRevision,
                dueAt: d.dueAt ? d.dueAt.toISOString() : null,
                revisions: d.revisions.map((r) => ({
                  id: r.id, revisionCode: r.revisionCode,
                  revisionDate: r.revisionDate.toISOString(), reason: r.reason,
                })),
              }))}
              stages={stageOptions}
              users={assignableUsers}
              canWrite={canWriteDeliverables}
            />
          </Card>
        ) : null}

        {aba === 'arquivos' ? (
          <Card className="p-4">
            <AttachmentsSection
              projectId={project.id}
              attachments={attachments.map((a) => ({
                id: a.id, fileName: a.fileName, sizeBytes: a.sizeBytes,
                createdAt: a.createdAt.toISOString(),
              }))}
              canWrite={canWrite}
            />
          </Card>
        ) : null}

        {aba === 'financeiro' && financeiro ? (
          <Card className="p-4">
            <ProjectFinanceSection
              projectId={project.id}
              clientId={project.clientId}
              clientName={project.client.tradeName ?? project.client.legalName}
              resumo={financeiro.resumo}
              receivables={financeiro.receivables.map((r) => ({
                id: r.id, code: r.code, description: r.description,
                dueDate: r.dueDate.toISOString(), netValue: r.netValue.toString(),
                status: r.status,
                recebido: r.receipts.reduce((acc, x) => acc + Number(x.amount), 0).toFixed(2),
              }))}
              payables={financeiro.payables.map((p) => ({
                id: p.id, description: p.description, supplier: p.supplier,
                category: p.category,
                dueDate: p.dueDate.toISOString(),
                amount: (p.paidAmount ?? p.amount).toString(), status: p.status,
              }))}
              canWrite={podeFinanceiro}
            />
          </Card>
        ) : null}

        {aba === 'horas' && veHoras ? (
          <Card className="p-4">
            <TimeEntriesSection
              projectId={project.id}
              entries={timeEntries.map((e) => ({
                id: e.id,
                workDate: e.workDate.toISOString(),
                hours: e.hours.toString(),
                description: e.description,
                billable: e.billable,
                approvedAt: e.approvedAt ? e.approvedAt.toISOString() : null,
                user: e.user,
                task: e.task,
              }))}
              canWrite={canWriteTime}
              canApprove={canApproveTime}
            />
          </Card>
        ) : null}
      </div>
    </div>
  );
}
