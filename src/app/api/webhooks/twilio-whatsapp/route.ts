import { NextResponse, after } from 'next/server';
import { assinaturaTwilioValida, extrairMensagemTwilio } from '@/lib/twilio';
import { enviarWhatsApp, processarMensagemWhatsApp } from '@/server/services/agente-whatsapp';
import { appUrl } from '@/server/signature';

/**
 * Webhook do WhatsApp via Twilio — a porta de entrada do canal.
 *
 * Endereço público; quem protege é a X-Twilio-Signature (HMAC-SHA1 sobre a
 * URL pública + parâmetros). A URL usada na assinatura é a configurada no
 * painel da Twilio, por isso vem de appUrl() e não do request. A resposta
 * sai vazia e imediata; a conversa (IA, segundos) roda depois via after().
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return NextResponse.json({ error: 'Canal não configurado.' }, { status: 503 });
  }

  const corpo = await request.text();
  const params = Object.fromEntries(new URLSearchParams(corpo).entries());
  const urlPublica = `${appUrl()}/api/webhooks/twilio-whatsapp`;
  if (!assinaturaTwilioValida(urlPublica, params, authToken, request.headers.get('x-twilio-signature'))) {
    return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 401 });
  }

  const mensagem = extrairMensagemTwilio(params);
  if (mensagem) {
    after(async () => {
      try {
        const resposta = await processarMensagemWhatsApp(mensagem.de, mensagem.texto);
        if (resposta) await enviarWhatsApp(mensagem.de, resposta.texto, resposta.documento);
      } catch (e) {
        console.error('[twilio] processamento falhou:', e instanceof Error ? e.message : e);
      }
    });
  }

  // TwiML vazio: nenhuma resposta automática — a nossa vai pela API
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200, headers: { 'Content-Type': 'text/xml' },
  });
}
