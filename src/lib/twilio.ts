import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Regras puras do canal WhatsApp via Twilio: assinatura do webhook e
 * leitura do formulário. Twilio manda POST application/x-www-form-urlencoded
 * e assina com HMAC-SHA1 (base64) sobre a URL pública + parâmetros ordenados.
 */

/** X-Twilio-Signature: base64(HMAC-SHA1(authToken, url + Σ key+value ordenados)). */
export function assinaturaTwilioValida(
  urlPublica: string, params: Record<string, string>, authToken: string, cabecalho: string | null,
): boolean {
  if (!cabecalho || !authToken) return false;
  const base = urlPublica + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const esperada = createHmac('sha1', authToken).update(base, 'utf8').digest('base64');
  if (esperada.length !== cabecalho.length) return false;
  try {
    return timingSafeEqual(Buffer.from(esperada), Buffer.from(cabecalho));
  } catch {
    return false;
  }
}

export type MensagemTwilio = { de: string; texto: string; nome: string | null; idMensagem: string };

/** "whatsapp:+5565984636872" → dígitos; sem texto (mídia, status), null. */
export function extrairMensagemTwilio(params: Record<string, string>): MensagemTwilio | null {
  const from = params.From ?? '';
  const texto = (params.Body ?? '').trim();
  if (!from.startsWith('whatsapp:') || !texto) return null;
  return {
    de: from.replace(/\D+/g, ''),
    texto,
    nome: params.ProfileName?.trim() || null,
    idMensagem: params.MessageSid ?? '',
  };
}

/** Número no formato que a Twilio espera para envio. */
export function paraTwilio(digitos: string): string {
  const d = digitos.replace(/\D+/g, '');
  return `whatsapp:+${d.startsWith('55') ? d : `55${d}`}`;
}
