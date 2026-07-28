import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import { renderToBuffer } from '@react-pdf/renderer';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { saveFile } from '@/server/storage';
import { generateVerificationCode, verificationUrl } from '@/server/signature';
import { buildContractValues } from '@/server/services/contracts';
import {
  renderClauses, findMissingVariables,
  buildContractingPartyText, buildContractedPartyText,
  type LegalRepresentative,
} from '@/lib/contract-render';
import { CONTRACT_TEMPLATES, type TemplateClause } from '@/config/contract-templates';
import { formatCNPJ, formatCPF, formatPhoneBR } from '@/lib/br';
import { ContractPdf, type ContractPdfData } from '@/server/pdf/contract-pdf';
import type { SessionUser } from '@/server/auth/session';
import type { Prisma } from '@/generated/prisma/client';

/**
 * Gera uma nova versão da minuta em PDF.
 * Cada geração cria uma ContractVersion — o histórico de minutas fica preservado.
 */
export async function generateContractDraft(user: SessionUser, contractId: string) {
  const built = await buildContractValues(user, contractId);
  if (!built) return { error: 'Contrato não encontrado.' };
  const { contract, company, values, clientAddress, companyAddress } = built;

  // Modelo: o vinculado ao contrato ou o padrão do tipo de serviço
  let templateClauses: TemplateClause[];
  let documentTitle: string;
  let preamble: string;

  if (contract.template) {
    templateClauses = contract.template.clauses as unknown as TemplateClause[];
    documentTitle = contract.template.name.toUpperCase();
    preamble = contract.template.preamble ?? '';
    const seed = CONTRACT_TEMPLATES.find((t) => t.kind === contract.template!.kind);
    if (seed) documentTitle = seed.documentTitle;
  } else {
    const fallback = CONTRACT_TEMPLATES[0];
    templateClauses = fallback.clauses;
    documentTitle = fallback.documentTitle;
    preamble = fallback.preamble;
  }

  const missing = findMissingVariables(templateClauses, values);
  const clauses = renderClauses(templateClauses, values);

  const contractingParty = buildContractingPartyText({
    legalName: contract.client.legalName,
    personType: contract.client.personType,
    document: contract.client.cnpj
      ? formatCNPJ(contract.client.cnpj)
      : contract.client.cpf ? formatCPF(contract.client.cpf) : null,
    address: clientAddress || null,
    representativeName: contract.client.contacts[0]?.name ?? null,
    representativeRole: contract.client.contacts[0]?.position ?? null,
    representativeCpf: null,
  });

  const representatives = (company.legalRepresentatives as LegalRepresentative[] | null) ?? [];
  const contractedParty = buildContractedPartyText({
    legalName: company.contractLegalName ?? company.legalName,
    cnpj: company.cnpj ? formatCNPJ(company.cnpj) : null,
    address: companyAddress || null,
    representatives,
  });

  const nextVersion =
    ((await prisma.contractVersion.aggregate({
      where: { contractId },
      _max: { versionNumber: true },
    }))._max.versionNumber ?? 0) + 1;

  const verificationCode = generateVerificationCode();
  const issuedAt = new Date();
  const verifyUrl = verificationUrl(verificationCode);
  const qrPng = await QRCode.toBuffer(verifyUrl, {
    type: 'png', width: 220, margin: 1, color: { dark: '#111111', light: '#ffffff' },
  }).catch(() => null);

  const logoPng = await readFile(
    path.join(process.cwd(), 'public', 'brand', 'logo-horizontal-preto.png'),
  ).catch(() => null);

  const witnesses = (contract.witnesses as Array<{ name?: string; cpf?: string }> | null) ?? [];

  const pdfData: ContractPdfData = {
    logoPng,
    documentTitle,
    contractCode: contract.contractNumber ?? contract.code,
    versionNumber: nextVersion,
    issuedAt,
    contractingParty,
    contractedParty,
    preamble,
    clauses,
    place: company.city ?? 'Cuiabá-MT',
    signers: {
      contractingName: contract.client.legalName,
      contractingDocument: contract.client.cnpj
        ? `CNPJ ${formatCNPJ(contract.client.cnpj)}`
        : contract.client.cpf ? `CPF ${formatCPF(contract.client.cpf)}` : null,
      contractedName: company.contractLegalName ?? company.legalName,
      contractedDocument: company.cnpj ? `CNPJ ${formatCNPJ(company.cnpj)}` : null,
    },
    witnesses,
    company: {
      legalName: company.contractLegalName ?? company.legalName,
      cnpj: company.cnpj ? formatCNPJ(company.cnpj) : null,
      // cidade/UF já vão no próprio endereço; não repetir no rodapé
      address: companyAddress || null,
      city: null,
      state: null,
      phone: company.phone ? formatPhoneBR(company.phone) : null,
      email: company.email,
      website: company.website,
      crea: company.crea,
    },
    signature: {
      verificationCode,
      verificationUrl: verifyUrl,
      qrPng,
      signedAt: issuedAt,
      signerName: user.name,
    },
  };

  const pdfBuffer = await renderToBuffer(<ContractPdf data={pdfData} />);

  const saved = await saveFile({
    companyId: user.companyId,
    entityType: 'contract',
    entityId: contract.id,
    category: 'minuta',
    fileName: `${contract.code}-minuta-V${String(nextVersion).padStart(2, '0')}.pdf`,
    mimeType: 'application/pdf',
    content: Buffer.from(pdfBuffer),
    createdById: user.id,
  });

  const version = await prisma.contractVersion.create({
    data: {
      contractId: contract.id,
      versionNumber: nextVersion,
      pdfAttachmentId: saved.attachmentId,
      variables: values as never,
      verificationCode,
      documentHash: saved.sha256,
      createdById: user.id,
    },
  });

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'generate', entityType: 'contract_version', entityId: version.id,
    after: { contract: contract.code, version: nextVersion },
  });

  return {
    versionId: version.id,
    versionNumber: nextVersion,
    attachmentId: saved.attachmentId,
    verificationCode,
    missingVariables: missing,
  };
}

// ---------- Assinaturas ----------

export async function addSignature(user: SessionUser, contractId: string, input: {
  signerName: string;
  signerRole?: string | null;
  signerEmail?: string | null;
}) {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, companyId: user.companyId, deletedAt: null },
  });
  if (!contract) return { error: 'Contrato não encontrado.' };

  const signature = await prisma.contractSignature.create({
    data: {
      contractId,
      signerName: input.signerName,
      signerRole: input.signerRole || null,
      signerEmail: input.signerEmail || null,
      status: 'pendente',
    },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'create', entityType: 'contract_signature', entityId: signature.id, after: signature,
  });
  return { signature };
}

export async function confirmSignature(user: SessionUser, signatureId: string, signedAt: Date) {
  const signature = await prisma.contractSignature.findFirst({
    where: { id: signatureId, contract: { companyId: user.companyId } },
    include: { contract: { include: { signatures: true } } },
  });
  if (!signature) return { error: 'Assinatura não encontrada.' };

  await prisma.contractSignature.update({
    where: { id: signatureId },
    data: { status: 'assinado', signedAt },
  });

  // Todas assinadas → contrato passa a ASSINADO
  const others = signature.contract.signatures.filter((s) => s.id !== signatureId);
  const allSigned = others.every((s) => s.status === 'assinado');
  if (allSigned) {
    await prisma.contract.update({
      where: { id: signature.contractId },
      data: { status: 'ASSINADO', signedAt, updatedById: user.id },
    });
  }

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'sign', entityType: 'contract', entityId: signature.contractId,
    after: { signer: signature.signerName, signedAt, contractSigned: allSigned },
  });
  return { ok: true as const, contractSigned: allSigned };
}

export async function setContractStatus(user: SessionUser, contractId: string, status: string) {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, companyId: user.companyId, deletedAt: null },
  });
  if (!contract) return { error: 'Contrato não encontrado.' };

  await prisma.contract.update({
    where: { id: contractId },
    data: { status: status as never, updatedById: user.id },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'status_change', entityType: 'contract', entityId: contractId,
    before: { status: contract.status }, after: { status },
  });
  return { ok: true as const };
}

// ---------- Aditivos ----------

export async function createAmendment(user: SessionUser, contractId: string, input: {
  amendmentType: string;
  description: string;
  valueDelta?: string | null;
  newEndDate?: Date | null;
}) {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, companyId: user.companyId, deletedAt: null },
    include: { amendments: { where: { deletedAt: null } } },
  });
  if (!contract) return { error: 'Contrato não encontrado.' };
  if (!['ASSINADO', 'VIGENTE', 'SUSPENSO'].includes(contract.status)) {
    return { error: 'Aditivos só podem ser emitidos para contratos assinados ou vigentes.' };
  }

  const number = contract.amendments.length + 1;
  const amendment = await prisma.contractAmendment.create({
    data: {
      contractId,
      number,
      amendmentType: input.amendmentType as never,
      description: input.description,
      valueDelta: input.valueDelta || null,
      newEndDate: input.newEndDate ?? null,
      createdById: user.id,
    },
  });

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'create', entityType: 'contract_amendment', entityId: amendment.id,
    after: { contract: contract.code, number, type: input.amendmentType },
  });
  return { amendment };
}

/** Aplica o aditivo ao contrato (valor e/ou prazo) e o marca como assinado. */
export async function signAmendment(user: SessionUser, amendmentId: string, signedAt: Date) {
  const amendment = await prisma.contractAmendment.findFirst({
    where: { id: amendmentId, contract: { companyId: user.companyId } },
    include: { contract: true },
  });
  if (!amendment) return { error: 'Aditivo não encontrado.' };
  if (amendment.signedAt) return { error: 'Este aditivo já foi assinado.' };

  const contractData: Prisma.ContractUpdateInput = { updatedById: user.id };
  if (amendment.valueDelta) {
    contractData.totalValue = amendment.contract.totalValue.plus(amendment.valueDelta);
  }
  if (amendment.newEndDate) contractData.endDate = amendment.newEndDate;
  if (amendment.amendmentType === 'SUSPENSAO') contractData.status = 'SUSPENSO';
  if (amendment.amendmentType === 'RETOMADA') contractData.status = 'VIGENTE';
  if (amendment.amendmentType === 'RESCISAO') contractData.status = 'RESCINDIDO';

  await prisma.$transaction([
    prisma.contractAmendment.update({
      where: { id: amendmentId },
      data: { signedAt, status: 'ASSINADO' },
    }),
    prisma.contract.update({ where: { id: amendment.contractId }, data: contractData }),
  ]);

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'sign', entityType: 'contract_amendment', entityId: amendmentId,
    after: { valueDelta: amendment.valueDelta?.toString(), newEndDate: amendment.newEndDate },
  });
  return { ok: true as const };
}
