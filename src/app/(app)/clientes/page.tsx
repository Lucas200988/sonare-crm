import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { listClients } from '@/server/services/clients';
import { prisma } from '@/server/db';
import { PageHeader, PrimaryLink, Card, EmptyState, Badge, inputCls } from '@/components/ui';
import { formatCNPJ, formatCPF, formatPhoneBR } from '@/lib/br';
import type { ClientStatus, PersonType } from '@/generated/prisma/client';

export const metadata: Metadata = { title: 'Clientes — SONARE CRM' };

const STATUS_BADGE: Record<string, { color: string; label: string }> = {
  ATIVO: { color: 'green', label: 'Ativo' },
  INATIVO: { color: 'slate', label: 'Inativo' },
  BLOQUEADO: { color: 'red', label: 'Bloqueado' },
};

/** Documento formatado do cliente, ou null quando o cadastro não tem. */
function documento(c: { personType: PersonType; cnpj: string | null; cpf: string | null }): string | null {
  if (c.personType === 'JURIDICA') return c.cnpj ? formatCNPJ(c.cnpj) : null;
  return c.cpf ? formatCPF(c.cpf) : null;
}

export default async function ClientsPage(props: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermissionPage('client:read');
  const sp = await props.searchParams;

  const [{ items, total, page, totalPages }, leadSources] = await Promise.all([
    listClients(user, {
      search: sp.q,
      status: (sp.status as ClientStatus | 'TODOS') ?? 'TODOS',
      personType: sp.tipo === 'JURIDICA' || sp.tipo === 'FISICA' ? sp.tipo : 'TODOS',
      leadSourceId: sp.origem || undefined,
      semDocumento: sp.tipo === 'SEM_DOC',
      page: sp.pagina ? Number(sp.pagina) : 1,
    }),
    prisma.leadSource.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { sortOrder: 'asc' } }),
  ]);

  const canWrite = user.permissions.has('client:write');

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle={`${total} cliente(s) cadastrado(s)`}
        actions={canWrite ? (
          <PrimaryLink href="/clientes/novo"><Plus className="h-4 w-4" aria-hidden /> Novo cliente</PrimaryLink>
        ) : undefined}
      />

      <Card className="mb-4 p-4">
        <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
              <input
                type="search" name="q" defaultValue={sp.q ?? ''}
                placeholder="Nome, CNPJ/CPF, e-mail ou telefone…"
                className={`${inputCls} pl-9`}
              />
            </div>
          </div>
          <select name="status" defaultValue={sp.status ?? 'TODOS'} className={inputCls} aria-label="Status">
            <option value="TODOS">Todos os status</option>
            <option value="ATIVO">Ativo</option>
            <option value="INATIVO">Inativo</option>
            <option value="BLOQUEADO">Bloqueado</option>
          </select>
          <select name="tipo" defaultValue={sp.tipo ?? 'TODOS'} className={inputCls} aria-label="Tipo de pessoa">
            <option value="TODOS">PF e PJ</option>
            <option value="JURIDICA">Pessoa Jurídica</option>
            <option value="FISICA">Pessoa Física</option>
            <option value="SEM_DOC">Sem CNPJ/CPF</option>
          </select>
          <div className="flex gap-2">
            <select name="origem" defaultValue={sp.origem ?? ''} className={inputCls} aria-label="Origem">
              <option value="">Todas as origens</option>
              {leadSources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
              Filtrar
            </button>
          </div>
        </form>
      </Card>

      {items.length === 0 ? (
        <EmptyState
          title="Nenhum cliente encontrado"
          description={sp.q ? 'Ajuste a busca ou os filtros.' : 'Cadastre o primeiro cliente para começar.'}
          action={canWrite && !sp.q ? <PrimaryLink href="/clientes/novo"><Plus className="h-4 w-4" aria-hidden /> Novo cliente</PrimaryLink> : undefined}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">CNPJ / CPF</th>
                <th className="px-4 py-3 font-medium">Contato</th>
                <th className="px-4 py-3 font-medium">Cidade/UF</th>
                <th className="px-4 py-3 font-medium">Responsável</th>
                <th className="px-4 py-3 font-medium">Negócios</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((c) => {
                const badge = STATUS_BADGE[c.status];
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/clientes/${c.id}`} className="font-medium text-slate-900 hover:underline">
                        {c.legalName}
                      </Link>
                      {c.tradeName ? <p className="text-xs text-slate-500">{c.tradeName}</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                        {c.personType === 'JURIDICA' ? 'PJ' : 'PF'}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      {documento(c) ?? (
                        // sem documento não se emite nota: o cadastro precisa voltar
                        <span className="text-xs italic text-amber-600">não informado</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <p>{formatPhoneBR(c.phone ?? c.whatsapp)}</p>
                      {c.email ? <p className="text-xs text-slate-500">{c.email}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {c.city ? `${c.city}${c.state ? `/${c.state}` : ''}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.commercialOwner?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {c._count.opportunities} op. · {c._count.contracts} ctr. · {c._count.projects} prj.
                    </td>
                    <td className="px-4 py-3"><Badge color={badge.color}>{badge.label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Paginação" className="mt-4 flex items-center justify-center gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
            const params = new URLSearchParams(
              Object.entries(sp).filter(([, v]) => v) as [string, string][],
            );
            params.set('pagina', String(p));
            return (
              <Link
                key={p}
                href={`/clientes?${params.toString()}`}
                aria-current={p === page ? 'page' : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  p === page ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
                }`}
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
