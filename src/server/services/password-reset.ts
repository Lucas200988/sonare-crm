import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/server/db';
import { hashPassword, validatePasswordPolicy } from '@/server/auth/password';
import { auditLog } from '@/server/audit/audit';
import { enviarEmail, layoutEmail, mailInfo } from '@/server/mail';
import { appUrl } from '@/server/signature';

/** O token viaja no link; no banco fica só o hash, como nas sessões. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const VALIDADE_HORAS = 2;

/**
 * Inicia a recuperação de senha.
 *
 * A resposta é sempre a mesma, exista o e-mail ou não — informar o contrário
 * permitiria descobrir quem tem conta no sistema.
 */
export async function requestPasswordReset(email: string): Promise<{ ok: true; avisoEnvio?: string }> {
  const normalizado = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizado },
    select: { id: true, name: true, email: true, active: true, deletedAt: true, companyId: true },
  });

  if (!user || !user.active || user.deletedAt) return { ok: true };

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + VALIDADE_HORAS * 60 * 60 * 1000);

  // Um pedido novo invalida os anteriores
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
  });

  const link = `${appUrl()}/redefinir-senha?token=${token}`;
  const resultado = await enviarEmail({
    para: user.email,
    assunto: 'Redefinição de senha — SONARE CRM',
    texto:
      `Olá, ${user.name}.\n\n`
      + `Recebemos um pedido para redefinir sua senha do SONARE CRM.\n`
      + `Acesse o link abaixo (válido por ${VALIDADE_HORAS} horas):\n\n${link}\n\n`
      + `Se não foi você, ignore esta mensagem — sua senha continua a mesma.`,
    html: layoutEmail(
      'Redefinição de senha',
      `<p>Olá, ${user.name}.</p>
       <p>Recebemos um pedido para redefinir sua senha do SONARE CRM.</p>
       <p style="margin:24px 0">
         <a href="${link}" style="background:#e22020;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">
           Criar nova senha
         </a>
       </p>
       <p style="font-size:12px;color:#64748b">
         O link vale por ${VALIDADE_HORAS} horas. Se não foi você quem pediu, ignore esta
         mensagem — sua senha continua a mesma.
       </p>`,
    ),
  });

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'password_reset_request', entityType: 'user', entityId: user.id,
  });

  // Sem SMTP o link não sai da máquina; avisa para não ficar esperando
  if (!mailInfo().pronto) {
    return { ok: true, avisoEnvio: 'O envio de e-mail não está configurado — o link foi registrado no log do servidor.' };
  }
  if ('error' in resultado) return { ok: true, avisoEnvio: resultado.error };
  return { ok: true };
}

/** Confere o token sem consumi-lo — usado ao abrir a tela. */
export async function checkResetToken(token: string): Promise<{ valido: boolean; nome?: string }> {
  const registro = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { name: true, active: true, deletedAt: true } } },
  });

  if (!registro || registro.usedAt || registro.expiresAt < new Date()) return { valido: false };
  if (!registro.user.active || registro.user.deletedAt) return { valido: false };
  return { valido: true, nome: registro.user.name };
}

export async function resetPasswordWithToken(
  token: string, novaSenha: string,
): Promise<{ ok: true } | { error: string }> {
  const registro = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, companyId: true, active: true, deletedAt: true } } },
  });

  if (!registro || registro.usedAt || registro.expiresAt < new Date()) {
    return { error: 'Este link expirou ou já foi usado. Peça a redefinição novamente.' };
  }
  if (!registro.user.active || registro.user.deletedAt) {
    return { error: 'Esta conta está inativa. Procure um administrador.' };
  }

  const problema = validatePasswordPolicy(novaSenha);
  if (problema) return { error: problema };

  await prisma.$transaction([
    prisma.user.update({
      where: { id: registro.userId },
      data: { passwordHash: await hashPassword(novaSenha), passwordChangedAt: new Date() },
    }),
    prisma.passwordResetToken.update({
      where: { id: registro.id },
      data: { usedAt: new Date() },
    }),
    // Sessões abertas deixam de valer: se alguém invadiu, perde o acesso
    prisma.session.updateMany({
      where: { userId: registro.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await auditLog({
    companyId: registro.user.companyId, userId: registro.userId,
    action: 'password_reset', entityType: 'user', entityId: registro.userId,
  });

  return { ok: true };
}
