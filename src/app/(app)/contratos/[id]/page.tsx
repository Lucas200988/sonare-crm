import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileText } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { getContract } from '@/server/services/contracts';
import { prisma } from '@/server/db';
import { PageHeader, Card, Badge } from '@/components/ui';
import { formatBRL } from '@/lib/money';
import { formatDateBR, formatDateTimeBR } from '@/lib/dates';
import { formatDecimalBR } from '@/lib/parse';
import { CONTRACT_STATUS_BADGE } from '../status-badge';
import { ContractForm, type ContractFormValues } from './contract-form';
import {
  StatusSelect, GenerateDraftButton, SignaturesSection, AmendmentsSection,
  type SignatureRow, type AmendmentRow,
} from './contract-actions';
import { ViewDocumentButton } from '@/components/pdf-viewer';

export const metadata: Metadata = { title: 'Contrato — SONARE CRM' };

const EDITABLE_STATUSES = ['MINUTA', 'EM_REVISAO_INTERNA', 'EM_NEGOCIACAO'];

export default async function ContractDetailPage(props: { params: Promise<{ id: string }> }) {
  const user = await requirePermissionPage('contract:read');
  const { id } = await props.params;

  const [contract, templates] = await Promise.all([
    getContract(user, id),
    prisma.contractTemplate.findMany({
      where: { companyId: user.companyId, active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  if (!contract) notFound();

  const badge = CONTRACT_STATUS_BADGE[contract.status] ?? CONTRACT_STATUS_BADGE.MINUTA;
  const canWrite = user.permissions.has('contract:write');
  const canSign = user.permissions.has('contract:sign');
  const editable = canWrite && EDITABLE_STATUSES.includes(contract.status);
  const vars = (contract.templateVariables as Record<string, string> | null) ?? {};

  const initial: ContractFormValues = {
    subject: contract.subject,
    scope: contract.scope ?? '',
    totalValue: formatDecimalBR(contract.totalValue.toString()),
    contractNumber: contract.contractNumber ?? '',
    templateId: contract.templateId ?? '',
    startDate: contract.startDate ? formatDateBR(contract.startDate) : '',
    endDate: contract.endDate ? formatDateBR(contract.endDate) : '',
    durationDays: contract.durationDays ? String(contract.durationDays) : '',
    paymentTerms: contract.paymentTerms ?? '',
    adjustmentIndex: contract.adjustmentIndex ?? '',
    penalties: contract.penalties ?? '',
    guarantees: contract.guarantees ?? '',
    obligations: contract.obligations ?? '',
    terminationTerms: contract.terminationTerms ?? '',
    jurisdiction: contract.jurisdiction ?? '',
    prazoExecucao: vars.prazoExecucao ?? '',
    formatosEntrega: vars.formatosEntrega ?? '',
    localExecucao: vars.localExecucao ?? '',
    revisoesIncluidas: vars.revisoesIncluidas ?? '',
    valorRevisaoExcedente: vars.valorRevisaoExcedente ?? '',
  };

  const signatures: SignatureRow[] = contract.signatures.map((s) => ({
    id: s.id,
    signerName: s.signerName,
    signerRole: s.signerRole,
    signerEmail: s.signerEmail,
    status: s.status,
    signedAt: s.signedAt?.toISOString() ?? null,
  }));

  const amendments: AmendmentRow[] = contract.amendments.map((a) => ({
    id: a.id,
    number: a.number,
    amendmentType: a.amendmentType,
    description: a.description,
    valueDelta: a.valueDelta ? formatDecimalBR(a.valueDelta.toString()) : null,
    newEndDate: a.newEndDate?.toISOString() ?? null,
    signedAt: a.signedAt?.toISOString() ?? null,
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`${contract.contractNumber ?? contract.code}`}
        subtitle={`${contract.client.legalName} — ${contract.subject}`}
        actions={<Badge color={badge.color}>{badge.label}</Badge>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card className="p-5 lg:col-span-3">
          <ContractForm
            contractId={contract.id}
            initial={initial}
            templates={templates}
            editable={editable}
          />
        </Card>

        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            {canWrite ? <StatusSelect contractId={contract.id} current={contract.status} /> : null}
            <dl className="space-y-2 border-t border-slate-100 pt-3 text-xs">
              <div>
                <dt className="text-slate-500">Cliente</dt>
                <dd>
                  <Link href={`/clientes/${contract.client.id}`} className="font-medium text-slate-900 hover:underline">
                    {contract.client.legalName}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Valor vigente</dt>
                <dd className="font-semibold text-slate-900">{formatBRL(contract.totalValue)}</dd>
              </div>
              {contract.proposal ? (
                <div>
                  <dt className="text-slate-500">Origem</dt>
                  <dd className="text-slate-700">Proposta {contract.proposal.code}</dd>
                </div>
              ) : null}
              {contract.signedAt ? (
                <div>
                  <dt className="text-slate-500">Assinado em</dt>
                  <dd className="text-slate-700">{formatDateBR(contract.signedAt)}</dd>
                </div>
              ) : null}
            </dl>
            {canWrite ? <GenerateDraftButton contractId={contract.id} /> : null}
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Minutas geradas</h2>
            {contract.versions.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhuma minuta gerada ainda.</p>
            ) : (
              <ul className="space-y-2">
                {contract.versions.map((v) => (
                  <li key={v.id} className="rounded-lg border border-slate-200 p-2.5">
                    <p className="text-xs font-semibold text-slate-900">
                      V{String(v.versionNumber).padStart(2, '0')}
                    </p>
                    <p className="text-[11px] text-slate-500">{formatDateTimeBR(v.createdAt)}</p>
                    {v.verificationCode ? (
                      <p className="mt-0.5 font-mono text-[10px] text-slate-400">{v.verificationCode}</p>
                    ) : null}
                    {v.pdfAttachmentId ? (
                      <div className="mt-1.5">
                        <ViewDocumentButton
                          attachmentId={v.pdfAttachmentId}
                          title={`${contract.code} — Minuta V${String(v.versionNumber).padStart(2, '0')}`}
                          fileName={`${contract.code}-minuta-V${String(v.versionNumber).padStart(2, '0')}.pdf`}
                        />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <SignaturesSection
              contractId={contract.id}
              signatures={signatures}
              canWrite={canWrite}
              canSign={canSign}
            />
          </Card>

          <Card className="p-4">
            <AmendmentsSection
              contractId={contract.id}
              amendments={amendments}
              canWrite={canWrite}
              canSign={canSign}
              allowNew={['ASSINADO', 'VIGENTE', 'SUSPENSO'].includes(contract.status)}
            />
          </Card>

          {contract.projects.length > 0 ? (
            <Card className="p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Projetos</h2>
              <ul className="space-y-1 text-xs">
                {contract.projects.map((p) => (
                  <li key={p.id}>
                    <span className="font-medium text-slate-900">{p.code}</span>
                    <span className="ml-1.5 text-slate-500">{p.name}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
