import { NextResponse } from 'next/server';
import { aplicarEvento, assinaturaValida } from '@/server/services/email-delivery';

/**
 * Webhook do Resend: recebe o que aconteceu com cada e-mail enviado.
 *
 * Endereço público por natureza — quem protege é a assinatura, verificada
 * com o RESEND_WEBHOOK_SECRET. Sem o segredo configurado, a rota recusa tudo.
 *
 * Responde 200 mesmo para evento desconhecido: erro aqui faz o provedor
 * reenviar em laço, e não há o que reprocessar num evento que não usamos.
 */
export async function POST(request: Request) {
  const corpo = await request.text();

  const valida = assinaturaValida(
    process.env.RESEND_WEBHOOK_SECRET,
    {
      id: request.headers.get('svix-id'),
      timestamp: request.headers.get('svix-timestamp'),
      signature: request.headers.get('svix-signature'),
    },
    corpo,
  );
  if (!valida) {
    return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 401 });
  }

  let evento: { type?: string };
  try {
    evento = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
  }
  if (!evento.type) return NextResponse.json({ ok: true, ignorado: true });

  try {
    const r = await aplicarEvento(evento as Parameters<typeof aplicarEvento>[0]);
    return NextResponse.json({ ok: true, ...r, registro: undefined });
  } catch (e) {
    console.error('[webhook resend]', e instanceof Error ? e.message : e);
    // 200 de propósito: reenviar não conserta falha nossa de gravação
    return NextResponse.json({ ok: false });
  }
}
