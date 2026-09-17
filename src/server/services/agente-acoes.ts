import 'server-only';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { escopoDeProjetos } from '@/server/auth/project-scope';
import { addProjectComment, createTask } from '@/server/services/projects';
import { enviarToque, getFila } from '@/server/services/followup';
import { formatDateBR } from '@/lib/dates';
import type { Prisma } from '@/generated/prisma/client';
import type { SessionUser } from '@/server/auth/session';

/**
 * Ações do Jarvis — Fase 2 (executor com confirmação).
 *
 * O desenho de segurança: o modelo PROPÕE (argumentos resolvidos e
 * validados aqui, com o RBAC do usuário) e a proposta espera na tabela
 * AgentAction. A EXECUÇÃO só acontece quando a pessoa clica em Confirmar —
 * caminho determinístico, serviço existente, sem o LLM no meio. O modelo
 * jamais consegue executar sozinho, nem confirmando a si mesmo.
 */

const VALIDADE_MIN = 30;

type Proposta = { ok: true; acaoId: string; resumo: string } | { error: string };

async function registrarProposta(
  user: SessionUser, threadId: string, tool: string,
  args: Prisma.InputJsonValue, resumo: string,
): Promise<Proposta> {
  const acao = await prisma.agentAction.create({
    data: {
      companyId: user.companyId,
      threadId,
      userId: user.id,
      tool,
      args,
      resumo,
      expiresAt: new Date(Date.now() + VALIDADE_MIN * 60_000),
    },
  });
  return { ok: true, acaoId: acao.id, resumo };
}

// ---------- Propostas (chamadas pelas ferramentas de escrita) ----------

export async function proporCriarTarefa(
  user: SessionUser, threadId: string,
  input: { projetoTermo: string; titulo: string; responsavelNome?: string; prazo?: string; descricao?: string },
): Promise<Proposta> {
  const projeto = await prisma.project.findFirst({
    where: {
      companyId: user.companyId, deletedAt: null, archivedAt: null,
      ...escopoDeProjetos(user),
      OR: [
        { code: { equals: input.projetoTermo.trim(), mode: 'insensitive' } },
        { name: { contains: input.projetoTermo.trim(), mode: 'insensitive' } },
      ],
    },
    select: { id: true, code: true, name: true },
  });
  if (!projeto) return { error: `Projeto "${input.projetoTermo}" não encontrado no seu recorte.` };

  let responsavel: { id: string; name: string } | null = null;
  if (input.responsavelNome) {
    responsavel = await prisma.user.findFirst({
      where: {
        companyId: user.companyId, deletedAt: null, active: true,
        name: { contains: input.responsavelNome.trim(), mode: 'insensitive' },
      },
      select: { id: true, name: true },
    });
    if (!responsavel) return { error: `Usuário "${input.responsavelNome}" não encontrado.` };
  }

  const prazoOk = input.prazo && /^\d{4}-\d{2}-\d{2}$/.test(input.prazo) ? input.prazo : null;
  const resumo = `Criar tarefa "${input.titulo}" no projeto ${projeto.code} — ${projeto.name}`
    + (responsavel ? `, responsável ${responsavel.name}` : '')
    + (prazoOk ? `, prazo ${formatDateBR(new Date(`${prazoOk}T12:00:00Z`))}` : '') + '.';

  return registrarProposta(user, threadId, 'criar_tarefa', {
    projectId: projeto.id,
    projetoCodigo: projeto.code,
    titulo: input.titulo.trim(),
    descricao: input.descricao?.trim() || null,
    responsavelId: responsavel?.id ?? null,
    prazo: prazoOk,
  }, resumo);
}

export async function proporObservacao(
  user: SessionUser, threadId: string,
  input: { projetoTermo: string; texto: string },
): Promise<Proposta> {
  const projeto = await prisma.project.findFirst({
    where: {
      companyId: user.companyId, deletedAt: null,
      ...escopoDeProjetos(user),
      OR: [
        { code: { equals: input.projetoTermo.trim(), mode: 'insensitive' } },
        { name: { contains: input.projetoTermo.trim(), mode: 'insensitive' } },
      ],
    },
    select: { id: true, code: true, name: true },
  });
  if (!projeto) return { error: `Projeto "${input.projetoTermo}" não encontrado no seu recorte.` };

  const resumo = `Registrar comentário no projeto ${projeto.code} — ${projeto.name}: "${input.texto.slice(0, 140)}${input.texto.length > 140 ? '…' : ''}"`;
  return registrarProposta(user, threadId, 'registrar_observacao', {
    projectId: projeto.id, projetoCodigo: projeto.code, texto: input.texto.trim(),
  }, resumo);
}

export async function proporFollowUp(
  user: SessionUser, threadId: string, input: { proposta: string },
): Promise<Proposta> {
  const fila = await getFila(user);
  const termo = input.proposta.trim().toUpperCase();
  const item = fila.find(
    (i) => i.codigo.toUpperCase().includes(termo) || i.orcamento.toUpperCase().includes(termo),
  );
  if (!item) {
    return {
      error: fila.length === 0
        ? 'A fila de follow-up está vazia — nenhuma proposta aguardando toque agora.'
        : `"${input.proposta}" não está na fila de follow-up. Na fila: ${fila.map((i) => i.codigo).join(', ')}.`,
    };
  }
  if (!item.emailCliente) {
    return { error: `O cliente da ${item.codigo} não tem e-mail cadastrado — cadastre antes de enviar.` };
  }

  const resumo = `Enviar follow-up da proposta ${item.codigo} (${item.cliente}) para ${item.emailCliente} — assunto: "${item.assunto}".`;
  return registrarProposta(user, threadId, 'enviar_follow_up', {
    proposalId: item.proposalId,
    codigo: item.codigo,
    tipo: item.tipo,
    para: item.emailCliente,
    assunto: item.assunto,
    corpo: item.corpo,
  }, resumo);
}

// ---------- Confirmação e execução (sem LLM no caminho) ----------

/** Ação do usuário, na thread dele, ainda pendente (proposta ou armada). */
async function acaoConfirmavel(user: SessionUser, acaoId: string) {
  const acao = await prisma.agentAction.findFirst({
    where: { id: acaoId, companyId: user.companyId, userId: user.id },
  });
  if (!acao) return { error: 'Ação não encontrada.' as const };
  if (acao.status !== 'PROPOSTA' && acao.status !== 'ARMADA') {
    return { error: 'Esta ação já foi tratada.' as const };
  }
  if (acao.expiresAt < new Date()) {
    await prisma.agentAction.update({ where: { id: acao.id }, data: { status: 'EXPIRADA' } });
    return { error: 'A proposta expirou (30 min). Peça de novo ao Jarvis.' as const };
  }
  return { acao };
}

/**
 * Primeiro passo da dupla confirmação por texto (WhatsApp): CONFIRMAR arma;
 * só o SIM em uma ação ARMADA executa. No CRM o cartão arma na própria tela.
 */
export async function armarAcao(user: SessionUser, acaoId: string) {
  const r = await acaoConfirmavel(user, acaoId);
  if ('error' in r) return { error: r.error };
  await prisma.agentAction.update({ where: { id: r.acao.id }, data: { status: 'ARMADA' } });
  return { ok: true as const, resumo: r.acao.resumo };
}

export async function confirmarAcao(user: SessionUser, acaoId: string) {
  const r = await acaoConfirmavel(user, acaoId);
  if ('error' in r) return { error: r.error };
  const { acao } = r;
  const args = acao.args as Record<string, string | null>;

  let resultado: { ok: true; mensagem: string } | { error: string };
  try {
    if (acao.tool === 'criar_tarefa') {
      const feito = await createTask(user, String(args.projectId), {
        title: String(args.titulo),
        description: args.descricao,
        assigneeId: args.responsavelId,
        dueAt: args.prazo,
        priority: 'MEDIA',
      });
      resultado = 'error' in feito
        ? { error: feito.error ?? 'Falha na execução.' }
        : { ok: true, mensagem: `Tarefa criada no ${args.projetoCodigo}.` };
    } else if (acao.tool === 'registrar_observacao') {
      const feito = await addProjectComment(user, String(args.projectId), String(args.texto));
      resultado = 'error' in feito
        ? { error: feito.error ?? 'Falha na execução.' }
        : { ok: true, mensagem: `Comentário registrado no ${args.projetoCodigo}.` };
    } else if (acao.tool === 'enviar_follow_up') {
      const feito = await enviarToque(user, {
        proposalId: String(args.proposalId),
        tipo: String(args.tipo) as never,
        para: String(args.para),
        assunto: String(args.assunto),
        corpo: String(args.corpo),
      });
      resultado = 'error' in feito
        ? { error: feito.error ?? 'Falha na execução.' }
        : { ok: true, mensagem: `Follow-up da ${args.codigo} enviado para ${args.para}.` };
    } else {
      resultado = { error: `Ação "${acao.tool}" desconhecida.` };
    }
  } catch (e) {
    resultado = { error: e instanceof Error ? e.message.slice(0, 300) : 'Falha na execução.' };
  }

  const falhou = 'error' in resultado;
  await prisma.agentAction.update({
    where: { id: acao.id },
    data: {
      status: falhou ? 'FALHOU' : 'EXECUTADA',
      executedAt: new Date(),
      resultado: resultado as Prisma.InputJsonValue,
    },
  });

  // a conversa registra o desfecho — o Jarvis "sabe" o que aconteceu
  const fala = falhou
    ? `A ação não foi executada: ${(resultado as { error: string }).error}`
    : `✔ ${(resultado as { mensagem: string }).mensagem} (confirmada por você)`;
  await prisma.agentMessage.create({
    data: { threadId: acao.threadId, role: 'ASSISTANT', content: fala },
  }).catch(() => null);

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: falhou ? 'agent_action_failed' : 'agent_action_executed',
    entityType: 'agent_action', entityId: acao.id,
    after: { tool: acao.tool, resumo: acao.resumo, origem: 'jarvis — confirmado pelo usuário' },
  });

  return falhou ? { error: (resultado as { error: string }).error } : { ok: true as const, mensagem: fala };
}

export async function cancelarAcao(user: SessionUser, acaoId: string) {
  const r = await acaoConfirmavel(user, acaoId);
  if ('error' in r) return { error: r.error };

  await prisma.agentAction.update({
    where: { id: r.acao.id }, data: { status: 'CANCELADA' },
  });
  await prisma.agentMessage.create({
    data: { threadId: r.acao.threadId, role: 'ASSISTANT', content: 'Ação cancelada — nada foi executado.' },
  }).catch(() => null);
  return { ok: true as const };
}

// ---------- Memória operacional (Fase 3) ----------

const TIPOS_DE_MEMORIA = [
  'USER_AVAILABILITY', 'COMMITMENT', 'TASK_BLOCKER',
  'PROJECT_CONTEXT', 'USER_CONTEXT', 'MANAGEMENT_INSTRUCTION',
] as const;
export type TipoDeMemoria = (typeof TIPOS_DE_MEMORIA)[number];

/**
 * Anota no caderno do agente o que foi DECLARADO em conversa — férias,
 * compromissos, bloqueios, instruções. Fonte sempre USER_DECLARATION com o
 * autor registrado: memória nunca vira "fato do sistema" disfarçado.
 * Instrução de gestão só de quem gerencia.
 */
export async function registrarMemoria(
  user: SessionUser, threadId: string,
  input: {
    tipo: string;
    sobreTipo: 'user' | 'project';
    sobreNome: string;
    conteudo: string;
    validaAte?: string;
  },
) {
  if (!TIPOS_DE_MEMORIA.includes(input.tipo as TipoDeMemoria)) {
    return { error: `Tipo de memória inválido. Use: ${TIPOS_DE_MEMORIA.join(', ')}.` };
  }
  if (input.tipo === 'MANAGEMENT_INSTRUCTION' && !user.permissions.has('user:manage')) {
    return { error: 'Instruções de gestão só podem ser registradas por quem gerencia usuários.' };
  }

  let subjectId: string | null = null;
  let sobre = input.sobreNome.trim();
  if (input.sobreTipo === 'user') {
    const alvo = await prisma.user.findFirst({
      where: {
        companyId: user.companyId, deletedAt: null,
        name: { contains: sobre, mode: 'insensitive' },
      },
      select: { id: true, name: true },
    });
    if (!alvo) return { error: `Usuário "${sobre}" não encontrado.` };
    subjectId = alvo.id;
    sobre = alvo.name;
  } else {
    const projeto = await prisma.project.findFirst({
      where: {
        companyId: user.companyId, deletedAt: null,
        ...escopoDeProjetos(user),
        OR: [
          { code: { equals: sobre, mode: 'insensitive' } },
          { name: { contains: sobre, mode: 'insensitive' } },
        ],
      },
      select: { id: true, code: true },
    });
    if (!projeto) return { error: `Projeto "${sobre}" não encontrado no seu recorte.` };
    subjectId = projeto.id;
    sobre = projeto.code;
  }

  const validaAte = input.validaAte && /^\d{4}-\d{2}-\d{2}$/.test(input.validaAte)
    ? new Date(`${input.validaAte}T23:59:59-04:00`)
    : null;

  const memoria = await prisma.agentMemory.create({
    data: {
      companyId: user.companyId,
      type: input.tipo,
      subjectType: input.sobreTipo,
      subjectId,
      userId: input.sobreTipo === 'user' ? subjectId : null,
      threadId,
      content: input.conteudo.trim(),
      validFrom: new Date(),
      validUntil: validaAte,
      source: 'USER_DECLARATION',
      createdById: user.id,
    },
  });

  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'create',
    entityType: 'agent_memory', entityId: memoria.id,
    after: { tipo: input.tipo, sobre, validaAte: input.validaAte ?? null },
  });

  return {
    ok: true as const,
    anotado: `${input.tipo} sobre ${sobre}` + (validaAte ? ` até ${input.validaAte}` : ''),
  };
}

/** Proposta pendente (ou armada) de uma thread — cartão do CRM e fluxo do WhatsApp. */
export async function acaoPendenteDaThread(user: SessionUser, threadId: string) {
  const acao = await prisma.agentAction.findFirst({
    where: {
      companyId: user.companyId, userId: user.id, threadId,
      status: { in: ['PROPOSTA', 'ARMADA'] }, expiresAt: { gte: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, resumo: true, tool: true, status: true },
  });
  return acao ?? null;
}
