import 'server-only';
import { escopoDeProjetos } from '@/server/auth/project-scope';
import { prisma } from '@/server/db';
import type { SessionUser } from '@/server/auth/session';

export type SearchHit = {
  tipo: 'cliente' | 'oportunidade' | 'orcamento' | 'contrato' | 'projeto' | 'parcela';
  id: string;
  titulo: string;
  subtitulo: string | null;
  href: string;
};

/**
 * Busca única sobre os registros que a pessoa tem permissão de ver.
 *
 * Cada área é consultada em paralelo e limitada a poucos resultados — o
 * objetivo é chegar rápido ao registro certo, não paginar tudo.
 */
export async function globalSearch(user: SessionUser, termo: string): Promise<SearchHit[]> {
  const q = termo.trim();
  if (q.length < 2) return [];

  const base = { companyId: user.companyId, deletedAt: null };
  const contains = { contains: q, mode: 'insensitive' as const };
  const pode = (p: string) => user.permissions.has(p);

  const [clientes, oportunidades, orcamentos, contratos, projetos, parcelas] = await Promise.all([
    pode('client:read')
      ? prisma.client.findMany({
          where: {
            ...base,
            OR: [
              { legalName: contains }, { tradeName: contains },
              { cnpj: contains }, { cpf: contains }, { email: contains },
            ],
          },
          select: { id: true, legalName: true, tradeName: true, city: true },
          take: 5,
        })
      : [],
    pode('opportunity:read')
      ? prisma.opportunity.findMany({
          where: {
            ...base,
            OR: [{ code: contains }, { title: contains }, { client: { legalName: contains } }],
          },
          select: { id: true, code: true, title: true, client: { select: { legalName: true, tradeName: true } } },
          take: 5,
        })
      : [],
    pode('budget:read')
      ? prisma.budget.findMany({
          where: {
            ...base,
            OR: [{ code: contains }, { client: { legalName: contains } }],
          },
          select: {
            id: true, code: true, status: true,
            client: { select: { legalName: true, tradeName: true } },
          },
          take: 5,
        })
      : [],
    pode('contract:read')
      ? prisma.contract.findMany({
          where: {
            ...base,
            OR: [
              { code: contains }, { contractNumber: contains },
              { subject: contains }, { client: { legalName: contains } },
            ],
          },
          select: {
            id: true, code: true, subject: true,
            client: { select: { legalName: true, tradeName: true } },
          },
          take: 5,
        })
      : [],
    pode('project:read')
      ? prisma.project.findMany({
          where: {
            ...base,
            ...escopoDeProjetos(user),
            OR: [{ code: contains }, { name: contains }, { client: { legalName: contains } }],
          },
          select: {
            id: true, code: true, name: true, archivedAt: true,
            client: { select: { legalName: true, tradeName: true } },
          },
          take: 5,
        })
      : [],
    pode('finance:read')
      ? prisma.receivable.findMany({
          where: {
            ...base,
            OR: [{ code: contains }, { description: contains }, { client: { legalName: contains } }],
          },
          select: {
            id: true, code: true, description: true, netValue: true,
            client: { select: { legalName: true, tradeName: true } },
          },
          take: 5,
        })
      : [],
  ]);

  const nome = (c: { legalName: string; tradeName: string | null }) => c.tradeName ?? c.legalName;

  return [
    ...clientes.map((c): SearchHit => ({
      tipo: 'cliente', id: c.id,
      titulo: c.tradeName ?? c.legalName,
      subtitulo: c.city,
      href: `/clientes/${c.id}`,
    })),
    ...oportunidades.map((o): SearchHit => ({
      tipo: 'oportunidade', id: o.id,
      titulo: o.title,
      subtitulo: `${o.code} · ${nome(o.client)}`,
      href: `/crm/${o.id}`,
    })),
    ...orcamentos.map((b): SearchHit => ({
      tipo: 'orcamento', id: b.id,
      titulo: b.code,
      subtitulo: nome(b.client),
      href: `/orcamentos/${b.id}`,
    })),
    ...contratos.map((c): SearchHit => ({
      tipo: 'contrato', id: c.id,
      titulo: c.code,
      subtitulo: `${c.subject.slice(0, 60)} · ${nome(c.client)}`,
      href: `/contratos/${c.id}`,
    })),
    ...projetos.map((p): SearchHit => ({
      tipo: 'projeto', id: p.id,
      titulo: p.name,
      subtitulo: `${p.code} · ${nome(p.client)}${p.archivedAt ? ' · arquivado' : ''}`,
      href: `/projetos/${p.id}`,
    })),
    ...parcelas.map((r): SearchHit => ({
      tipo: 'parcela', id: r.id,
      titulo: r.description,
      subtitulo: `${r.code} · ${nome(r.client)}`,
      href: '/financeiro/receber',
    })),
  ];
}
