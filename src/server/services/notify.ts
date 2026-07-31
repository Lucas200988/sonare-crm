import 'server-only';
import { prisma } from '@/server/db';
import { enviarEmail, layoutEmail } from '@/server/mail';
import { appUrl } from '@/server/signature';
import type { SessionUser } from '@/server/auth/session';

/**
 * Avisos pessoais: aparecem no dashboard de quem recebe e seguem por e-mail.
 *
 * A regra de ouro: o aviso NUNCA derruba a operação que o gerou. Atribuir uma
 * tarefa tem que funcionar mesmo com o provedor de e-mail fora do ar — por
 * isso tudo aqui é embrulhado em try/catch e o chamador não espera erro.
 */

export type Aviso = {
  /** Quem recebe. Nulo ou igual a quem fez a ação: nada acontece. */
  paraUserId: string | null | undefined;
  /** Categoria curta (ex.: "tarefa_atribuida") — permite agrupar no futuro. */
  kind: string;
  titulo: string;
  corpo?: string;
  /** Caminho interno (ex.: /projetos/abc) — vira link absoluto no e-mail. */
  link: string;
};

export async function notificar(quemFez: SessionUser, aviso: Aviso): Promise<void> {
  try {
    // Ninguém precisa ser avisado do que acabou de fazer.
    if (!aviso.paraUserId || aviso.paraUserId === quemFez.id) return;

    const destinatario = await prisma.user.findFirst({
      where: { id: aviso.paraUserId, companyId: quemFez.companyId, active: true, deletedAt: null },
      select: { id: true, email: true, name: true },
    });
    if (!destinatario) return;

    await prisma.notification.create({
      data: {
        companyId: quemFez.companyId,
        userId: destinatario.id,
        kind: aviso.kind,
        title: aviso.titulo,
        body: aviso.corpo ?? null,
        link: aviso.link,
      },
    });

    const url = `${appUrl()}${aviso.link}`;
    await enviarEmail({
      para: destinatario.email,
      responderPara: quemFez.email,
      assunto: `${aviso.titulo} — SONARE CRM`,
      texto:
        `${aviso.titulo}\n\n${aviso.corpo ?? ''}\n\n`
        + `Abrir no sistema: ${url}\n\n`
        + `Aviso automático do CRM; para falar com ${quemFez.name}, basta responder.`,
      html: layoutEmail(
        aviso.titulo,
        `${aviso.corpo ? `<p>${aviso.corpo}</p>` : ''}
         <p style="margin-top:16px">
           <a href="${url}"
              style="display:inline-block;background:#e22020;color:#ffffff;text-decoration:none;font-size:13px;font-weight:bold;padding:10px 24px;border-radius:8px">
             Abrir no sistema
           </a>
         </p>`,
        `Aviso automático do CRM da SONARE Engenharia; para falar com ${quemFez.name}, basta responder este e-mail.`,
      ),
    });
  } catch (e) {
    // registrado para diagnóstico; a operação principal segue intacta
    console.error('[notificar] aviso não entregue:', e instanceof Error ? e.message : e);
  }
}

/** Painel do dashboard: os avisos não lidos de quem está logado. */
export async function getUnreadNotifications(user: SessionUser) {
  return prisma.notification.findMany({
    where: { companyId: user.companyId, userId: user.id, readAt: null },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
}

export async function markNotificationRead(user: SessionUser, id: string) {
  await prisma.notification.updateMany({
    where: { id, userId: user.id, companyId: user.companyId },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(user: SessionUser) {
  await prisma.notification.updateMany({
    where: { userId: user.id, companyId: user.companyId, readAt: null },
    data: { readAt: new Date() },
  });
}
