import 'server-only';
import { prisma } from '@/server/db';
export { assinaturaValida } from '@/lib/webhook-assinatura';
import { avancaEntrega, resumoEntrega, type StatusEntrega } from '@/lib/entrega-status';
import type { EmailStatus } from '@/generated/prisma/client';

/**
 * Situação de entrega dos e-mails que o sistema manda.
 *
 * Sem isto, errar o e-mail do cliente é falha silenciosa: a proposta consta
 * como enviada, o cliente nunca recebeu, e a equipe fica esperando resposta
 * de quem não tem o que responder.
 *
 * O provedor (Resend) avisa cada mudança por webhook; aqui a mensagem é
 * localizada pelo id que ele devolveu no envio.
 */

/** Guarda o envio para o webhook ter onde pousar. Nunca derruba o envio. */
export async function registrarEnvio(input: {
  companyId: string;
  providerId: string | null | undefined;
  para: string;
  assunto: string;
  entityType?: string;
  entityId?: string;
}) {
  if (!input.providerId) return; // driver console ou SMTP: não há id nem webhook
  try {
    await prisma.emailDelivery.create({
      data: {
        companyId: input.companyId,
        providerId: input.providerId,
        para: input.para,
        assunto: input.assunto,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      },
    });
  } catch (e) {
    console.error('[entrega] envio não registrado:', e instanceof Error ? e.message : e);
  }
}

/** Eventos do Resend que interessam, traduzidos para o nosso vocabulário. */
const EVENTOS: Record<string, EmailStatus> = {
  'email.sent': 'ENVIADO',
  'email.delivered': 'ENTREGUE',
  'email.opened': 'ABERTO',
  'email.clicked': 'CLIQUE',
  'email.bounced': 'REJEITADO',
  'email.complained': 'SPAM',
  'email.delivery_delayed': 'ATRASADO',
};

/**
 * Só avança: entregue não volta a enviado quando um evento chega fora de
 * ordem — a rede não garante ordem, e o histórico não pode andar para trás.
 * A regra mora em lib/ porque o cartão do pipeline resume por ela também.
 */
function deveAtualizar(atual: EmailStatus, novo: EmailStatus): boolean {
  return avancaEntrega(atual as StatusEntrega, novo as StatusEntrega);
}

/** Aplica um evento do provedor à mensagem correspondente. */
export async function aplicarEvento(evento: {
  type: string;
  data?: { email_id?: string; bounce?: { message?: string }; reason?: string };
}) {
  const status = EVENTOS[evento.type];
  const providerId = evento.data?.email_id;
  if (!status || !providerId) return { ignorado: true as const };

  const registro = await prisma.emailDelivery.findUnique({ where: { providerId } });
  // mensagem enviada antes desta funcionalidade existir: nada a atualizar
  if (!registro) return { ignorado: true as const };
  if (!deveAtualizar(registro.status, status)) return { ignorado: true as const };

  const agora = new Date();
  await prisma.emailDelivery.update({
    where: { providerId },
    data: {
      status,
      detalhe: evento.data?.bounce?.message ?? evento.data?.reason ?? registro.detalhe,
      deliveredAt: status === 'ENTREGUE' ? agora : registro.deliveredAt,
      openedAt: status === 'ABERTO' || status === 'CLIQUE' ? (registro.openedAt ?? agora) : registro.openedAt,
      failedAt: status === 'REJEITADO' || status === 'SPAM' ? agora : registro.failedAt,
    },
  });

  return { ignorado: false as const, status, registro };
}

/** Situação das mensagens ligadas a um documento — mostrada na tela dele. */
export async function getEntregas(companyId: string, entityType: string, entityId: string) {
  return prisma.emailDelivery.findMany({
    where: { companyId, entityType, entityId },
    orderBy: { sentAt: 'desc' },
  });
}

export type EntregaResumida = {
  status: StatusEntrega;
  para: string;
  sentAt: Date;
  propostaCode: string;
};

/**
 * Busca as entregas das propostas informadas e resume uma por chave.
 *
 * `daProposta` diz a que chave — oportunidade ou orçamento — cada proposta
 * pertence; o resto da regra é a mesma nos dois casos.
 */
async function resumirPorChave(
  companyId: string, daProposta: Map<string, { chave: string; code: string }>,
): Promise<Map<string, EntregaResumida>> {
  const resultado = new Map<string, EntregaResumida>();
  if (daProposta.size === 0) return resultado;

  const entregas = await prisma.emailDelivery.findMany({
    where: { companyId, entityType: 'proposal', entityId: { in: [...daProposta.keys()] } },
    select: { entityId: true, status: true, para: true, sentAt: true },
  });

  const agrupado = new Map<string, EntregaResumida[]>();
  for (const e of entregas) {
    const origem = e.entityId ? daProposta.get(e.entityId) : undefined;
    if (!origem) continue;
    const lista = agrupado.get(origem.chave) ?? [];
    lista.push({
      status: e.status as StatusEntrega,
      para: e.para, sentAt: e.sentAt, propostaCode: origem.code,
    });
    agrupado.set(origem.chave, lista);
  }

  for (const [chave, lista] of agrupado) {
    const melhor = resumoEntrega(lista);
    if (melhor) resultado.set(chave, melhor);
  }
  return resultado;
}

/** Propostas já enviadas dos orçamentos indicados, com a chave escolhida. */
async function propostasEnviadas(
  companyId: string,
  where: { opportunityId?: { in: string[] }; id?: { in: string[] } },
  chaveDe: (b: { id: string; opportunityId: string | null }) => string | null,
) {
  const budgets = await prisma.budget.findMany({
    where: { companyId, deletedAt: null, ...where },
    select: {
      id: true, opportunityId: true,
      versions: {
        select: {
          proposals: {
            where: { deletedAt: null, sentAt: { not: null } },
            select: { id: true, code: true },
          },
        },
      },
    },
  });

  const daProposta = new Map<string, { chave: string; code: string }>();
  for (const b of budgets) {
    const chave = chaveDe(b);
    if (!chave) continue;
    for (const v of b.versions) {
      for (const p of v.proposals) daProposta.set(p.id, { chave, code: p.code });
    }
  }
  return daProposta;
}

/**
 * Situação do último envio de proposta de cada oportunidade do quadro.
 *
 * O caminho é oportunidade → orçamento → versão → proposta → entrega. Sem
 * isto o comercial teria que abrir orçamento por orçamento para saber se o
 * cliente recebeu, que é justamente a informação que decide o próximo passo.
 */
export async function getEntregasPorOportunidade(
  companyId: string, opportunityIds: string[],
): Promise<Map<string, EntregaResumida>> {
  if (opportunityIds.length === 0) return new Map();
  const daProposta = await propostasEnviadas(
    companyId, { opportunityId: { in: opportunityIds } }, (b) => b.opportunityId,
  );
  return resumirPorChave(companyId, daProposta);
}

/** A mesma situação, indexada por orçamento — para a coluna da listagem. */
export async function getEntregasPorOrcamento(
  companyId: string, budgetIds: string[],
): Promise<Map<string, EntregaResumida>> {
  if (budgetIds.length === 0) return new Map();
  const daProposta = await propostasEnviadas(
    companyId, { id: { in: budgetIds } }, (b) => b.id,
  );
  return resumirPorChave(companyId, daProposta);
}

/** Falhas recentes: o que precisa de correção de cadastro. */
export async function getFalhasRecentes(companyId: string) {
  const trintaDias = new Date();
  trintaDias.setDate(trintaDias.getDate() - 30);
  return prisma.emailDelivery.findMany({
    where: { companyId, status: { in: ['REJEITADO', 'SPAM'] }, sentAt: { gte: trintaDias } },
    orderBy: { sentAt: 'desc' },
    take: 50,
  });
}
