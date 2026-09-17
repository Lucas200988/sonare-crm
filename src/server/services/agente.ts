import 'server-only';
import { prisma } from '@/server/db';
import {
  conversarComFerramentas, getAiConfig, type MensagemDaConversa,
} from '@/server/ai/client';
import { ferramentasDoUsuario } from '@/server/ai/manager-tools';
import { acaoPendenteDaThread } from '@/server/services/agente-acoes';
import { promptDoManager } from '@/server/ai/manager-prompt';
import type { Prisma } from '@/generated/prisma/client';
import type { SessionUser } from '@/server/auth/session';

/**
 * A conversa com o SONARE AI Manager.
 *
 * O cérebro é agnóstico ao canal: esta função recebe empresa, pessoa, canal
 * e mensagem — o chat do CRM é só o primeiro chamador; WhatsApp e cron
 * entrarão pelos mesmos parâmetros. A identidade da Fase 1 é sempre a do
 * usuário da sessão: o Jarvis vê e responde só o que a pessoa pode ver.
 */

export type CanalDoAgente = 'CRM' | 'WHATSAPP' | 'CRON' | 'EMAIL';

/** Quantas falas anteriores voltam ao modelo — teto de contexto e de custo. */
const LIMITE_HISTORICO = 20;
const LIMITE_FALA = 4_000;

export async function conversar(
  user: SessionUser,
  input: { threadId?: string | null; mensagem: string; canal?: CanalDoAgente },
) {
  const mensagem = input.mensagem.trim();
  if (!mensagem) return { error: 'Escreva uma mensagem.' };
  if (mensagem.length > 4_000) return { error: 'Mensagem longa demais (máx. 4.000 caracteres).' };

  const config = await getAiConfig(user.companyId);
  if (!config.apiKey || !config.enabled) {
    return { error: 'A IA está desativada. Ative em Configurações → Inteligência artificial.' };
  }
  if (config.provider !== 'openai') {
    return { error: 'O Jarvis requer o provedor OpenAI nesta versão. Ajuste em Configurações → Inteligência artificial.' };
  }

  // thread da conversa — sempre presa a empresa E usuário
  const thread = input.threadId
    ? await prisma.agentThread.findFirst({
        where: { id: input.threadId, companyId: user.companyId, userId: user.id, deletedAt: null },
      })
    : null;
  const threadAtiva = thread ?? await prisma.agentThread.create({
    data: {
      companyId: user.companyId,
      userId: user.id,
      channel: input.canal ?? 'CRM',
      title: mensagem.slice(0, 80),
    },
  });

  await prisma.agentMessage.create({
    data: { threadId: threadAtiva.id, role: 'USER', content: mensagem },
  });

  // histórico para o modelo: só as falas de pessoa e agente — resultados de
  // ferramenta antigos são pesados e a resposta final já os resume
  const anteriores = await prisma.agentMessage.findMany({
    where: { threadId: threadAtiva.id, role: { in: ['USER', 'ASSISTANT'] } },
    orderBy: { createdAt: 'desc' },
    take: LIMITE_HISTORICO + 1, // inclui a mensagem recém-gravada
  });

  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cuiaba' }).format(new Date());
  const mensagens: MensagemDaConversa[] = [
    { role: 'system', content: promptDoManager({ nomeDoUsuario: user.name, dataHoje: hoje }) },
    ...anteriores.reverse().map((m) => ({
      role: m.role === 'USER' ? ('user' as const) : ('assistant' as const),
      content: m.content.slice(0, LIMITE_FALA),
    })),
  ];

  try {
    const { resposta, passos } = await conversarComFerramentas(config, {
      mensagens,
      ferramentas: ferramentasDoUsuario(user, { threadId: threadAtiva.id }),
      medicao: { companyId: user.companyId, userId: user.id, useCase: 'manager' },
    });

    // registra as consultas feitas (transparência) e a resposta final
    const registros: Prisma.AgentMessageCreateManyInput[] = passos.map((p) => ({
      threadId: threadAtiva.id,
      role: 'TOOL',
      content: p.resultado.slice(0, 2_000),
      toolName: p.nome,
      toolData: { argumentos: p.argumentos.slice(0, 500) },
    }));
    registros.push({ threadId: threadAtiva.id, role: 'ASSISTANT', content: resposta });
    await prisma.agentMessage.createMany({ data: registros });
    await prisma.agentThread.update({
      where: { id: threadAtiva.id }, data: { updatedAt: new Date() },
    });

    return {
      ok: true as const,
      threadId: threadAtiva.id,
      resposta,
      ferramentas: [...new Set(passos.map((p) => p.nome))],
      // proposta de ação aguardando o clique de confirmação, se houver
      acaoPendente: await acaoPendenteDaThread(user, threadAtiva.id),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'erro desconhecido';
    const amigavel = msg.includes('401')
      ? 'Chave de API inválida ou expirada.'
      : msg.includes('429')
        ? 'Limite de uso da API atingido. Tente novamente em instantes.'
        : msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('abort')
          ? 'A análise passou do tempo. Tente uma pergunta mais específica.'
          : 'Não consegui concluir a análise agora. Tente novamente.';
    await prisma.agentMessage.create({
      data: { threadId: threadAtiva.id, role: 'ASSISTANT', content: amigavel },
    }).catch(() => null);
    return { error: amigavel, threadId: threadAtiva.id };
  }
}

/** A conversa mais recente do usuário, para o painel reabrir de onde parou. */
export async function conversaRecente(user: SessionUser) {
  const thread = await prisma.agentThread.findFirst({
    where: { companyId: user.companyId, userId: user.id, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
  });
  if (!thread) return null;

  const mensagens = await prisma.agentMessage.findMany({
    where: { threadId: thread.id, role: { in: ['USER', 'ASSISTANT'] } },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  return {
    threadId: thread.id,
    mensagens: mensagens.reverse().map((m) => ({
      id: m.id,
      papel: m.role === 'USER' ? ('user' as const) : ('jarvis' as const),
      texto: m.content,
      em: m.createdAt.toISOString(),
    })),
    acaoPendente: await acaoPendenteDaThread(user, thread.id),
  };
}
