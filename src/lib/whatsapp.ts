import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Regras puras do canal WhatsApp (Meta Cloud API): normalização de número,
 * leitura do payload do webhook e verificação de assinatura. Sem banco, sem
 * rede — testável linha a linha.
 */

/**
 * Número brasileiro em forma canônica para comparação.
 *
 * O WhatsApp manda "5565984636872"; o cadastro pode ter "(65) 98463-6872",
 * com ou sem o 55, com ou sem o nono dígito. Canônico: só dígitos, sem o 55
 * do país, e sem o nono dígito quando presente — DDD + 8 dígitos finais é o
 * que nunca muda entre os formatos.
 */
export function numeroCanonicoBr(valor: string): string {
  let d = valor.replace(/\D+/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  // celular com nono dígito (DDD + 9 dígitos): remove o 9 extra
  if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
  return d;
}

export function mesmosNumerosBr(a: string, b: string): boolean {
  const ca = numeroCanonicoBr(a);
  const cb = numeroCanonicoBr(b);
  return ca.length >= 10 && ca === cb;
}

// ---------- Payload do webhook ----------

export type MensagemRecebida = {
  de: string;       // wa_id do remetente (ex.: 5565984636872)
  nome: string | null;
  texto: string;
  idMensagem: string;
};

/**
 * Extrai as mensagens de TEXTO de um evento do webhook.
 *
 * O payload da Meta aninha entry[].changes[].value.messages[]; status de
 * entrega e mídias chegam pelo mesmo caminho e são ignorados aqui — o
 * Jarvis da Fase 4 conversa por texto.
 */
export function extrairMensagens(payload: unknown): MensagemRecebida[] {
  const mensagens: MensagemRecebida[] = [];
  const raiz = payload as { entry?: Array<{ changes?: Array<{ value?: Record<string, unknown> }> }> };
  for (const entry of raiz.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value as {
        messages?: Array<{ id?: string; from?: string; type?: string; text?: { body?: string } }>;
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
      } | undefined;
      for (const m of value?.messages ?? []) {
        if (m.type !== 'text' || !m.from || !m.text?.body?.trim()) continue;
        const contato = value?.contacts?.find((c) => c.wa_id === m.from);
        mensagens.push({
          de: m.from,
          nome: contato?.profile?.name ?? null,
          texto: m.text.body.trim(),
          idMensagem: m.id ?? '',
        });
      }
    }
  }
  return mensagens;
}

// ---------- Assinatura ----------

/** X-Hub-Signature-256 da Meta: "sha256=" + HMAC-SHA256(appSecret, corpo cru). */
export function assinaturaMetaValida(
  corpoCru: string, cabecalho: string | null, appSecret: string,
): boolean {
  if (!cabecalho?.startsWith('sha256=')) return false;
  const esperada = createHmac('sha256', appSecret).update(corpoCru, 'utf8').digest('hex');
  const recebida = cabecalho.slice('sha256='.length);
  if (recebida.length !== esperada.length) return false;
  try {
    return timingSafeEqual(Buffer.from(recebida, 'hex'), Buffer.from(esperada, 'hex'));
  } catch {
    return false;
  }
}

// ---------- Comandos de confirmação ----------

export type ComandoWhatsApp = 'CONFIRMAR' | 'SIM' | 'CANCELAR' | null;

/**
 * A confirmação por WhatsApp é PALAVRA-CHAVE, decidida por código — nunca
 * pelo modelo. CONFIRMAR arma, SIM executa, CANCELAR desiste: a mesma dupla
 * confirmação do cartão do chat, em texto.
 */
export function comandoDaMensagem(texto: string): ComandoWhatsApp {
  const t = texto.trim().toUpperCase().replace(/[.!]+$/, '');
  if (t === 'CONFIRMAR' || t === 'CONFIRMA') return 'CONFIRMAR';
  if (t === 'SIM' || t === 'SIM, EXECUTAR' || t === 'EXECUTAR') return 'SIM';
  if (t === 'CANCELAR' || t === 'CANCELA' || t === 'NÃO' || t === 'NAO') return 'CANCELAR';
  return null;
}
