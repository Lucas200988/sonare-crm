import 'server-only';
import { prisma } from '@/server/db';
import { conversar } from '@/server/services/agente';
import {
  acaoPendenteDaThread, armarAcao, cancelarAcao, confirmarAcao,
} from '@/server/services/agente-acoes';
import { sessaoRealDoUsuario } from '@/server/services/agente-proativo';
import { comandoDaMensagem, mesmosNumerosBr } from '@/lib/whatsapp';

/**
 * Adapter do canal WhatsApp — a spec manda e aqui se cumpre: o canal NÃO
 * tem lógica de IA própria. Ele identifica a pessoa pelo número cadastrado,
 * trata os comandos de confirmação POR CÓDIGO (palavra-chave, nunca o
 * modelo) e entrega o resto ao mesmo conversar() do chat do CRM — mesmas
 * ferramentas, mesmo RBAC, mesma auditoria.
 */

type Config = { token: string; phoneId: string };

export function configWhatsApp(): Config | null {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  return token && phoneId ? { token, phoneId } : null;
}

/** Envia texto pela Graph API. Nunca lança — falha vira log e false. */
export async function enviarTextoWhatsApp(para: string, texto: string): Promise<boolean> {
  const config = configWhatsApp();
  if (!config) return false;
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${config.phoneId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: para,
        type: 'text',
        text: { body: texto.slice(0, 4_000), preview_url: false },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error('[whatsapp] envio falhou:', res.status, (await res.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[whatsapp] envio falhou:', e instanceof Error ? e.message : e);
    return false;
  }
}

/** A thread contínua de WhatsApp do usuário (uma por pessoa, reaproveitada). */
async function threadDeWhatsApp(companyId: string, userId: string) {
  return prisma.agentThread.findFirst({
    where: { companyId, userId, channel: 'WHATSAPP', deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });
}

const RODAPE_CONFIRMACAO =
  '\n\nPara executar: responda CONFIRMAR. Para desistir: CANCELAR.';

/**
 * Processa UMA mensagem recebida e devolve o texto de resposta (ou null
 * para silêncio — número desconhecido não ganha nem eco).
 */
export async function processarMensagemWhatsApp(
  de: string, texto: string,
): Promise<string | null> {
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
        return 'error' in r && r.error ? r.error : 'Ação cancelada — nada foi executado.';
      }
      if (comando === 'CONFIRMAR') {
        if (pendente.status === 'ARMADA') {
          return `Já está armada. Última confirmação:\n${pendente.resumo}\n\nResponda SIM para executar de verdade, ou CANCELAR.`;
        }
        const r = await armarAcao(user, pendente.id);
        if ('error' in r) return r.error ?? 'Não consegui armar a ação.';
        return `Última confirmação — a ação será executada de verdade:\n${r.resumo}\n\nResponda SIM para executar, ou CANCELAR.`;
      }
      // SIM só executa o que já foi armado — a dupla confirmação vale aqui também
      if (pendente.status !== 'ARMADA') {
        return `Há uma ação aguardando:\n${pendente.resumo}\n\nResponda CONFIRMAR para armar a execução, ou CANCELAR.`;
      }
      const r = await confirmarAcao(user, pendente.id);
      if ('ok' in r && r.ok) return r.mensagem;
      return ('error' in r ? r.error : null) ?? 'Não consegui executar.';
    }
    // comando sem ação pendente cai na conversa normal
  }

  const r = await conversar(user, {
    threadId: thread?.id ?? null,
    mensagem: texto,
    canal: 'WHATSAPP',
  });
  if ('error' in r) return r.error ?? 'Não consegui responder agora. Tente novamente.';
  return r.acaoPendente ? `${r.resposta}${RODAPE_CONFIRMACAO}` : r.resposta;
}
