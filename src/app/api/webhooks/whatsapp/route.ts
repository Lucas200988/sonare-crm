import { NextResponse, after } from 'next/server';
import { assinaturaMetaValida, extrairMensagens } from '@/lib/whatsapp';
import { enviarWhatsApp, processarMensagemWhatsApp } from '@/server/services/agente-whatsapp';

/**
 * Webhook do WhatsApp (Meta Cloud API) — a porta de entrada do canal.
 *
 * Endereço público por natureza; quem protege é a assinatura HMAC do corpo
 * (X-Hub-Signature-256, com o app secret). A Meta exige resposta rápida e
 * reentrega em caso de demora — por isso o 200 sai imediatamente e a
 * conversa (que pode levar dezenas de segundos de IA) roda depois, via
 * after(), dentro do tempo da função.
 */
export const maxDuration = 60;

/** Verificação de assinatura do webhook, exigida uma vez pela Meta. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const modo = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const desafio = url.searchParams.get('hub.challenge');

  const esperado = process.env.WHATSAPP_VERIFY_TOKEN;
  if (modo === 'subscribe' && esperado && token === esperado && desafio) {
    return new Response(desafio, { status: 200 });
  }
  return NextResponse.json({ error: 'Verificação inválida.' }, { status: 403 });
}

export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json({ error: 'Canal não configurado.' }, { status: 503 });
  }

  const corpo = await request.text();
  if (!assinaturaMetaValida(corpo, request.headers.get('x-hub-signature-256'), appSecret)) {
    return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
  }

  const mensagens = extrairMensagens(payload);

  // responde já; a conversa acontece depois da resposta, sem a Meta reentregar
  after(async () => {
    for (const m of mensagens) {
      try {
        const resposta = await processarMensagemWhatsApp(m.de, m.texto);
        if (resposta) await enviarWhatsApp(m.de, resposta.texto, resposta.documento);
      } catch (e) {
        console.error('[whatsapp] processamento falhou:', e instanceof Error ? e.message : e);
      }
    }
  });

  return NextResponse.json({ recebidas: mensagens.length });
}
