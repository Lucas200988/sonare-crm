import 'server-only';
import { prisma } from '@/server/db';
export { assinaturaValida } from '@/lib/webhook-assinatura';
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
 * Rejeição e spam sobrepõem tudo: são o desfecho que importa.
 */
const ORDEM: EmailStatus[] = ['ENVIADO', 'ATRASADO', 'ENTREGUE', 'ABERTO', 'CLIQUE'];

function deveAtualizar(atual: EmailStatus, novo: EmailStatus): boolean {
  if (novo === 'REJEITADO' || novo === 'SPAM') return true;
  if (atual === 'REJEITADO' || atual === 'SPAM') return false;
  return ORDEM.indexOf(novo) > ORDEM.indexOf(atual);
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
