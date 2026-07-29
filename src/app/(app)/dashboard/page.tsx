import type { Metadata } from 'next';
import Link from 'next/link';
import {
  BellRing, Calculator, Send, FolderKanban, SearchCheck, HandCoins, type LucideIcon,
} from 'lucide-react';
import { requireAuth } from '@/server/auth/guards';
import { prisma } from '@/server/db';
import { getAlerts } from '@/server/services/alerts';

export const metadata: Metadata = { title: 'Dashboard — SONARE CRM' };

// Status de projeto considerados "em análise" (aguardando terceiros/cliente)
const ANALYSIS_STATUSES = [
  'ENVIADO_AO_CLIENTE', 'AGUARDANDO_APROVACAO', 'EM_REVISAO_DO_CLIENTE',
  'EM_APROVACAO_EXTERNA', 'AGUARDANDO_CONCESSIONARIA', 'AGUARDANDO_ORGAO_PUBLICO',
] as const;

const CLOSED_STATUSES = ['CONCLUIDO', 'ENCERRADO', 'CANCELADO', 'SUSPENSO'] as const;

async function loadIndicators(companyId: string) {
  try {
    const [budgetsTodo, oppsInBudgetStage, proposalsWaiting, projectsActive, projectsAnalysis, projectsAwaitingPayment] =
      await Promise.all([
        // Orçamentos em elaboração/revisão interna
        prisma.budget.count({
          where: {
            companyId, deletedAt: null,
            status: { in: ['RASCUNHO', 'EM_REVISAO', 'APROVACAO_INTERNA'] },
          },
        }),
        // Oportunidades paradas em etapa de orçamento ainda sem orçamento criado
        prisma.opportunity.count({
          where: {
            companyId, deletedAt: null, closedAt: null,
            stage: { name: { contains: 'Orçamento', mode: 'insensitive' } },
            budgets: { none: { deletedAt: null } },
          },
        }),
        // Propostas enviadas aguardando retorno do cliente
        prisma.proposal.count({
          where: { companyId, deletedAt: null, status: { in: ['ENVIADA', 'VISUALIZADA'] } },
        }),
        // Projetos em andamento (trabalho interno ativo)
        prisma.project.count({
          where: {
            companyId, deletedAt: null,
            status: { notIn: [...ANALYSIS_STATUSES, ...CLOSED_STATUSES] },
          },
        }),
        // Projetos em análise (cliente, concessionária, órgãos)
        prisma.project.count({
          where: { companyId, deletedAt: null, status: { in: [...ANALYSIS_STATUSES] } },
        }),
        // Projetos concluídos aguardando pagamento
        prisma.project.count({
          where: {
            companyId, deletedAt: null, status: 'CONCLUIDO',
            OR: [
              { receivables: { some: { deletedAt: null, status: { notIn: ['RECEBIDO', 'CANCELADO'] } } } },
              { receivables: { none: { deletedAt: null } } },
            ],
          },
        }),
      ]);
    return {
      ok: true as const,
      budgetsTodo: budgetsTodo + oppsInBudgetStage,
      proposalsWaiting,
      projectsActive,
      projectsAnalysis,
      projectsAwaitingPayment,
    };
  } catch {
    return { ok: false as const };
  }
}

export default async function DashboardPage() {
  const user = await requireAuth();
  const [data, alertas] = await Promise.all([
    loadIndicators(user.companyId),
    getAlerts(user).catch(() => []),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">Situação da operação em tempo real</p>

      {alertas.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <BellRing className="h-4 w-4 text-amber-500" aria-hidden /> Precisa da sua atenção
          </h2>
          <ul className="space-y-2">
            {alertas.slice(0, 6).map((a) => {
              const cor = {
                alta: 'border-red-200 bg-red-50 text-red-900',
                media: 'border-amber-200 bg-amber-50 text-amber-900',
                baixa: 'border-slate-200 bg-white text-slate-700',
              }[a.gravidade];
              return (
                <li key={a.id}>
                  <Link
                    href={a.href}
                    className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 transition hover:shadow-sm ${cor}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{a.titulo}</span>
                      <span className="block truncate text-xs opacity-75">{a.detalhe}</span>
                    </span>
                    <span className="shrink-0 text-xs font-medium opacity-60">abrir →</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {!data.ok ? (
        <div className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-semibold">Banco de dados indisponível</p>
          <p className="mt-1">Verifique a conexão configurada no arquivo <code className="rounded bg-amber-100 px-1">.env</code>.</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Card
            label="Orçamentos a fazer"
            hint="Em elaboração ou revisão interna"
            value={data.budgetsTodo}
            icon={Calculator}
            href="/orcamentos?status=A_FAZER"
          />
          <Card
            label="Orçamentos entregues"
            hint="Aguardando retorno do cliente"
            value={data.proposalsWaiting}
            icon={Send}
            href="/orcamentos?status=AGUARDANDO_RETORNO"
          />
          <Card
            label="Projetos em andamento"
            hint="Trabalho interno ativo"
            value={data.projectsActive}
            icon={FolderKanban}
            href="/projetos"
          />
          <Card
            label="Projetos em análise"
            hint="Cliente, concessionária ou órgãos"
            value={data.projectsAnalysis}
            icon={SearchCheck}
            href="/projetos"
          />
          <Card
            label="Concluídos aguardando pagamento"
            hint="Entregues, com recebimento pendente"
            value={data.projectsAwaitingPayment}
            icon={HandCoins}
            href="/financeiro"
          />
        </div>
      )}
    </div>
  );
}

function Card({
  label, hint, value, icon: Icon, href,
}: {
  label: string; hint: string; value: number; icon: LucideIcon; href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand/40 hover:shadow"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>
        </div>
        <span className="rounded-lg bg-brand-light p-2 text-brand transition group-hover:bg-brand group-hover:text-white">
          <Icon className="h-4.5 w-4.5" aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
    </Link>
  );
}
