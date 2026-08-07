import 'server-only';
import { escopoDeProjetos } from '@/server/auth/project-scope';
import { getPrazosVencidos } from '@/server/services/aprovacoes';
import { prisma } from '@/server/db';
import type { SessionUser } from '@/server/auth/session';

/**
 * Alertas do que precisa de atenção hoje.
 *
 * São calculados na hora, a partir dos dados — não há tabela para manter em
 * dia nem agendador para configurar, e a lista nunca fica desatualizada.
 * A tabela Notification segue reservada para avisos pontuais (menções,
 * atribuições), que dependem de alguém tê-los gerado.
 */

export type Alerta = {
  id: string;
  gravidade: 'alta' | 'media' | 'baixa';
  titulo: string;
  detalhe: string;
  href: string;
};

function inicioDoDia(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getAlerts(user: SessionUser): Promise<Alerta[]> {
  const hoje = inicioDoDia();
  const em7dias = new Date(hoje);
  em7dias.setDate(em7dias.getDate() + 7);

  const pode = (p: string) => user.permissions.has(p);
  const base = { companyId: user.companyId, deletedAt: null };

  const [
    parcelasVencidas, projetosAtrasados, projetosSemArt, propostasVencendo,
    tarefasAtrasadas, contasVencidas, orcamentosParados,
  ] = await Promise.all([
    pode('finance:read')
      ? prisma.receivable.count({
          where: { ...base, dueDate: { lt: hoje }, status: { notIn: ['RECEBIDO', 'CANCELADO'] } },
        })
      : 0,
    pode('project:read')
      ? prisma.project.findMany({
          where: {
            ...base, archivedAt: null,
            ...escopoDeProjetos(user),
            contractualDeadline: { lt: hoje },
            status: { notIn: ['CONCLUIDO', 'ENCERRADO', 'CANCELADO'] },
          },
          select: { id: true, code: true, name: true },
          take: 5,
        })
      : [],
    /*
     * Projeto em andamento sem ART e sem alguém ter dito que não precisa.
     * Entregar sem responsabilidade técnica é risco do engenheiro que
     * assina, não do sistema — então isto tem que aparecer sozinho.
     */
    pode('project:read')
      ? prisma.project.findMany({
          where: {
            ...base, archivedAt: null,
            ...escopoDeProjetos(user),
            status: { notIn: ['CONCLUIDO', 'ENCERRADO', 'CANCELADO'] },
            artStatus: { not: 'DISPENSADA' },
            technicalResponsibilities: { none: { deletedAt: null, status: { not: 'CANCELADA' } } },
          },
          select: { id: true, code: true, name: true, artStatus: true },
          take: 5,
        })
      : [],
    // Propostas enviadas cuja validade do orçamento expira em até 7 dias
    pode('proposal:read')
      ? prisma.proposal.findMany({
          where: {
            companyId: user.companyId, deletedAt: null,
            status: { in: ['ENVIADA', 'VISUALIZADA'] },
            budgetVersion: { validUntil: { gte: hoje, lte: em7dias } },
          },
          select: {
            id: true, code: true,
            budgetVersion: { select: { validUntil: true, budgetId: true } },
          },
          take: 5,
        })
      : [],
    pode('task:read')
      ? prisma.task.count({
          where: {
            ...base, dueAt: { lt: hoje },
            status: { notIn: ['CONCLUIDA', 'CANCELADA'] },
            assigneeId: user.id,
          },
        })
      : 0,
    pode('finance:read')
      ? prisma.payable.count({ where: { ...base, status: 'A_PAGAR', dueDate: { lt: hoje } } })
      : 0,
    // Orçamentos parados em aprovação interna há mais de 3 dias
    pode('budget:read')
      ? prisma.budget.count({
          where: {
            ...base, status: 'APROVACAO_INTERNA',
            updatedAt: { lt: new Date(hoje.getTime() - 3 * 86_400_000) },
          },
        })
      : 0,
  ]);

  // consulta própria: cruza prazo e protocolo, e não cabe no Promise.all acima
  const prazosVencidos = pode('project:read') ? await getPrazosVencidos(user) : [];

  const alertas: Alerta[] = [];

  if (parcelasVencidas > 0) {
    alertas.push({
      id: 'parcelas-vencidas',
      gravidade: 'alta',
      titulo: `${parcelasVencidas} parcela(s) vencida(s)`,
      detalhe: 'Recebimentos em atraso esperando cobrança',
      href: '/financeiro/cobranca',
    });
  }

  if (contasVencidas > 0) {
    alertas.push({
      id: 'contas-vencidas',
      gravidade: 'alta',
      titulo: `${contasVencidas} conta(s) a pagar vencida(s)`,
      detalhe: 'Despesas com prazo estourado',
      href: '/financeiro/pagar?situacao=VENCIDO',
    });
  }

  for (const p of projetosAtrasados) {
    alertas.push({
      id: `projeto-${p.id}`,
      gravidade: 'alta',
      titulo: `Prazo vencido: ${p.name}`,
      detalhe: `${p.code} passou do prazo contratual`,
      href: `/projetos/${p.id}`,
    });
  }

  for (const v of prazosVencidos.slice(0, 5)) {
    alertas.push({
      id: `aprovacao-${v.projectId}-${v.passo}`,
      gravidade: 'alta',
      titulo: `${v.orgao} atrasada ${v.diasAtraso} dia(s) em ${v.projectCode}`,
      detalhe: v.acao === 'ouvidoria'
        ? `"${v.passo}" sem resposta${v.protocolo ? ` (protocolo ${v.protocolo})` : ''} — considere a ouvidoria`
        : `"${v.passo}" passou do prazo${v.protocolo ? ` (protocolo ${v.protocolo})` : ''} — vale cobrar`,
      href: `/projetos/${v.projectId}`,
    });
  }

  for (const p of projetosSemArt) {
    const naoInformado = p.artStatus === 'NAO_INFORMADO';
    alertas.push({
      id: `art-${p.id}`,
      // exigir ART e não ter é pior que ainda não ter decidido
      gravidade: naoInformado ? 'media' : 'alta',
      titulo: naoInformado
        ? `${p.code} sem informação de ART`
        : `${p.code} exige ART e não tem`,
      detalhe: naoInformado
        ? `Ninguém informou se ${p.name} precisa de ART`
        : `${p.name} está em andamento sem responsabilidade técnica registrada`,
      href: `/projetos/${p.id}`,
    });
  }

  for (const p of propostasVencendo) {
    const validade = p.budgetVersion.validUntil;
    const dias = validade
      ? Math.ceil((validade.getTime() - hoje.getTime()) / 86_400_000)
      : 0;
    alertas.push({
      id: `proposta-${p.id}`,
      gravidade: 'media',
      titulo: `Proposta ${p.code} vence em ${dias} dia(s)`,
      detalhe: 'Cliente ainda não respondeu — vale retomar o contato',
      href: `/orcamentos/${p.budgetVersion.budgetId}`,
    });
  }

  if (tarefasAtrasadas > 0) {
    alertas.push({
      id: 'tarefas-atrasadas',
      gravidade: 'media',
      titulo: `${tarefasAtrasadas} tarefa(s) sua(s) em atraso`,
      detalhe: 'Prazo passou e ainda não foram concluídas',
      href: '/projetos',
    });
  }

  if (orcamentosParados > 0) {
    alertas.push({
      id: 'orcamentos-parados',
      gravidade: 'baixa',
      titulo: `${orcamentosParados} orçamento(s) parado(s) em aprovação`,
      detalhe: 'Aguardando decisão interna há mais de 3 dias',
      href: '/orcamentos?status=APROVACAO_INTERNA',
    });
  }

  const ordem = { alta: 0, media: 1, baixa: 2 };
  return alertas.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade]);
}
