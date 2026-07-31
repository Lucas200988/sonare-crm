import 'server-only';
import { htmlToText, isEmptyRich } from '@/lib/html-text';
import { formatBRL } from '@/lib/money';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { renderToBuffer } from '@react-pdf/renderer';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { nextCode } from '@/server/services/sequence';
import QRCode from 'qrcode';
import { saveFile, readAttachment } from '@/server/storage';
import { generateVerificationCode, verificationUrl } from '@/server/signature';
import { enviarEmail, layoutEmail, remetenteComCaixa } from '@/server/mail';
import { montarEmailProposta } from '@/server/email-proposta';
import { formatCNPJ, formatCPF, formatCEP, formatPhoneBR } from '@/lib/br';
import { formatDateBR } from '@/lib/dates';
import { codigoProposta, nomeArquivoPrevia, nomeArquivoProposta } from '@/lib/proposta-codigo';
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
      contact: { select: { name: true } },
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

  /*
   * Um número de proposta por orçamento — nunca por versão.
   *
   * Reemitir os mesmos dados só regenera o PDF e soma uma emissão. Se o
   * orçamento ganhou outra versão (renegociação comercial), o número continua
   * o mesmo e o documento passa a "Rev. 01", "Rev. 02"… Numerar de novo criaria
   * documentos distintos para a mesma negociação, confundindo cliente e arquivo.
   */
  const existente = await prisma.proposal.findFirst({
    where: {
      companyId: user.companyId,
      budgetVersion: { budgetId: budget.id },
      deletedAt: null,
    },
    orderBy: { revision: 'desc' },
  });

  const proposal = existente
    ? await prisma.$transaction(async (tx) => {
        const renegociada = existente.budgetVersionId !== budget.currentVersion!.id;
        if (renegociada) {
          await tx.budgetVersion.update({
            where: { id: budget.currentVersion!.id },
            data: { immutable: true },
          });
        }
        return tx.proposal.update({
          where: { id: existente.id },
          data: renegociada
            ? {
                // Documento novo da mesma negociação: revisão sobe e a
                // contagem de emissões recomeça.
                budgetVersionId: budget.currentVersion!.id,
                revision: { increment: 1 },
                emissionCount: 1,
                lastEmittedAt: new Date(),
                signedElectronicallyAt: new Date(),
                signerName,
                signerRegistration,
              }
            : { emissionCount: { increment: 1 }, lastEmittedAt: new Date() },
        });
      })
    : await prisma.$transaction(async (tx) => {
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
            lastEmittedAt: new Date(),
            signerName,
            signerRegistration,
          },
        });
      });

  // Identificação do documento: o número mais "Rev. NN" quando renegociado.
  const rotulo = codigoProposta(proposal.code, proposal.revision);

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
    proposalCode: rotulo,
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
    // O solicitante escolhido no orçamento manda; a oportunidade e o contato
    // principal do cliente são só o palpite inicial.
    responsibleContact:
      budget.contact?.name
      ?? budget.opportunity?.primaryContact?.name
      ?? budget.client.contacts[0]?.name
      ?? null,
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
    generalInfo: cv.generalInfoOverride ?? setting('proposal.infoGerais'),
    differentials: cv.differentialsOverride ?? setting('proposal.diferenciais'),
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

  // O mesmo nome vale para o arquivo guardado e para o download na tela.
  const nomeDoArquivo = nomeArquivoProposta(
    proposal.code, proposal.revision, budget.client.tradeName ?? budget.client.legalName,
  );

  const saved = await saveFile({
    companyId: user.companyId,
    entityType: 'proposal',
    entityId: proposal.id,
    category: 'proposta',
    fileName: nomeDoArquivo,
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
    action: existente ? 'reissue' : 'generate', entityType: 'proposal', entityId: proposal.id,
    after: { code: rotulo, revisao: proposal.revision, budgetCode: budget.code, version: cv.versionNumber, emissao: proposal.emissionCount },
  });

  return {
    proposalId: proposal.id, code: rotulo, attachmentId: saved.attachmentId,
    fileName: nomeDoArquivo,
    emissionCount: proposal.emissionCount, reemitida: Boolean(existente),
  };
}

/**
 * Envia a proposta ao cliente com o PDF anexado e registra o envio.
 *
 * Evita o vaivém de baixar o arquivo e escrever o e-mail à mão — e, como o
 * envio fica registrado, o acompanhamento comercial passa a ser confiável.
 */
export async function sendProposalByEmail(
  user: SessionUser,
  proposalId: string,
  input: { para: string; mensagem?: string | null },
): Promise<{ ok: true } | { error: string }> {
  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, companyId: user.companyId, deletedAt: null },
    include: {
      budgetVersion: {
        include: {
          budget: {
            include: {
              client: { select: { legalName: true, tradeName: true } },
              contact: { select: { name: true } },
              opportunity: { select: { primaryContact: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
  if (!proposal) return { error: 'Proposta não encontrada.' };
  if (!proposal.pdfAttachmentId) return { error: 'Gere o PDF da proposta antes de enviar.' };

  const arquivo = await readAttachment(user.companyId, proposal.pdfAttachmentId);
  if (!arquivo) return { error: 'O PDF da proposta não foi encontrado. Reemita e tente de novo.' };

  const [company, settings] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: user.companyId } }),
    prisma.systemSetting.findMany({
      where: {
        companyId: user.companyId,
        key: { in: ['proposal.signerName', 'proposal.signerTitle', 'proposal.signerPhone'] },
      },
    }),
  ]);
  const setting = (key: string) => {
    const s = settings.find((x) => x.key === key);
    return typeof s?.value === 'string' && s.value.trim() !== '' ? s.value : null;
  };

  const cv = proposal.budgetVersion;
  const budget = cv.budget;
  const cliente = budget.client;
  const nomeCliente = cliente.tradeName ?? cliente.legalName;

  const rotulo = codigoProposta(proposal.code, proposal.revision);
  // prazo em uma linha, sem os hífens de lista do editor
  const prazo = cv.executionDeadline
    ? isEmptyRich(cv.executionDeadline)
      ? null
      : htmlToText(cv.executionDeadline).split('\n')[0].replace(/^-\s*/, '').trim() || null
    : null;

  const { html, texto } = montarEmailProposta({
    codigo: rotulo,
    nomeContato: budget.contact?.name ?? budget.opportunity?.primaryContact?.name ?? null,
    nomeCliente,
    servico: cv.serviceType,
    valorTotal: formatBRL(cv.total.toString()),
    prazo,
    validade: cv.validUntil ? formatDateBR(cv.validUntil) : null,
    mensagem: input.mensagem?.trim() || null,
    urlVisualizar: `${verificationUrl(proposal.verificationCode!)}/pdf`,
    urlBaixar: `${verificationUrl(proposal.verificationCode!)}/pdf?baixar=1`,
    urlAutenticidade: verificationUrl(proposal.verificationCode!),
    assinante: {
      nome: setting('proposal.signerName') ?? user.name,
      titulo: setting('proposal.signerTitle'),
      whatsapp: setting('proposal.signerPhone') ?? (company.whatsapp ? formatPhoneBR(company.whatsapp) : null),
      email: user.email,
      site: company.website,
    },
  });

  const envio = await enviarEmail({
    para: input.para,
    // Caixa com nome de gente do comercial, nao "nao-responda"
    remetente: remetenteComCaixa('orcamentos'),
    // A resposta do cliente ("aprovado", "podemos ajustar o prazo?") vai para
    // quem enviou, não para o endereço de sistema que ninguém lê.
    responderPara: user.email,
    assunto: `Proposta ${rotulo} — ${company.tradeName ?? company.legalName}`,
    texto,
    html,
    anexos: [{
      filename: nomeArquivoProposta(proposal.code, proposal.revision, nomeCliente),
      content: arquivo.content,
      contentType: 'application/pdf',
    }],
  });

  if ('error' in envio) return { error: envio.error };

  // Só registra o envio depois de a mensagem sair, para o histórico não mentir
  await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      // status so avanca de rascunho; enviada/aceita nao regridem ao reenviar
      status: proposal.status === 'RASCUNHO' ? 'ENVIADA' : proposal.status,
      sentAt: new Date(),
      sentVia: 'e-mail',
      recipients: input.para,
    },
  });

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'send', entityType: 'proposal', entityId: proposalId,
    after: { para: input.para },
  });

  return { ok: true };
}

/**
 * Regenera o PDF de uma proposta cujo arquivo sumiu do storage — por troca de
 * ambiente ou limpeza indevida. Não conta como nova emissão: é reparo, e o
 * conteúdo é idêntico porque a versão do orçamento está congelada.
 */
export async function repairProposalPdf(user: SessionUser, attachmentId: string) {
  const proposal = await prisma.proposal.findFirst({
    where: { companyId: user.companyId, pdfAttachmentId: attachmentId, deletedAt: null },
    include: { budgetVersion: { select: { budgetId: true } } },
  });
  if (!proposal) return null;

  const antes = proposal.emissionCount;
  const result = await generateProposal(user, proposal.budgetVersion.budgetId);
  if ('error' in result) return null;

  // desfaz o incremento: reparo não é emissão
  await prisma.proposal.update({
    where: { id: proposal.id },
    data: { emissionCount: antes },
  });
  return result.attachmentId;
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
      contact: { select: { name: true } },
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
    // O solicitante escolhido no orçamento manda; a oportunidade e o contato
    // principal do cliente são só o palpite inicial.
    responsibleContact:
      budget.contact?.name
      ?? budget.opportunity?.primaryContact?.name
      ?? budget.client.contacts[0]?.name
      ?? null,
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
    generalInfo: cv.generalInfoOverride ?? setting('proposal.infoGerais'),
    differentials: cv.differentialsOverride ?? setting('proposal.diferenciais'),
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
  return { pdf: Buffer.from(pdf), fileName: nomeArquivoPrevia(budget.code, budget.client.tradeName ?? budget.client.legalName) };
}

/** Registra evento do ciclo da proposta: envio, visualização, aceite ou recusa. */
/**
 * Etapa do funil correspondente a cada evento da proposta.
 *
 * As etapas são cadastráveis, então a busca é pelo nome e o resultado é
 * opcional: se a empresa renomeou ou removeu a etapa, o cartão simplesmente
 * fica onde está — mover para o lugar errado seria pior que não mover.
 */
const ETAPA_POR_EVENTO: Record<string, string> = {
  ENVIADA: 'Proposta enviada',
  VISUALIZADA: 'Aguardando retorno',
  ACEITA: 'Aprovado',
  RECUSADA: 'Perdido',
};

async function moverCartaoDoPipeline(
  user: SessionUser, opportunityId: string | null, event: string,
) {
  if (!opportunityId) return;
  const nomeEtapa = ETAPA_POR_EVENTO[event];
  if (!nomeEtapa) return;

  const etapa = await prisma.opportunityStage.findFirst({
    where: { companyId: user.companyId, active: true, name: nomeEtapa },
  });
  if (!etapa) return;

  const opp = await prisma.opportunity.findFirst({
    where: { id: opportunityId, companyId: user.companyId, deletedAt: null },
    select: { id: true, stageId: true },
  });
  if (!opp || opp.stageId === etapa.id) return;

  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      stageId: etapa.id,
      // Etapa de fechamento encerra a oportunidade no funil
      closedAt: etapa.kind === 'ABERTA' ? null : new Date(),
      updatedById: user.id,
    },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'stage_change', entityType: 'opportunity', entityId: opportunityId,
    after: { etapa: etapa.name, origem: `proposta ${event.toLowerCase()}` },
  });
}

/**
 * Sincronização inversa: o arrasto do cartão no pipeline atualiza a proposta.
 *
 * O caminho proposta → cartão já existia; sem este, mover o cartão para
 * "Proposta enviada" deixava a aba de orçamentos parada em "Proposta gerada",
 * como se as duas telas falassem de negócios diferentes.
 *
 * O status só anda para frente (gerada → enviada → visualizada → aceita):
 * arrastar o cartão de volta não desfaz um aceite já registrado — correção de
 * status fechado se faz na tela do orçamento, onde fica registrado o porquê.
 */
export async function sincronizarPropostaComEtapa(
  user: SessionUser,
  opportunityId: string,
  etapa: { name: string; kind: string },
) {
  const budget = await prisma.budget.findFirst({
    where: { opportunityId, companyId: user.companyId, deletedAt: null },
    include: {
      currentVersion: {
        include: {
          proposals: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      },
    },
  });
  const proposta = budget?.currentVersion?.proposals[0];
  if (!budget || !proposta) return;

  // Ordem do funil; um evento só é aplicado se avança a proposta.
  const ordem = ['RASCUNHO', 'ENVIADA', 'VISUALIZADA', 'ACEITA'] as const;

  let evento: 'ENVIADA' | 'VISUALIZADA' | 'ACEITA' | 'RECUSADA' | null = null;
  if (etapa.kind === 'PERDIDA') evento = 'RECUSADA';
  else if (etapa.kind === 'GANHA' || etapa.name === 'Aprovado') evento = 'ACEITA';
  else if (etapa.name === 'Aguardando retorno') evento = 'VISUALIZADA';
  else if (etapa.name === 'Proposta enviada') evento = 'ENVIADA';
  if (!evento) return;

  if (evento === 'RECUSADA') {
    if (proposta.status === 'RECUSADA' || proposta.status === 'ACEITA') return;
  } else if (
    ordem.indexOf(evento) <= ordem.indexOf(proposta.status as (typeof ordem)[number])
  ) {
    return; // já está nesse ponto ou além
  }

  const agora = new Date();
  await prisma.proposal.update({
    where: { id: proposta.id },
    data: {
      status: evento,
      ...(evento === 'ENVIADA' ? { sentAt: agora, sentVia: 'pipeline' } : {}),
      // mover direto para "Aguardando retorno"/"Aprovado" implica que foi enviada
      ...(evento !== 'ENVIADA' && !proposta.sentAt ? { sentAt: agora, sentVia: 'pipeline' } : {}),
      ...(evento === 'VISUALIZADA' ? { viewedAt: agora } : {}),
      ...(evento === 'ACEITA' ? { acceptedAt: agora } : {}),
      ...(evento === 'RECUSADA' ? { rejectedAt: agora } : {}),
    },
  });
  if (evento === 'RECUSADA') {
    await prisma.budget.update({
      where: { id: budget.id },
      data: { status: 'RECUSADO', updatedById: user.id },
    });
  }

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: `proposal_${evento.toLowerCase()}`, entityType: 'proposal', entityId: proposta.id,
    after: { origem: `cartão movido para "${etapa.name}"` },
  });
}

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

  await moverCartaoDoPipeline(user, proposal.budgetVersion.budget.opportunityId, event);

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: `proposal_${event.toLowerCase()}`, entityType: 'proposal', entityId: proposalId,
    after: details,
  });
  return { ok: true as const };
}
