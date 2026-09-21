import 'server-only';
import { prisma } from '@/server/db';
import { conversar } from '@/server/services/agente';
import {
  acaoPendenteDaThread, armarAcao, cancelarAcao, confirmarAcao,
} from '@/server/services/agente-acoes';
import { sessaoRealDoUsuario } from '@/server/services/agente-proativo';
import { appUrl } from '@/server/signature';
import { comandoDaMensagem, mesmosNumerosBr } from '@/lib/whatsapp';
import { paraTwilio } from '@/lib/twilio';

/**
 * Adapter do canal WhatsApp — a spec manda e aqui se cumpre: o canal NÃO
 * tem lógica de IA própria. Ele identifica a pessoa pelo número cadastrado,
 * trata os comandos de confirmação POR CÓDIGO (palavra-chave, nunca o
 * modelo) e entrega o resto ao mesmo conversar() do chat do CRM — mesmas
 * ferramentas, mesmo RBAC, mesma auditoria.
 *
 * Dois provedores, um adapter: Twilio (conta em minutos, sandbox no dia) e
 * Meta Cloud API (oficial direto). Quem tiver credenciais no ambiente
 * responde; a Twilio tem prioridade quando ambos existem.
 */

type Provedor =
  | { tipo: 'twilio'; accountSid: string; authToken: string; from: string }
  | { tipo: 'meta'; token: string; phoneId: string };

export function provedorWhatsApp(): Provedor | null {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, WHATSAPP_TOKEN, WHATSAPP_PHONE_ID } = process.env;
  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM) {
    return { tipo: 'twilio', accountSid: TWILIO_ACCOUNT_SID, authToken: TWILIO_AUTH_TOKEN, from: TWILIO_WHATSAPP_FROM };
  }
  if (WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) return { tipo: 'meta', token: WHATSAPP_TOKEN, phoneId: WHATSAPP_PHONE_ID };
  return null;
}

/** Compatibilidade com o webhook da Meta. */
export function configWhatsApp() {
  const p = provedorWhatsApp();
  return p?.tipo === 'meta' ? { token: p.token, phoneId: p.phoneId } : null;
}

export type DocumentoParaEnviar = { url: string; nome: string; legenda: string };

async function enviarTwilio(p: Extract<Provedor, { tipo: 'twilio' }>, para: string, texto: string, documento?: DocumentoParaEnviar) {
  const corpo = new URLSearchParams({
    From: p.from.startsWith('whatsapp:') ? p.from : `whatsapp:${p.from}`,
    To: paraTwilio(para),
    Body: (documento ? `${documento.legenda}\n${texto}` : texto).slice(0, 1_500),
  });
  if (documento) corpo.set('MediaUrl', documento.url);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${p.accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${p.accountSid}:${p.authToken}`).toString('base64')}`,
    },
    body: corpo.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function enviarMeta(p: Extract<Provedor, { tipo: 'meta' }>, para: string, texto: string, documento?: DocumentoParaEnviar) {
  const enviar = async (payload: Record<string, unknown>) => {
    const res = await fetch(`https://graph.facebook.com/v21.0/${p.phoneId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.token}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: para, ...payload }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Meta ${res.status}: ${(await res.text()).slice(0, 200)}`);
  };
  await enviar({ type: 'text', text: { body: texto.slice(0, 4_000), preview_url: false } });
  if (documento) {
    await enviar({ type: 'document', document: { link: documento.url, filename: documento.nome, caption: documento.legenda.slice(0, 1_000) } });
  }
}

/** Envia texto (e, se houver, um documento) pelo provedor ativo. Nunca lança. */
export async function enviarWhatsApp(para: string, texto: string, documento?: DocumentoParaEnviar): Promise<boolean> {
  const p = provedorWhatsApp();
  if (!p) return false;
  try {
    if (p.tipo === 'twilio') await enviarTwilio(p, para, texto, documento);
    else await enviarMeta(p, para, texto, documento);
    return true;
  } catch (e) {
    console.error('[whatsapp] envio falhou:', e instanceof Error ? e.message : e);
    return false;
  }
}

/** Compatibilidade: só texto. */
export const enviarTextoWhatsApp = (para: string, texto: string) => enviarWhatsApp(para, texto);

/** A thread contínua de WhatsApp do usuário (uma por pessoa, reaproveitada). */
async function threadDeWhatsApp(companyId: string, userId: string) {
  return prisma.agentThread.findFirst({
    where: { companyId, userId, channel: 'WHATSAPP', deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });
}

/**
 * O PDF da proposta como link público — o mesmo que vai ao cliente por
 * e-mail (código de verificação aleatório, sem login). É o que o WhatsApp
 * consegue entregar como documento.
 */
async function documentoDaProposta(attachmentId: string): Promise<DocumentoParaEnviar | null> {
  const proposta = await prisma.proposal.findFirst({
    where: { pdfAttachmentId: attachmentId, deletedAt: null },
    select: { code: true, revision: true, verificationCode: true },
  });
  if (!proposta?.verificationCode) return null;
  const rotulo = proposta.revision > 0 ? `${proposta.code} Rev. ${String(proposta.revision).padStart(2, '0')}` : proposta.code;
  return {
    url: `${appUrl()}/verificar/${proposta.verificationCode}/pdf?baixar=1`,
    nome: `${rotulo.replace(/[^\w.-]+/g, '_')}.pdf`,
    legenda: `Proposta ${rotulo} — PDF oficial`,
  };
}

const RODAPE_CONFIRMACAO = '\n\nPara executar: responda CONFIRMAR. Para desistir: CANCELAR.';
const RODAPE_RASCUNHO = '\n\n(Orçamento em elaboração — para ajustar, é só dizer; para emitir, diga "gera a proposta".)';

export type RespostaWhatsApp = { texto: string; documento?: DocumentoParaEnviar };

/**
 * Processa UMA mensagem recebida e devolve a resposta (ou null para
 * silêncio — número desconhecido não ganha nem eco).
 */
export async function processarMensagemWhatsApp(de: string, texto: string): Promise<RespostaWhatsApp | null> {
  // identifica a pessoa pelo número cadastrado — sem cadastro, sem conversa
  const usuarios = await prisma.user.findMany({
    where: { deletedAt: null, active: true, whatsapp: { not: null } },
    select: { id: true, whatsapp: true },
  });
  const dono = usuarios.find((u) => u.whatsapp && mesmosNumerosBr(u.whatsapp, de));
  if (!dono) {
    console.warn('[whatsapp] mensagem de número não cadastrado ignorada');
    return null;
  }

  const user = await sessaoRealDoUsuario(dono.id);
  if (!user) return null;

  const thread = await threadDeWhatsApp(user.companyId, user.id);

  // comandos de confirmação: decididos por código, nunca pelo modelo
  const comando = comandoDaMensagem(texto);
  if (comando && thread) {
    const pendente = await acaoPendenteDaThread(user, thread.id);
    if (pendente) {
      if (comando === 'CANCELAR') {
        const r = await cancelarAcao(user, pendente.id);
        return { texto: 'error' in r && r.error ? r.error : 'Ação cancelada — nada foi executado.' };
      }
      if (comando === 'CONFIRMAR') {
        if (pendente.status === 'ARMADA') {
          return { texto: `Já está armada. Última confirmação:\n${pendente.resumo}\n\nResponda SIM para executar de verdade, ou CANCELAR.` };
        }
        const r = await armarAcao(user, pendente.id);
        if ('error' in r) return { texto: r.error ?? 'Não consegui armar a ação.' };
        return { texto: `Última confirmação — a ação será executada de verdade:\n${r.resumo}\n\nResponda SIM para executar, ou CANCELAR.` };
      }
      // SIM só executa o que já foi armado — a dupla confirmação vale aqui também
      if (pendente.status !== 'ARMADA') {
        return { texto: `Há uma ação aguardando:\n${pendente.resumo}\n\nResponda CONFIRMAR para armar a execução, ou CANCELAR.` };
      }
      const r = await confirmarAcao(user, pendente.id);
      if (!('ok' in r && r.ok)) return { texto: ('error' in r ? r.error : null) ?? 'Não consegui executar.' };
      // proposta gerada: o PDF vai junto, como documento
      const documento = r.arquivo?.attachmentId ? await documentoDaProposta(r.arquivo.attachmentId) : null;
      return documento
        ? { texto: r.mensagem, documento }
        : { texto: r.arquivo ? `${r.mensagem}\n${appUrl()}${r.arquivo.url}` : r.mensagem };
    }
    // comando sem ação pendente cai na conversa normal
  }

  const r = await conversar(user, {
    threadId: thread?.id ?? null,
    mensagem: texto,
    canal: 'WHATSAPP',
  });
  if ('error' in r) return { texto: r.error ?? 'Não consegui responder agora. Tente novamente.' };

  if (r.acaoPendente) return { texto: `${r.resposta}${RODAPE_CONFIRMACAO}` };
  if (r.rascunho) return { texto: `${r.resposta}${RODAPE_RASCUNHO}` };
  return { texto: r.resposta };
}
