import 'server-only';
import nodemailer from 'nodemailer';

/**
 * Envio de e-mail com dois destinos:
 *
 *  - `smtp`: servidor real, usado em produção.
 *  - `console`: imprime no log em vez de enviar — evita disparar mensagem de
 *    verdade durante o desenvolvimento.
 *
 * O destino vem de MAIL_DRIVER; sem SMTP configurado, cai para `console`
 * automaticamente, e a falha aparece na tela em vez de sumir em silêncio.
 */

export type Mensagem = {
  para: string;
  assunto: string;
  texto: string;
  html?: string;
  anexos?: Array<{ filename: string; content: Buffer; contentType?: string }>;
  /**
   * Para onde vai a resposta do destinatário.
   *
   * O remetente é um endereço de sistema que ninguém acompanha; sem isto, o
   * cliente que responde "aprovado" à proposta escreve para o vazio.
   */
  responderPara?: string | null;
};

function smtpConfigurado(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function resendConfigurado(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Destino escolhido. O Resend vem primeiro porque o Gmail passou a exigir
 * OAuth em SMTP (senhas de app dependem de liberação do administrador),
 * o que não se sustenta num servidor que apenas dispara mensagens.
 */
export function mailInfo() {
  const escolhido = process.env.MAIL_DRIVER;
  const driver =
    escolhido === 'resend' && resendConfigurado() ? ('resend' as const)
    : escolhido === 'smtp' && smtpConfigurado() ? ('smtp' as const)
    : resendConfigurado() ? ('resend' as const)
    : smtpConfigurado() ? ('smtp' as const)
    : ('console' as const);

  return {
    driver,
    host: driver === 'smtp' ? process.env.SMTP_HOST ?? null : null,
    from: process.env.MAIL_FROM ?? 'SONARE Engenharia <nao-responda@sonare.com.br>',
    /** Sem destino real configurado, a mensagem não sai da máquina. */
    pronto: driver !== 'console',
  };
}

/** Envio pela API do Resend — só uma chave, sem SMTP nem OAuth. */
async function enviarPeloResend(msg: Mensagem, from: string): Promise<{ ok: true } | { error: string }> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [msg.para],
        ...(msg.responderPara ? { reply_to: msg.responderPara } : {}),
        subject: msg.assunto,
        text: msg.texto,
        html: msg.html,
        attachments: msg.anexos?.map((a) => ({
          filename: a.filename,
          content: a.content.toString('base64'),
        })),
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const corpo = await res.text();
      // A causa mais comum é domínio ainda não verificado no painel
      return { error: `Resend ${res.status}: ${corpo.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    const detalhe = e instanceof Error ? e.message : 'falha desconhecida';
    return { error: `Não foi possível enviar o e-mail: ${detalhe}` };
  }
}

function transporte() {
  const porta = Number(process.env.SMTP_PORT ?? 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: porta,
    // 465 usa TLS direto; 587 negocia com STARTTLS
    secure: porta === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

export async function enviarEmail(msg: Mensagem): Promise<{ ok: true } | { error: string }> {
  const info = mailInfo();

  if (info.driver === 'console') {
    console.info(
      `[e-mail não enviado — nenhum provedor configurado]\n`
      + `Para: ${msg.para}\nAssunto: ${msg.assunto}\n\n${msg.texto}\n`,
    );
    return { ok: true };
  }

  if (info.driver === 'resend') return enviarPeloResend(msg, info.from);

  try {
    await transporte().sendMail({
      from: info.from,
      to: msg.para,
      ...(msg.responderPara ? { replyTo: msg.responderPara } : {}),
      subject: msg.assunto,
      text: msg.texto,
      html: msg.html,
      attachments: msg.anexos,
    });
    return { ok: true };
  } catch (e) {
    const detalhe = e instanceof Error ? e.message : 'falha desconhecida';
    return { error: `Não foi possível enviar o e-mail: ${detalhe}` };
  }
}

/** Casca com a identidade da SONARE, para as mensagens não parecerem spam. */
export function layoutEmail(titulo: string, corpo: string, rodape?: string): string {
  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a">
  <div style="border-bottom:3px solid #e22020;padding:16px 0">
    <span style="font-size:20px;font-weight:bold;letter-spacing:1px">SONARE ENGENHARIA</span>
  </div>
  <h1 style="font-size:18px;margin:24px 0 12px">${titulo}</h1>
  <div style="font-size:14px;line-height:1.6">${corpo}</div>
  <p style="margin-top:28px;border-top:1px solid #e2e8f0;padding-top:12px;font-size:11px;color:#64748b">
    ${rodape ?? 'Mensagem automática do sistema de gestão da SONARE Engenharia.'}
  </p>
</div>`.trim();
}
