import 'server-only';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { notificar } from '@/server/services/notify';
import { escopoDeProjetos } from '@/server/auth/project-scope';
import {
  FLUXO_CONCESSIONARIA, MODELO_POR_CODIGO, passoAtual, processoConcluido,
  situacaoPasso, type CodigoPasso,
} from '@/lib/aprovacao-externa';
import type { SessionUser } from '@/server/auth/session';

/**
 * Acompanhamento do processo na concessionária.
 *
 * Cada passo guarda o protocolo e a data; o prazo do órgão é copiado do
 * modelo na abertura, para mudança de regulamento não reescrever processo
 * já em curso — o que valia quando protocolamos é o que vale para cobrar.
 */

/** Recorte do projeto que o usuário pode ver, para não vazar por aqui. */
function doProjeto(user: SessionUser, projectId: string) {
  return {
    id: projectId, companyId: user.companyId, deletedAt: null,
    ...escopoDeProjetos(user),
  };
}

export async function abrirAprovacao(user: SessionUser, projectId: string, orgao: string) {
  const project = await prisma.project.findFirst({
    where: doProjeto(user, projectId),
    select: { id: true, code: true },
  });
  if (!project) return { error: 'Projeto não encontrado.' };

  const existente = await prisma.externalApproval.findFirst({
    where: { projectId, deletedAt: null, status: 'EM_ANDAMENTO' },
    select: { id: true },
  });
  if (existente) return { error: 'Já existe um processo em andamento para este projeto.' };

  const criado = await prisma.externalApproval.create({
    data: {
      companyId: user.companyId,
      projectId,
      orgao: orgao.trim() || 'Concessionária',
      createdById: user.id,
      steps: {
        create: FLUXO_CONCESSIONARIA.map((modelo, i) => ({
          code: modelo.codigo,
          name: modelo.nome,
          sortOrder: i,
          deadlineDays: modelo.prazoDias,
        })),
      },
    },
  });

  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'create',
    entityType: 'external_approval', entityId: criado.id,
    after: { projeto: project.code, orgao: criado.orgao },
  });
  return { ok: true as const, id: criado.id };
}

export async function getAprovacao(user: SessionUser, projectId: string) {
  const project = await prisma.project.findFirst({
    where: doProjeto(user, projectId),
    select: { id: true },
  });
  if (!project) return null;

  return prisma.externalApproval.findFirst({
    where: { projectId, deletedAt: null },
    include: { steps: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
}

/** Carrega o passo garantindo que ele pertence a um projeto visível. */
async function passoVisivel(user: SessionUser, stepId: string) {
  return prisma.externalApprovalStep.findFirst({
    where: {
      id: stepId,
      approval: {
        companyId: user.companyId,
        deletedAt: null,
        project: { companyId: user.companyId, deletedAt: null, ...escopoDeProjetos(user) },
      },
    },
    include: {
      approval: {
        select: {
          id: true, orgao: true, projectId: true,
          project: {
            select: {
              code: true, name: true,
              coordinatorId: true, technicalLeadId: true, createdById: true,
            },
          },
        },
      },
    },
  });
}

export type RegistroProtocolo = { protocolo: string; data: Date; notes?: string | null };

/**
 * Registra o protocolo devolvido pelo órgão.
 *
 * É daqui que o prazo passa a correr — sem protocolo não há o que cobrar
 * depois, e é por isso que o número é obrigatório.
 */
export async function registrarProtocolo(
  user: SessionUser, stepId: string, input: RegistroProtocolo,
) {
  const passo = await passoVisivel(user, stepId);
  if (!passo) return { error: 'Passo não encontrado.' };
  if (!input.protocolo.trim()) return { error: 'Informe o número do protocolo.' };
  if (input.data > new Date()) return { error: 'A data do protocolo não pode ser futura.' };

  await prisma.externalApprovalStep.update({
    where: { id: stepId },
    data: {
      protocol: input.protocolo.trim(),
      protocolAt: input.data,
      status: 'AGUARDANDO_CONCESSIONARIA',
      notes: input.notes?.trim() || passo.notes,
    },
  });

  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'update',
    entityType: 'approval_step', entityId: stepId,
    after: { passo: passo.name, protocolo: input.protocolo, projeto: passo.approval.project.code },
  });
  return { ok: true as const };
}

/** Registra a cobrança formal — a partir daí a sugestão vira ouvidoria. */
export async function registrarCobranca(user: SessionUser, stepId: string) {
  const passo = await passoVisivel(user, stepId);
  if (!passo) return { error: 'Passo não encontrado.' };
  if (!passo.protocolAt) return { error: 'Registre o protocolo antes de cobrar.' };

  await prisma.externalApprovalStep.update({
    where: { id: stepId },
    data: { chargedAt: new Date() },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'update',
    entityType: 'approval_step', entityId: stepId,
    after: { passo: passo.name, cobranca: 'registrada' },
  });
  return { ok: true as const };
}

export type ConclusaoPasso = {
  data: Date;
  /** ACEITO, RECUSADO, APROVADO, COM_EXIGENCIAS… conforme o passo. */
  desfecho?: string | null;
  notes?: string | null;
  /** O passo não se aplica a este projeto. */
  dispensar?: boolean;
};

/**
 * Conclui o passo e abre o seguinte.
 *
 * Recusa e exigências encerram o passo do mesmo jeito: o que muda é o
 * desfecho registrado, que é o que se lê depois para entender o processo.
 */
export async function concluirPasso(
  user: SessionUser, stepId: string, input: ConclusaoPasso,
) {
  const passo = await passoVisivel(user, stepId);
  if (!passo) return { error: 'Passo não encontrado.' };

  const modelo = MODELO_POR_CODIGO.get(passo.code as CodigoPasso);
  if (!input.dispensar && modelo?.temDecisao && !input.desfecho?.trim()) {
    return { error: 'Informe o desfecho deste passo.' };
  }
  if (!input.dispensar && modelo?.temProtocolo && !passo.protocolAt) {
    return { error: 'Registre o protocolo antes de concluir este passo.' };
  }

  await prisma.externalApprovalStep.update({
    where: { id: stepId },
    data: {
      status: input.dispensar ? 'DISPENSADO' : 'CONCLUIDO',
      respondedAt: input.dispensar ? null : input.data,
      outcome: input.desfecho?.trim() || null,
      notes: input.notes?.trim() || passo.notes,
    },
  });

  // O processo se fecha sozinho quando o último passo sai da frente.
  const passos = await prisma.externalApprovalStep.findMany({
    where: { approvalId: passo.approval.id },
    select: { status: true },
  });
  if (processoConcluido(passos)) {
    await prisma.externalApproval.update({
      where: { id: passo.approval.id },
      data: { status: 'CONCLUIDO' },
    });
  }

  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'update',
    entityType: 'approval_step', entityId: stepId,
    after: {
      passo: passo.name,
      situacao: input.dispensar ? 'dispensado' : 'concluído',
      desfecho: input.desfecho ?? null,
    },
  });
  return { ok: true as const };
}

// ---------- Prazos vencidos ----------

export type PrazoVencido = {
  projectId: string;
  projectCode: string;
  projectName: string;
  orgao: string;
  passo: string;
  protocolo: string | null;
  diasAtraso: number;
  acao: 'cobrar' | 'ouvidoria';
};

/**
 * Passos com o prazo do órgão estourado.
 *
 * Alimenta o alerta do painel e o aviso diário: prazo vencido que ninguém
 * viu é tempo de obra perdido sem ter a quem reclamar.
 */
export async function getPrazosVencidos(user: SessionUser): Promise<PrazoVencido[]> {
  const passos = await prisma.externalApprovalStep.findMany({
    where: {
      status: 'AGUARDANDO_CONCESSIONARIA',
      protocolAt: { not: null },
      deadlineDays: { not: null },
      approval: {
        companyId: user.companyId,
        deletedAt: null,
        status: 'EM_ANDAMENTO',
        project: {
          companyId: user.companyId, deletedAt: null, archivedAt: null,
          ...escopoDeProjetos(user),
        },
      },
    },
    include: {
      approval: {
        select: {
          orgao: true, projectId: true,
          project: { select: { code: true, name: true } },
        },
      },
    },
  });

  const agora = new Date();
  const vencidos: PrazoVencido[] = [];

  for (const p of passos) {
    const s = situacaoPasso({
      status: 'AGUARDANDO_CONCESSIONARIA',
      prazoDias: p.deadlineDays,
      protocoladoEm: p.protocolAt,
      respondidoEm: p.respondedAt,
      cobradoEm: p.chargedAt,
    }, agora);

    if (s.nivel !== 'atrasado' || !s.acao || s.acao === 'aguardar') continue;
    vencidos.push({
      projectId: p.approval.projectId,
      projectCode: p.approval.project.code,
      projectName: p.approval.project.name,
      orgao: p.approval.orgao,
      passo: p.name,
      protocolo: p.protocol,
      diasAtraso: Math.abs(s.diasRestantes ?? 0),
      acao: s.acao,
    });
  }

  return vencidos.sort((a, b) => b.diasAtraso - a.diasAtraso);
}

/**
 * Avisa o responsável quando o prazo do órgão vira atraso.
 *
 * Chamado pela rotina diária. Só o dia em que o prazo estoura e o dia em
 * que a escalada muda geram aviso — repetir todo dia faria a equipe
 * aprender a ignorar.
 */
export async function avisarPrazosVencidos(companyId: string) {
  const passos = await prisma.externalApprovalStep.findMany({
    where: {
      status: 'AGUARDANDO_CONCESSIONARIA',
      protocolAt: { not: null },
      deadlineDays: { not: null },
      approval: {
        companyId, deletedAt: null, status: 'EM_ANDAMENTO',
        project: { deletedAt: null, archivedAt: null },
      },
    },
    include: {
      approval: {
        select: {
          orgao: true, projectId: true,
          project: {
            select: {
              code: true, name: true,
              coordinatorId: true, technicalLeadId: true, createdById: true,
            },
          },
        },
      },
    },
  });

  const agora = new Date();
  let avisados = 0;

  for (const p of passos) {
    const s = situacaoPasso({
      status: 'AGUARDANDO_CONCESSIONARIA',
      prazoDias: p.deadlineDays,
      protocoladoEm: p.protocolAt,
      respondidoEm: p.respondedAt,
      cobradoEm: p.chargedAt,
    }, agora);
    if (s.nivel !== 'atrasado') continue;

    const atraso = Math.abs(s.diasRestantes ?? 0);
    // primeiro dia de atraso e o dia em que a escalada muda de degrau
    if (atraso !== 1 && atraso !== 8) continue;

    const projeto = p.approval.project;
    const paraUserId = projeto.coordinatorId ?? projeto.technicalLeadId ?? projeto.createdById;
    if (!paraUserId) continue;

    /*
     * A rotina não tem usuário logado. O id vazio importa: `notificar` não
     * avisa quem fez a ação, e um id real aqui silenciaria justamente o
     * responsável pelo projeto.
     */
    const rotina: SessionUser = {
      id: '', companyId, name: 'Rotina diária', email: '',
      roles: [], permissions: new Set(),
    };
    await notificar(rotina, {
      paraUserId,
      kind: 'aprovacao_prazo',
      titulo: `${p.approval.orgao} passou do prazo em ${projeto.code}`,
      corpo: `"${p.name}" está ${atraso} dia(s) atrasado`
        + `${p.protocol ? ` (protocolo ${p.protocol})` : ''}. `
        + (s.acao === 'ouvidoria'
          ? 'A cobrança não resolveu — considere a ouvidoria.'
          : 'Vale cobrar formalmente.'),
      link: `/projetos/${p.approval.projectId}`,
    });
    avisados += 1;
  }

  return { avisados };
}
