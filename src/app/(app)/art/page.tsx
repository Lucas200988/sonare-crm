import type { Metadata } from 'next';
import { ExportButton } from '@/components/export-button';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { escopoDeProjetos } from '@/server/auth/project-scope';
import { prisma } from '@/server/db';
import {
  listTechResps, getProjectsWithoutTechResp, type TechRespFilter,
} from '@/server/services/tech-resp';
import { PageHeader, Card, EmptyState, Badge, inputCls } from '@/components/ui';
import { formatBRL } from '@/lib/money';
import { formatDateBR } from '@/lib/dates';
import { NewTechResp, DischargeButton, TechRespRowActions } from './tech-resp-actions';

export const metadata: Metadata = { title: 'ART / RRT — SONARE CRM' };

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  PENDENTE: { label: 'Pendente', color: 'amber' },
  EMITIDA: { label: 'Emitida', color: 'blue' },
  BAIXADA: { label: 'Baixada', color: 'green' },
  CANCELADA: { label: 'Cancelada', color: 'slate' },
};

export default async function TechRespPage(props: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermissionPage('project:read');
  const sp = await props.searchParams;
  const canWrite = user.permissions.has('techresp:write');

  const [{ items, total, page, totalPages, somaValor }, projects, professionals, semArt] =
    await Promise.all([
      listTechResps(user, {
        search: sp.q,
        status: (sp.status as TechRespFilter['status']) ?? 'TODOS',
        page: sp.pagina ? Number(sp.pagina) : 1,
      }),
      prisma.project.findMany({
        where: {
          companyId: user.companyId, deletedAt: null, archivedAt: null,
          ...escopoDeProjetos(user),
        },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'desc' },
        take: 100,
      }),
      prisma.user.findMany({
        where: { companyId: user.companyId, active: true, deletedAt: null },
        select: { id: true, name: true, creaCau: true },
        orderBy: { name: 'asc' },
      }),
      getProjectsWithoutTechResp(user),
    ]);

  return (
    <div>
      <PageHeader
        title="ART / RRT"
        subtitle={`${total} registro(s) · ${formatBRL(somaValor)} em taxas`}
        actions={<div className="flex items-center gap-2"><ExportButton tipo="art" />{canWrite ? <NewTechResp projects={projects} professionals={professionals} /> : null}</div>}
      />

      <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        O registro da ART continua sendo feito no portal do CREA/CAU. Aqui fica o controle de
        qual documento cobre qual projeto, quanto foi pago e o que ainda falta baixar.
      </p>

      {semArt.length > 0 ? (
        <Card className="mb-4 border-amber-200 bg-amber-50 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {semArt.length} projeto(s) ativo(s) sem ART registrada
          </h2>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {semArt.slice(0, 8).map((p) => (
              <li key={p.id}>
                <Link href={`/projetos/${p.id}`} className="text-xs text-amber-900 hover:underline">
                  {p.code} — {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="mb-4 p-4">
        <form method="get" className="flex flex-wrap gap-3">
          <input
            type="search" name="q" defaultValue={sp.q ?? ''}
            placeholder="Número, profissional, serviço ou projeto…"
            className={`${inputCls} max-w-xs`}
          />
          <select name="status" defaultValue={sp.status ?? 'TODOS'} className={`${inputCls} max-w-48`} aria-label="Situação">
            <option value="TODOS">Todas</option>
            <option value="PENDENTES">Pendentes e emitidas</option>
            <option value="PENDENTE">Pendentes</option>
            <option value="EMITIDA">Emitidas</option>
            <option value="BAIXADA">Baixadas</option>
            <option value="CANCELADA">Canceladas</option>
          </select>
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Filtrar
          </button>
        </form>
      </Card>

      {items.length === 0 ? (
        <EmptyState
          title="Nenhuma ART cadastrada"
          description="Registre aqui as ARTs emitidas para acompanhar prazos e baixas."
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Documento</th>
                <th className="px-4 py-3 font-medium">Profissional</th>
                <th className="px-4 py-3 font-medium">Projeto</th>
                <th className="px-4 py-3 font-medium">Emissão</th>
                <th className="px-4 py-3 text-right font-medium">Taxa</th>
                <th className="px-4 py-3 font-medium">Situação</th>
                {canWrite ? <th className="px-4 py-3" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((t) => {
                const badge = STATUS_BADGE[t.status] ?? STATUS_BADGE.PENDENTE;
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-900">{t.docType} {t.number}</span>
                      {t.council ? <p className="text-[11px] text-slate-400">{t.council}</p> : null}
                      {t.serviceDescription ? (
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{t.serviceDescription}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {t.professional?.name ?? t.professionalName ?? '—'}
                      {t.registration ? <p className="text-[11px] text-slate-400">{t.registration}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {t.project ? (
                        <Link href={`/projetos/${t.project.id}`} className="hover:underline">
                          {t.project.code}
                        </Link>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {t.issuedAt ? formatDateBR(t.issuedAt) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {t.value ? formatBRL(t.value) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={badge.color}>{badge.label}</Badge>
                      {t.dischargedAt ? (
                        <p className="text-[11px] text-slate-400">baixa {formatDateBR(t.dischargedAt)}</p>
                      ) : null}
                    </td>
                    {canWrite ? (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {t.status === 'EMITIDA' ? (
                            <DischargeButton id={t.id} numero={`${t.docType} ${t.number}`} />
                          ) : null}
                          <TechRespRowActions id={t.id} status={t.status} />
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Paginação" className="mt-4 flex justify-center gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
            const params = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
            params.set('pagina', String(p));
            return (
              <Link
                key={p}
                href={`/art?${params.toString()}`}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${p === page ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
              >
                {p}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
