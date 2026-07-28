import 'server-only';
import { isEmptyRich } from '@/lib/html-text';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { renderToBuffer } from '@react-pdf/renderer';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { nextCode } from '@/server/services/sequence';
import QRCode from 'qrcode';
import { saveFile } from '@/server/storage';
import { generateVerificationCode, verificationUrl } from '@/server/signature';
import { formatCNPJ, formatCPF, formatCEP, formatPhoneBR } from '@/lib/br';
import { ProposalPdf, type ProposalPdfData } from '@/server/pdf/proposal-pdf';
import type { SessionUser } from '@/server/auth/session';

/**
 * Gera a proposta em PDF a partir da versão corrente de um orçamento APROVADO.
 * Congela a versão (imutável) e registra o documento como anexo.
 */
export async function generateProposal(user: SessionUser, budgetId: string) {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, companyId: user.companyId, deletedAt: null },
    include: {
      client: { include: { contacts: { where: { deletedAt: null, isPrimary: true }, take: 1 } } },
      clientUnit: true,
      commercialOwner: { select: { name: true, creaCau: true } },
      opportunity: { select: { primaryContact: { select: { name: true } } } },
      currentVersion: { include: { items: { orderBy: { sortOrder: 'asc' } } } },
    },
  });
  if (!budget || !budget.currentVersion) return { error: 'Orçamento não encontrado.' };
  if (budget.status !== 'APROVADO') {
    return { error: 'Somente orçamentos aprovados geram proposta. Submeta o orçamento primeiro.' };
  }
  if (budget.currentVersion.items.length === 0) {
    return { error: 'A versão corrente não tem itens.' };
  }

  const company = await prisma.company.findUniqueOrThrow({ where: { id: user.companyId } });
  const settings = await prisma.systemSetting.findMany({
    where: {
      companyId: user.companyId,
      key: {
        in: [
          'proposal.infoGerais', 'proposal.diferenciais',
          'proposal.signerName', 'proposal.signerTitle', 'proposal.signerRegistration',
          'proposal.signerPhone', 'proposal.signerEmail',
        ],
      },
    },
  });
  const setting = (key: string) => {
    const s = settings.find((x) => x.key === key);
    return typeof s?.value === 'string' && s.value.trim() !== '' ? s.value : null;
  };

  // Orçamento sem valor não vira proposta (mesma regra da aprovação)
  if (Number(budget.currentVersion.total) <= 0) {
    return { error: 'O valor total do orçamento está zerado. Informe os preços antes de gerar a proposta.' };
  }
  if (isEmptyRich(budget.currentVersion.scope)) {
    return { error: 'O escopo dos serviços está vazio. Preencha-o antes de gerar a proposta.' };
  }

  const signerName = setting('proposal.signerName') ?? budget.commercialOwner?.name ?? null;
  const signerRegistration =
    setting('proposal.signerRegistration')
    ?? budget.commercialOwner?.creaCau
    ?? (company.crea ? `CREA-${company.crea}` : null);

  const proposal = await prisma.$transaction(async (tx) => {
    const code = await nextCode(user.companyId, 'PROP', tx);
    await tx.budgetVersion.update({
      where: { id: budget.currentVersion!.id },
      data: { immutable: true },
    });
    return tx.proposal.create({
      data: {
        companyId: user.companyId,
        code,
        budgetVersionId: budget.currentVersion!.id,
        createdById: user.id,
        verificationCode: generateVerificationCode(),
        signedElectronicallyAt: new Date(),
        signerName,
        signerRegistration,
      },
    });
  });

  const cv = budget.currentVersion;
  const logoPng = await readFile(
    path.join(process.cwd(), 'public', 'brand', 'logo-horizontal-preto.png'),
  ).catch(() => null);

  // Validade contada a partir da emissão da proposta; respeita data futura já definida
  const validityDaysSetting = await prisma.systemSetting.findUnique({
    where: { companyId_key: { companyId: user.companyId, key: 'proposal.defaultValidityDays' } },
  });
  const validityDays = validityDaysSetting ? Number(validityDaysSetting.value) : 60;
  const issuedAt = proposal.signedElectronicallyAt ?? new Date();
  const validUntil =
    cv.validUntil && cv.validUntil > issuedAt
      ? cv.validUntil
      : new Date(issuedAt.getTime() + validityDays * 24 * 60 * 60 * 1000);
  if (!cv.validUntil || cv.validUntil <= issuedAt) {
    await prisma.budgetVersion.update({ where: { id: cv.id }, data: { validUntil } });
  }

  // QR code do link público de conferência
  const verifyUrl = verificationUrl(proposal.verificationCode!);
  const qrPng = await QRCode.toBuffer(verifyUrl, {
    type: 'png', width: 220, margin: 1,
    color: { dark: '#111111', light: '#ffffff' },
  }).catch(() => null);
  const pdfData: ProposalPdfData = {
    logoPng,
    proposalCode: proposal.code,
    company: {
      legalName: company.legalName,
      cnpj: company.cnpj ? formatCNPJ(company.cnpj) : null,
      email: company.email,
      phone: company.phone ? formatPhoneBR(company.phone) : null,
      website: company.website,
      address: [
        [company.addressStreet, company.addressNumber].filter(Boolean).join(', '),
        company.addressDistrict,
        company.zipCode ? `CEP ${formatCEP(company.zipCode)}` : null,
      ].filter(Boolean).join(' — ') || null,
      city: company.city,
      state: company.state,
      crea: company.crea,
    },
    client: {
      legalName: budget.client.legalName,
      document: budget.client.cnpj
        ? formatCNPJ(budget.client.cnpj)
        : budget.client.cpf
          ? formatCPF(budget.client.cpf)
          : null,
      email: budget.client.email,
    },
    clientUnit: budget.clientUnit?.name ?? null,
    responsibleContact:
      budget.opportunity?.primaryContact?.name ?? budget.client.contacts[0]?.name ?? null,
    budgetCode: budget.code,
    versionNumber: cv.versionNumber,
    issuedAt,
    validUntil,
    serviceType: cv.serviceType,
    scope: cv.scope,
    premises: cv.premises,
    exclusions: cv.exclusions,
    executionDeadline: cv.executionDeadline,
    deliveryMethod: cv.deliveryMethod,
    paymentTerms: cv.paymentTerms,
    clientNotes: cv.clientNotes,
    items: cv.items.map((i) => ({
      description: i.description,
      unit: i.unit,
      quantity: i.quantity.toString(),
      unitPrice: i.unitPrice.toString(),
      total: i.total.toString(),
    })),
    subtotal: cv.subtotal.toString(),
    discount: cv.discount.toString(),
    surcharge: cv.surcharge.toString(),
    total: cv.total.toString(),
    generalInfo: setting('proposal.infoGerais'),
    differentials: setting('proposal.diferenciais'),
    // Assinatura padronizada em Configurações; cai para o responsável comercial se não definida
    signerName,
    signerTitle: setting('proposal.signerTitle'),
    signerRegistration,
    signerPhone: setting('proposal.signerPhone') ?? company.phone,
    signerEmail: setting('proposal.signerEmail') ?? company.email,
    signature: {
      verificationCode: proposal.verificationCode!,
      verificationUrl: verifyUrl,
      qrPng,
      signedAt: issuedAt,
    },
  };

  const pdfBuffer = await renderToBuffer(<ProposalPdf data={pdfData} />);

  const saved = await saveFile({
    companyId: user.companyId,
    entityType: 'proposal',
    entityId: proposal.id,
    category: 'proposta',
    fileName: `${proposal.code}-${budget.code}-V${String(cv.versionNumber).padStart(2, '0')}.pdf`,
    mimeType: 'application/pdf',
    content: Buffer.from(pdfBuffer),
    createdById: user.id,
  });

  await prisma.proposal.update({
    where: { id: proposal.id },
    data: { pdfAttachmentId: saved.attachmentId, documentHash: saved.sha256 },
  });

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'generate', entityType: 'proposal', entityId: proposal.id,
    after: { code: proposal.code, budgetCode: budget.code, version: cv.versionNumber },
  });

  return { proposalId: proposal.id, code: proposal.code, attachmentId: saved.attachmentId };
}

/**
 * Pré-visualização: gera o PDF exatamente como a proposta sairá, porém
 * sem criar registro de proposta, sem congelar a versão e sem consumir
 * numeração. Serve para conferir antes de submeter para aprovação.
 */
export async function previewProposal(
  user: SessionUser,
  budgetId: string,
): Promise<{ pdf: Buffer; fileName: string } | { error: string }> {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, companyId: user.companyId, deletedAt: null },
    include: {
      client: { include: { contacts: { where: { deletedAt: null, isPrimary: true }, take: 1 } } },
      clientUnit: true,
      commercialOwner: { select: { name: true, creaCau: true } },
      opportunity: { select: { primaryContact: { select: { name: true } } } },
      currentVersion: { include: { items: { orderBy: { sortOrder: 'asc' } } } },
    },
  });
  if (!budget || !budget.currentVersion) return { error: 'Orçamento não encontrado.' };
  if (budget.currentVersion.items.length === 0) {
    return { error: 'Adicione ao menos um item para pré-visualizar.' };
  }

  const company = await prisma.company.findUniqueOrThrow({ where: { id: user.companyId } });
  const settings = await prisma.systemSetting.findMany({
    where: {
      companyId: user.companyId,
      key: {
        in: [
          'proposal.infoGerais', 'proposal.diferenciais', 'proposal.defaultValidityDays',
          'proposal.signerName', 'proposal.signerTitle', 'proposal.signerRegistration',
          'proposal.signerPhone', 'proposal.signerEmail',
        ],
      },
    },
  });
  const setting = (key: string) => {
    const s = settings.find((x) => x.key === key);
    return typeof s?.value === 'string' && s.value.trim() !== '' ? s.value : null;
  };

  const cv = budget.currentVersion;
  const logoPng = await readFile(
    path.join(process.cwd(), 'public', 'brand', 'logo-horizontal-preto.png'),
  ).catch(() => null);

  const validityDaysSetting = settings.find((s) => s.key === 'proposal.defaultValidityDays');
  const validityDays = validityDaysSetting ? Number(validityDaysSetting.value) : 60;
  const issuedAt = new Date();
  const validUntil =
    cv.validUntil && cv.validUntil > issuedAt
      ? cv.validUntil
      : new Date(issuedAt.getTime() + validityDays * 24 * 60 * 60 * 1000);

  const pdfData: ProposalPdfData = {
    logoPng,
    proposalCode: 'PRÉ-VISUALIZAÇÃO',
    company: {
      legalName: company.legalName,
      cnpj: company.cnpj ? formatCNPJ(company.cnpj) : null,
      email: company.email,
      phone: company.phone ? formatPhoneBR(company.phone) : null,
      website: company.website,
      address: [
        [company.addressStreet, company.addressNumber].filter(Boolean).join(', '),
        company.addressDistrict,
        company.zipCode ? `CEP ${formatCEP(company.zipCode)}` : null,
      ].filter(Boolean).join(' — ') || null,
      city: company.city,
      state: company.state,
      crea: company.crea,
    },
    client: {
      legalName: budget.client.legalName,
      document: budget.client.cnpj
        ? formatCNPJ(budget.client.cnpj)
        : budget.client.cpf ? formatCPF(budget.client.cpf) : null,
      email: budget.client.email,
    },
    clientUnit: budget.clientUnit?.name ?? null,
    responsibleContact:
      budget.opportunity?.primaryContact?.name ?? budget.client.contacts[0]?.name ?? null,
    budgetCode: budget.code,
    versionNumber: cv.versionNumber,
    issuedAt,
    validUntil,
    serviceType: cv.serviceType,
    scope: cv.scope,
    premises: cv.premises,
    exclusions: cv.exclusions,
    executionDeadline: cv.executionDeadline,
    deliveryMethod: cv.deliveryMethod,
    paymentTerms: cv.paymentTerms,
    clientNotes: cv.clientNotes,
    items: cv.items.map((i) => ({
      description: i.description,
      unit: i.unit,
      quantity: i.quantity.toString(),
      unitPrice: i.unitPrice.toString(),
      total: i.total.toString(),
    })),
    subtotal: cv.subtotal.toString(),
    discount: cv.discount.toString(),
    surcharge: cv.surcharge.toString(),
    total: cv.total.toString(),
    generalInfo: setting('proposal.infoGerais'),
    differentials: setting('proposal.diferenciais'),
    signerName: setting('proposal.signerName') ?? budget.commercialOwner?.name ?? null,
    signerTitle: setting('proposal.signerTitle'),
    signerRegistration:
      setting('proposal.signerRegistration')
      ?? budget.commercialOwner?.creaCau
      ?? (company.crea ? `CREA-${company.crea}` : null),
    signerPhone: setting('proposal.signerPhone') ?? company.phone,
    signerEmail: setting('proposal.signerEmail') ?? company.email,
    // sem selo de assinatura: é rascunho de conferência, não documento emitido
    signature: null,
    watermark: 'PRÉ-VISUALIZAÇÃO',
  };

  const pdf = await renderToBuffer(<ProposalPdf data={pdfData} />);
  return { pdf: Buffer.from(pdf), fileName: `previa-${budget.code}.pdf` };
}

/** Registra evento do ciclo da proposta: envio, visualização, aceite ou recusa. */
export async function registerProposalEvent(
  user: SessionUser,
  proposalId: string,
  event: 'ENVIADA' | 'VISUALIZADA' | 'ACEITA' | 'RECUSADA',
  details?: { sentVia?: string; recipients?: string; rejectionReason?: string; negotiationNotes?: string },
) {
  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, companyId: user.companyId, deletedAt: null },
    include: { budgetVersion: { include: { budget: true } } },
  });
  if (!proposal) return { error: 'Proposta não encontrada.' };

  const now = new Date();
  const data: Record<string, unknown> = { status: event };
  if (event === 'ENVIADA') {
    data.sentAt = now;
    data.sentVia = details?.sentVia ?? null;
    data.recipients = details?.recipients ?? null;
  }
  if (event === 'VISUALIZADA') data.viewedAt = now;
  if (event === 'ACEITA') data.acceptedAt = now;
  if (event === 'RECUSADA') {
    data.rejectedAt = now;
    data.rejectionReason = details?.rejectionReason ?? null;
  }
  if (details?.negotiationNotes) data.negotiationNotes = details.negotiationNotes;

  await prisma.proposal.update({ where: { id: proposalId }, data });

  // Recusa da proposta devolve o orçamento para revisão (nova rodada de negociação)
  if (event === 'RECUSADA') {
    await prisma.budget.update({
      where: { id: proposal.budgetVersion.budgetId },
      data: { status: 'RECUSADO', updatedById: user.id },
    });
  }

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: `proposal_${event.toLowerCase()}`, entityType: 'proposal', entityId: proposalId,
    after: details,
  });
  return { ok: true as const };
}
