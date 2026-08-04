import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import type { SessionUser } from '@/server/auth/session';

/**
 * Quem enxerga quais projetos.
 *
 * `project:read` dá acesso ao módulo; `project:read_all` dá acesso a todos os
 * cartões. Sem a segunda, a pessoa só vê os projetos em que está: na equipe,
 * como responsável técnico, como coordenadora, ou porque criou o cartão.
 *
 * Quem criou entra na lista de propósito — sem isso alguém criaria um projeto
 * e o perderia de vista no mesmo instante, antes de montar a equipe.
 */
export function veTodosOsProjetos(user: SessionUser): boolean {
  return user.permissions.has('project:read_all');
}

/**
 * Recorte para o `where` de qualquer consulta de projeto.
 *
 * Devolve `{}` para quem vê tudo, então dá para espalhar sem condicional na
 * chamada. Vai sempre em AND — o OR de dentro não pode disputar com o OR da
 * busca por texto.
 */
export function escopoDeProjetos(user: SessionUser): Prisma.ProjectWhereInput {
  if (veTodosOsProjetos(user)) return {};
  return {
    AND: [{
      OR: [
        { members: { some: { userId: user.id } } },
        { technicalLeadId: user.id },
        { coordinatorId: user.id },
        { createdById: user.id },
      ],
    }],
  };
}

/** Decide sobre um projeto já carregado — para checar depois da consulta. */
export function podeVerProjeto(
  user: SessionUser,
  projeto: {
    technicalLeadId: string | null;
    coordinatorId: string | null;
    createdById: string | null;
    members: { userId: string }[];
  },
): boolean {
  if (veTodosOsProjetos(user)) return true;
  return projeto.technicalLeadId === user.id
    || projeto.coordinatorId === user.id
    || projeto.createdById === user.id
    || projeto.members.some((m) => m.userId === user.id);
}
