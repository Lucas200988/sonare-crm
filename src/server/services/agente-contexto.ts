import 'server-only';
import { prisma } from '@/server/db';
import { escopoDeProjetos } from '@/server/auth/project-scope';
import { getAlerts } from '@/server/services/alerts';
import { getBoard } from '@/server/services/opportunities';
import { getFila } from '@/server/services/followup';
import { getProjectFinance } from '@/server/services/finance';
import { situacaoArt } from '@/lib/art-projeto';
import { formatBRL } from '@/lib/money';
import type { Prisma, ProjectStatus, TaskStatus } from '@/generated/prisma/client';
import type { SessionUser } from '@/server/auth/session';

/**
 * Contexto operacional consolidado para o SONARE AI Manager.
 *
 * O banco fica longe (~145 ms por consulta): cada função daqui faz POUCAS
 * consultas largas em paralelo e devolve uma estrutura pronta — o agente
 * nunca sai fazendo dezenas de perguntinhas ao banco. E tudo passa pelo
 * recorte do usuário: o Jarvis enxerga exatamente o que a pessoa enxerga.
 */

const pode = (user: SessionUser, p: string) => user.permissions.has(p);

function hojeISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cuiaba' }).format(new Date());
}

/** Dia de calendário em Cuiabá → intervalo UTC correspondente. */
function intervaloDoDia(diaISO: string): { inicio: Date; fim: Date } {
  return {
    inicio: new Date(`${diaISO}T00:00:00-04:00`),
    fim: new Date(`${diaISO}T23:59:59.999-04:00`),
  };
}

const STATUS_PROJETO_FECHADO: ProjectStatus[] = ['CONCLUIDO', 'ENCERRADO', 'CANCELADO'];
const STATUS_TAREFA_ABERTA = { notIn: ['CONCLUIDA', 'CANCELADA'] as TaskStatus[] };

function recorteDeProjeto(user: SessionUser): Prisma.ProjectWhereInput {
  return {
    companyId: user.companyId, deletedAt: null, archivedAt: null,
    ...escopoDeProjetos(user),
  };
}

// ---------- Visão geral ----------

/** A fotografia do dia: a primeira ferramenta que o Jarvis consulta. */
export async function visaoGeralDaEmpresa(user: SessionUser) {
  const hoje = hojeISO();
  const agora = new Date();
  const tresDiasAtras = new Date(agora.getTime() - 3 * 86_400_000);

  const [projetos, tarefasVencidas, alertas, ultimaTarefaPorProjeto, ultimoDiarioPorProjeto, rdosPendentesAssinatura] =
    await Promise.all([
      prisma.project.findMany({
        where: { ...recorteDeProjeto(user), status: { notIn: STATUS_PROJETO_FECHADO } },
        select: {
          id: true, code: true, name: true, status: true,
          contractualDeadline: true, updatedAt: true,
          technicalLead: { select: { name: true } },
        },
        orderBy: { code: 'asc' },
      }),
      pode(user, 'task:read')
        ? prisma.task.findMany({
            where: {
              companyId: user.companyId, deletedAt: null,
              dueAt: { lt: agora }, status: STATUS_TAREFA_ABERTA,
              OR: [{ projectId: null }, { project: recorteDeProjeto(user) }],
            },
            select: {
              id: true, title: true, dueAt: true,
              project: { select: { code: true, name: true } },
              assignee: { select: { name: true } },
            },
            orderBy: { dueAt: 'asc' },
            take: 30,
          })
        : [],
      getAlerts(user).catch(() => []),
      prisma.task.groupBy({
        by: ['projectId'],
        where: { companyId: user.companyId, deletedAt: null, projectId: { not: null } },
        _max: { updatedAt: true },
      }),
      prisma.constructionDiary.groupBy({
        by: ['projectId'],
        where: { companyId: user.companyId, deletedAt: null },
        _max: { createdAt: true },
      }),
      pode(user, 'diary:read')
        ? prisma.constructionDiary.count({
            where: {
              companyId: user.companyId, deletedAt: null, status: 'FINALIZADO',
              project: recorteDeProjeto(user),
            },
          })
        : 0,
    ]);

  const ultimaAtividadeDoProjeto = (id: string, updatedAt: Date): Date => {
    const t = ultimaTarefaPorProjeto.find((x) => x.projectId === id)?._max.updatedAt;
    const d = ultimoDiarioPorProjeto.find((x) => x.projectId === id)?._max.createdAt;
    return new Date(Math.max(updatedAt.getTime(), t?.getTime() ?? 0, d?.getTime() ?? 0));
  };

  const projetosSemMovimentacao = projetos
    .filter((p) => ultimaAtividadeDoProjeto(p.id, p.updatedAt) < tresDiasAtras)
    .map((p) => ({ codigo: p.code, nome: p.name, ultimaMovimentacao: ultimaAtividadeDoProjeto(p.id, p.updatedAt) }));

  const projetosAtrasados = projetos
    .filter((p) => p.contractualDeadline && p.contractualDeadline < agora)
    .map((p) => ({ codigo: p.code, nome: p.name, prazoContratual: p.contractualDeadline }));

  const [pipeline, fila] = await Promise.all([
    pode(user, 'opportunity:read')
      ? getBoard(user, { includeClosed: false }).then(({ stages, opportunities }) =>
          stages.map((s) => ({
            etapa: s.name,
            cartoes: opportunities.filter((o) => o.stageId === s.id).length,
            valorEstimado: formatBRL(
              opportunities
                .filter((o) => o.stageId === s.id)
                .reduce((acc, o) => acc + Number(o.estimatedValue ?? 0), 0)
                .toString(),
            ),
          })).filter((s) => s.cartoes > 0))
      : null,
    pode(user, 'proposal:read')
      ? getFila(user).then((f) => f.map((i) => ({
          proposta: i.codigo, orcamento: i.orcamento, cliente: i.cliente,
          situacao: i.rotulo, dias: i.diasDesde,
        }))).catch(() => [])
      : null,
  ]);

  return {
    data: hoje,
    projetosAtivos: projetos.length,
    projetos: projetos.map((p) => ({
      codigo: p.code, nome: p.name, status: p.status,
      responsavel: p.technicalLead?.name ?? null,
    })),
    projetosAtrasados,
    projetosSemMovimentacaoHa3Dias: projetosSemMovimentacao,
    tarefasVencidas: {
      total: tarefasVencidas.length,
      itens: tarefasVencidas.slice(0, 15).map((t) => ({
        titulo: t.title,
        projeto: t.project ? `${t.project.code} — ${t.project.name}` : null,
        responsavel: t.assignee?.name ?? null,
        venceuEm: t.dueAt,
      })),
    },
    alertasDoPainel: alertas.map((a) => ({ gravidade: a.gravidade, titulo: a.titulo, detalhe: a.detalhe })),
    pipelineComercial: pipeline ?? 'sem permissão para ver o pipeline',
    filaDeFollowUp: fila ?? 'sem permissão para ver a fila',
    rdosFinalizadosAguardandoAssinatura: rdosPendentesAssinatura,
  };
}

// ---------- Atividade de usuário ----------

/**
 * O que uma pessoa registrou no CRM em um dia.
 *
 * IMPORTANTE (e o prompt reforça): isto mede REGISTRO no sistema, não
 * trabalho. Ausência de registro nunca autoriza concluir que não trabalhou.
 */
export async function atividadeDoUsuario(
  user: SessionUser, nomeOuEmail: string, diaISO?: string,
) {
  const alvo = await prisma.user.findFirst({
    where: {
      companyId: user.companyId, deletedAt: null,
      OR: [
        { name: { contains: nomeOuEmail, mode: 'insensitive' } },
        { email: { contains: nomeOuEmail, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, email: true, active: true },
  });
  if (!alvo) return { error: `Nenhum usuário encontrado com "${nomeOuEmail}".` };

  // atividade alheia é assunto de quem audita; a própria, de cada um
  if (alvo.id !== user.id && !pode(user, 'audit:read') && !pode(user, 'user:manage')) {
    return { error: 'Sem permissão para consultar a atividade de outros usuários.' };
  }

  const dia = diaISO && /^\d{4}-\d{2}-\d{2}$/.test(diaISO) ? diaISO : hojeISO();
  const { inicio, fim } = intervaloDoDia(dia);

  const [eventos, tarefasConcluidas, horas, diarios, fotos, memorias] = await Promise.all([
    prisma.auditLog.findMany({
      where: { companyId: user.companyId, userId: alvo.id, createdAt: { gte: inicio, lte: fim } },
      select: { action: true, entityType: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    prisma.task.count({
      where: {
        companyId: user.companyId, deletedAt: null,
        completedAt: { gte: inicio, lte: fim },
        OR: [{ assigneeId: alvo.id }, { updatedById: alvo.id }],
      },
    }),
    prisma.timeEntry.aggregate({
      where: { companyId: user.companyId, userId: alvo.id, workDate: { gte: inicio, lte: fim } },
      _sum: { hours: true },
    }),
    prisma.constructionDiary.count({
      where: { companyId: user.companyId, deletedAt: null, openedById: alvo.id, diaryDate: dia },
    }),
    prisma.sitePhoto.count({
      where: { companyId: user.companyId, deletedAt: null, createdById: alvo.id, receivedAt: { gte: inicio, lte: fim } },
    }),
    prisma.agentMemory.findMany({
      where: {
        companyId: user.companyId, deletedAt: null,
        type: { in: ['USER_AVAILABILITY', 'USER_CONTEXT', 'COMMITMENT'] },
        subjectType: 'user', subjectId: alvo.id,
        OR: [{ validUntil: null }, { validUntil: { gte: inicio } }],
        AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: fim } }] }],
      },
      select: { type: true, content: true, source: true, validFrom: true, validUntil: true },
      take: 10,
    }),
  ]);

  const porTipo = new Map<string, number>();
  for (const e of eventos) {
    const chave = `${e.entityType}:${e.action}`;
    porTipo.set(chave, (porTipo.get(chave) ?? 0) + 1);
  }

  return {
    usuario: { nome: alvo.name, email: alvo.email, ativo: alvo.active },
    dia,
    observacao: 'Estes números refletem REGISTROS no CRM, não necessariamente todo o trabalho realizado.',
    totalDeRegistros: eventos.length,
    ultimoRegistroEm: eventos[0]?.createdAt ?? null,
    registrosPorTipo: Object.fromEntries(porTipo),
    tarefasConcluidasNoDia: tarefasConcluidas,
    horasLancadas: horas._sum.hours?.toString() ?? '0',
    diariosDeObraAbertos: diarios,
    fotosDeObraEnviadas: fotos,
    disponibilidadeConhecida: memorias.map((m) => ({
      tipo: m.type, informacao: m.content, fonte: m.source,
      de: m.validFrom, ate: m.validUntil,
    })),
  };
}

// ---------- Contexto de projeto ----------

/** Tudo de um projeto numa consulta: o dossiê que embasa "como está o X?". */
export async function contextoDoProjeto(user: SessionUser, termo: string) {
  const projeto = await prisma.project.findFirst({
    where: {
      ...recorteDeProjeto(user),
      OR: [
        { code: { equals: termo.trim(), mode: 'insensitive' } },
        { name: { contains: termo.trim(), mode: 'insensitive' } },
        { client: { legalName: { contains: termo.trim(), mode: 'insensitive' } } },
      ],
    },
    include: {
      client: { select: { legalName: true, tradeName: true } },
      technicalLead: { select: { name: true } },
      coordinator: { select: { name: true } },
      members: { include: { user: { select: { name: true } } } },
      technicalResponsibilities: { where: { deletedAt: null }, select: { number: true, status: true } },
      stages: { orderBy: { sortOrder: 'asc' }, select: { name: true, status: true } },
    },
  });
  if (!projeto) return { error: `Nenhum projeto visível encontrado para "${termo}".` };

  const agora = new Date();
  const seteDias = new Date(agora.getTime() - 7 * 86_400_000);

  const [tarefas, entregaveis, diarios, horas, eventosRecentes, memorias] = await Promise.all([
    prisma.task.findMany({
      where: { projectId: projeto.id, deletedAt: null },
      select: {
        title: true, status: true, dueAt: true, completedAt: true,
        assignee: { select: { name: true } },
      },
    }),
    prisma.deliverable.groupBy({
      by: ['status'],
      where: { projectId: projeto.id, deletedAt: null },
      _count: { _all: true },
    }).catch(() => []),
    prisma.constructionDiary.findMany({
      where: { projectId: projeto.id, deletedAt: null },
      select: { number: true, diaryDate: true, status: true },
      orderBy: { diaryDate: 'desc' },
      take: 5,
    }),
    prisma.timeEntry.aggregate({
      where: { projectId: projeto.id },
      _sum: { hours: true },
    }),
    prisma.auditLog.count({
      where: {
        companyId: user.companyId, createdAt: { gte: seteDias },
        OR: [
          { entityType: 'project', entityId: projeto.id },
          { entityType: 'construction_diary' },
        ],
      },
    }),
    prisma.agentMemory.findMany({
      where: {
        companyId: user.companyId, deletedAt: null,
        subjectType: 'project', subjectId: projeto.id,
        OR: [{ validUntil: null }, { validUntil: { gte: agora } }],
      },
      select: { type: true, content: true, source: true, validUntil: true },
      take: 10,
    }),
  ]);

  const vencidas = tarefas.filter(
    (t) => t.dueAt && t.dueAt < agora && !['CONCLUIDA', 'CANCELADA'].includes(t.status),
  );
  const art = situacaoArt(
    projeto.artStatus,
    projeto.technicalResponsibilities.map((a) => ({ numero: a.number, status: a.status })),
  );

  const financeiro = pode(user, 'finance:read')
    ? await getProjectFinance(user, projeto.id).then((f) => ({
        valorDoProjeto: f.resumo.valorProjeto ? formatBRL(f.resumo.valorProjeto) : null,
        cobrado: formatBRL(f.resumo.cobrado),
        recebido: formatBRL(f.resumo.recebido),
        aReceber: formatBRL(f.resumo.aReceber),
        aindaSemCobranca: f.resumo.aCobrar ? formatBRL(f.resumo.aCobrar) : null,
        despesas: formatBRL(f.resumo.despesas),
      })).catch(() => null)
    : 'sem permissão para ver o financeiro';

  return {
    projeto: {
      codigo: projeto.code, nome: projeto.name, status: projeto.status,
      cliente: projeto.client.tradeName ?? projeto.client.legalName,
      responsavelTecnico: projeto.technicalLead?.name ?? null,
      coordenacao: projeto.coordinator?.name ?? null,
      equipe: projeto.members.map((m) => m.user.name),
      inicio: projeto.startDate, prazoContratual: projeto.contractualDeadline,
      previsaoDeTermino: projeto.expectedEndDate,
      progresso: `${projeto.progressPercent}%`,
    },
    etapas: projeto.stages.map((s) => ({ nome: s.name, status: s.status })),
    tarefas: {
      total: tarefas.length,
      concluidas: tarefas.filter((t) => t.status === 'CONCLUIDA').length,
      vencidas: vencidas.map((t) => ({
        titulo: t.title, responsavel: t.assignee?.name ?? null, venceuEm: t.dueAt,
      })),
    },
    entregaveisPorStatus: entregaveis,
    art: { situacao: art.nivel, detalhe: art.detalhe },
    diarioDeObras: projeto.diaryEnabled
      ? { ultimos: diarios.map((d) => ({ numero: d.number, data: d.diaryDate, status: d.status })) }
      : 'este projeto não usa diário de obras',
    horasApontadasTotal: horas._sum.hours?.toString() ?? '0',
    movimentacoesNosUltimos7Dias: eventosRecentes,
    memoriasOperacionais: memorias,
    financeiro,
  };
}

// ---------- Recortes menores ----------

export async function tarefasVencidas(user: SessionUser) {
  const agora = new Date();
  const itens = await prisma.task.findMany({
    where: {
      companyId: user.companyId, deletedAt: null,
      dueAt: { lt: agora }, status: STATUS_TAREFA_ABERTA,
      OR: [{ projectId: null }, { project: recorteDeProjeto(user) }],
    },
    select: {
      title: true, dueAt: true, status: true, priority: true,
      project: { select: { code: true, name: true } },
      assignee: { select: { name: true } },
    },
    orderBy: { dueAt: 'asc' },
    take: 40,
  });
  return {
    total: itens.length,
    tarefas: itens.map((t) => ({
      titulo: t.title,
      projeto: t.project ? `${t.project.code} — ${t.project.name}` : null,
      responsavel: t.assignee?.name ?? null,
      prioridade: t.priority,
      venceuEm: t.dueAt,
      diasDeAtraso: t.dueAt ? Math.floor((agora.getTime() - t.dueAt.getTime()) / 86_400_000) : null,
    })),
  };
}

export async function rdosPendentes(user: SessionUser) {
  const diarios = await prisma.constructionDiary.findMany({
    where: {
      companyId: user.companyId, deletedAt: null,
      status: { in: ['ABERTO', 'FINALIZADO'] },
      project: { ...recorteDeProjeto(user), diaryEnabled: true },
    },
    select: {
      number: true, diaryDate: true, status: true,
      project: { select: { code: true, name: true } },
      signatures: { select: { role: true } },
    },
    orderBy: { diaryDate: 'desc' },
    take: 30,
  });
  return {
    observacao: 'ABERTO = ainda em preenchimento; FINALIZADO = aguardando assinaturas (aprova quando a fiscalização assina).',
    diarios: diarios.map((d) => ({
      obra: `${d.project.code} — ${d.project.name}`,
      rdoNumero: d.number,
      data: d.diaryDate,
      status: d.status,
      assinaturas: `${d.signatures.length}/3`,
    })),
  };
}
