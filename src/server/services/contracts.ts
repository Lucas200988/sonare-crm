import 'server-only';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { nextCode } from '@/server/services/sequence';
import { formatCNPJ, formatCPF, formatCEP } from '@/lib/br';
import { formatBRL, valorPorExtenso } from '@/lib/money';
import { formatDateBR } from '@/lib/dates';
import type { Prisma, ContractStatus, AmendmentType } from '@/generated/prisma/client';
import type { SessionUser } from '@/server/auth/session';
import type { TemplateClause } from '@/config/contract-templates';

// ---------- Listagem ----------

export type ContractListFilter = {
  search?: string;
  status?: ContractStatus | 'VIGENTES' | 'TODOS';
  clientId?: string;
  page?: number;
};

export async function listContracts(user: SessionUser, filter: ContractListFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = 20;

  const where: Prisma.ContractWhereInput = { companyId: user.companyId, deletedAt: null };
  if (filter.clientId) where.clientId = filter.clientId;
  if (filter.status && filter.status !== 'TODOS') {
    where.status = filter.status === 'VIGENTES'
      ? { in: ['ASSINADO', 'VIGENTE'] }
      : filter.status;
  }
  if (filter.search) {
    where.OR = [
      { code: { contains: filter.search, mode: 'insensitive' } },
      { contractNumber: { contains: filter.search, mode: 'insensitive' } },
      { subject: { contains: filter.search, mode: 'insensitive' } },
      { client: { legalName: { contains: filter.search, mode: 'insensitive' } } },
    ];
  }

  const [total, items] = await prisma.$transaction([
    prisma.contract.count({ where }),
    prisma.contract.findMany({
      where,
      include: {
        client: { select: { id: true, legalName: true, tradeName: true } },
        clientUnit: { select: { name: true } },
        proposal: { select: { code: true } },
        _count: { select: { amendments: true, versions: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getContract(user: SessionUser, id: string) {
  return prisma.contract.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
    include: {
      client: { include: { contacts: { where: { deletedAt: null } } } },
      clientUnit: true,
      proposal: { include: { budgetVersion: { include: { budget: true } } } },
      budget: { include: { currentVersion: true } },
      template: true,
      versions: { orderBy: { versionNumber: 'desc' } },
      amendments: { where: { deletedAt: null }, orderBy: { number: 'asc' } },
      signatures: { orderBy: { createdAt: 'asc' } },
      projects: { where: { deletedAt: null }, select: { id: true, code: true, name: true, status: true } },
    },
  });
}

// ---------- Conversão proposta → contrato ----------

/**
 * Cria o contrato a partir de uma proposta aceita, herdando cliente, objeto,
 * valor, prazo e condições de pagamento — sem redigitação.
 */
export async function createContractFromProposal(
  user: SessionUser,
  proposalId: string,
  templateId?: string,
) {
  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, companyId: user.companyId, deletedAt: null },
    include: {
      budgetVersion: {
        include: {
          items: { orderBy: { sortOrder: 'asc' } },
          budget: { include: { client: true, clientUnit: true, opportunity: true } },
        },
      },
      contracts: { where: { deletedAt: null } },
    },
  });
  if (!proposal) return { error: 'Proposta não encontrada.' };
  if (proposal.contracts.length > 0) {
    return { error: `Esta proposta já gerou o contrato ${proposal.contracts[0].code}.` };
  }
  if (proposal.status !== 'ACEITA') {
    return { error: 'Somente propostas aceitas pelo cliente podem virar contrato. Registre o aceite primeiro.' };
  }

  const cv = proposal.budgetVersion;
  const budget = cv.budget;

  const company = await prisma.company.findUniqueOrThrow({ where: { id: user.companyId } });

  const contract = await prisma.$transaction(async (tx) => {
    const code = await nextCode(user.companyId, 'CTR', tx);
    return tx.contract.create({
      data: {
        companyId: user.companyId,
        code,
        clientId: budget.clientId,
        clientUnitId: budget.clientUnitId,
        proposalId: proposal.id,
        budgetId: budget.id,
        templateId: templateId ?? null,
        subject: cv.serviceType ?? budget.opportunity?.title ?? 'Prestação de serviços de engenharia',
        scope: cv.scope,
        totalValue: cv.total,
        paymentTerms: cv.paymentTerms,
        durationDays: null,
        jurisdiction: company.city ? `${company.city}, ${company.state ?? ''}`.trim() : null,
        status: 'MINUTA',
        createdById: user.id,
      },
    });
  });

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'create', entityType: 'contract', entityId: contract.id,
    after: { code: contract.code, fromProposal: proposal.code },
  });
  return { contract };
}

/** Contrato avulso, sem proposta de origem. */
export async function createContract(user: SessionUser, input: {
  clientId: string;
  clientUnitId?: string | null;
  templateId?: string | null;
  subject: string;
  totalValue: string;
}) {
  const client = await prisma.client.findFirst({
    where: { id: input.clientId, companyId: user.companyId, deletedAt: null },
  });
  if (!client) return { error: 'Cliente não encontrado.' };

  const company = await prisma.company.findUniqueOrThrow({ where: { id: user.companyId } });

  const contract = await prisma.$transaction(async (tx) => {
    const code = await nextCode(user.companyId, 'CTR', tx);
    return tx.contract.create({
      data: {
        companyId: user.companyId,
        code,
        clientId: input.clientId,
        clientUnitId: input.clientUnitId || null,
        templateId: input.templateId || null,
        subject: input.subject,
        totalValue: input.totalValue,
        jurisdiction: company.city ? `${company.city}, ${company.state ?? ''}`.trim() : null,
        status: 'MINUTA',
        createdById: user.id,
      },
    });
  });

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'create', entityType: 'contract', entityId: contract.id, after: contract,
  });
  return { contract };
}

// ---------- Edição ----------

export type ContractInput = {
  subject: string;
  scope?: string | null;
  totalValue: string;
  startDate?: Date | null;
  endDate?: Date | null;
  durationDays?: number | null;
  paymentTerms?: string | null;
  adjustmentIndex?: string | null;
  penalties?: string | null;
  guarantees?: string | null;
  retentions?: string | null;
  obligations?: string | null;
  terminationTerms?: string | null;
  jurisdiction?: string | null;
  contractNumber?: string | null;
  templateId?: string | null;
  /** Variáveis específicas da minuta (prazo, formatos de entrega, revisões…) */
  variables?: Record<string, string>;
};

const EDITABLE: ContractStatus[] = ['MINUTA', 'EM_REVISAO_INTERNA', 'EM_NEGOCIACAO'];

export async function updateContract(user: SessionUser, id: string, input: ContractInput) {
  const before = await prisma.contract.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
  });
  if (!before) return { error: 'Contrato não encontrado.' };
  if (!EDITABLE.includes(before.status)) {
    return { error: `Contrato em status "${before.status}" não pode ser editado. Gere um aditivo.` };
  }

  const contract = await prisma.contract.update({
    where: { id },
    data: {
      subject: input.subject,
      scope: input.scope,
      totalValue: input.totalValue,
      startDate: input.startDate,
      endDate: input.endDate,
      durationDays: input.durationDays,
      paymentTerms: input.paymentTerms,
      adjustmentIndex: input.adjustmentIndex,
      penalties: input.penalties,
      guarantees: input.guarantees,
      retentions: input.retentions,
      obligations: input.obligations,
      terminationTerms: input.terminationTerms,
      jurisdiction: input.jurisdiction,
      contractNumber: input.contractNumber,
      templateId: input.templateId || null,
      templateVariables: input.variables ? (input.variables as never) : undefined,
      updatedById: user.id,
    },
  });

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'update', entityType: 'contract', entityId: id, before, after: contract,
  });
  return { contract };
}

// ---------- Dados para a minuta ----------

export type ContractRenderData = {
  documentTitle: string;
  preamble: string;
  clauses: TemplateClause[];
  values: Record<string, unknown>;
  contractingParty: string;
  contractedParty: string;
};

/** Monta o dicionário de variáveis a partir do contrato, cliente e empresa. */
export async function buildContractValues(user: SessionUser, contractId: string) {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, companyId: user.companyId, deletedAt: null },
    include: {
      client: { include: { contacts: { where: { deletedAt: null, isContractual: true }, take: 1 } } },
      clientUnit: true,
      template: true,
      budget: { include: { currentVersion: true } },
    },
  });
  if (!contract) return null;

  const company = await prisma.company.findUniqueOrThrow({ where: { id: user.companyId } });
  const extra = (contract.templateVariables as Record<string, string> | null) ?? {};

  const clientAddress = [
    [contract.client.addressStreet, contract.client.addressNumber].filter(Boolean).join(', '),
    contract.client.addressDistrict,
    contract.client.city && `${contract.client.city}/${contract.client.state ?? ''}`,
    contract.client.zipCode ? `CEP ${formatCEP(contract.client.zipCode)}` : null,
  ].filter(Boolean).join(', ');

  const companyAddress = [
    [company.addressStreet, company.addressNumber].filter(Boolean).join(', '),
    company.addressComplement,
    company.addressDistrict,
    company.city && `${company.city}/${company.state ?? ''}`,
    company.zipCode ? `CEP ${formatCEP(company.zipCode)}` : null,
  ].filter(Boolean).join(', ');

  const unitAddress = contract.clientUnit
    ? [
        [contract.clientUnit.addressStreet, contract.clientUnit.addressNumber].filter(Boolean).join(', '),
        contract.clientUnit.addressDistrict,
        contract.clientUnit.city && `${contract.clientUnit.city}/${contract.clientUnit.state ?? ''}`,
      ].filter(Boolean).join(', ')
    : null;

  const bank = (company.bankInfo as { pix?: string; bank?: string; agency?: string; account?: string } | null) ?? null;
  const dadosPagamento = bank?.pix
    ? `transferência via Pix para a chave ${bank.pix}`
    : bank?.bank
      ? `transferência bancária para o Banco ${bank.bank}, Ag. ${bank.agency ?? '—'}, C/C ${bank.account ?? '—'}`
      : company.cnpj
        ? `transferência via Pix para a chave CNPJ ${formatCNPJ(company.cnpj)}`
        : 'transferência bancária conforme dados informados pela CONTRATADA';

  const values: Record<string, unknown> = {
    contrato: {
      codigo: contract.code,
      numero: contract.contractNumber ?? contract.code,
      objeto: contract.subject,
      escopo: contract.scope ?? '',
      valorTotal: formatBRL(contract.totalValue),
      valorPorExtenso: valorPorExtenso(contract.totalValue.toString()),
      formaPagamento: contract.paymentTerms ?? '',
      prazoExecucao: extra.prazoExecucao ?? (contract.durationDays ? `${contract.durationDays} dias` : ''),
      formatosEntrega: extra.formatosEntrega ?? 'PDF e DWG',
      localExecucao: extra.localExecucao ?? unitAddress ?? clientAddress,
      revisoesIncluidas: extra.revisoesIncluidas ?? '02 (duas)',
      valorRevisaoExcedente: extra.valorRevisaoExcedente ?? '',
      foro: contract.jurisdiction ?? (company.city ? `${company.city}, ${company.state ?? ''}` : ''),
      dataInicio: contract.startDate ? formatDateBR(contract.startDate) : '',
      dataFim: contract.endDate ? formatDateBR(contract.endDate) : '',
      indiceReajuste: contract.adjustmentIndex ?? 'IGP-M',
    },
    cliente: {
      razaoSocial: contract.client.legalName,
      nomeFantasia: contract.client.tradeName ?? '',
      documento: contract.client.cnpj
        ? formatCNPJ(contract.client.cnpj)
        : contract.client.cpf ? formatCPF(contract.client.cpf) : '',
      endereco: clientAddress,
      cidade: contract.client.city ?? '',
      unidade: contract.clientUnit?.name ?? '',
    },
    empresa: {
      razaoSocial: company.contractLegalName ?? company.legalName,
      cnpj: company.cnpj ? formatCNPJ(company.cnpj) : '',
      endereco: companyAddress,
      crea: company.crea ?? '',
      dadosPagamento,
    },
  };

  return { contract, company, values, clientAddress, companyAddress };
}
