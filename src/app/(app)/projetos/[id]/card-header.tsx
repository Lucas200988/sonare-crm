'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, CalendarClock, Pencil, Users } from 'lucide-react';
import { setProjectStatusAction, setProjectArchivedAction } from '@/actions/projects';
import { Badge, FormError } from '@/components/ui';
import { formatBRL } from '@/lib/money';
import { formatDateBR } from '@/lib/dates';
import { BOARD_COLUMNS, columnForStatus } from '@/config/project-board';
import { ProjectForm, type ProjectFormValues } from './project-actions';
import { FolderLink } from './folder-link';

const PRIORITY_LABEL: Record<string, { label: string; color: string }> = {
  BAIXA: { label: 'Baixa', color: 'slate' },
  MEDIA: { label: 'Média', color: 'blue' },
  ALTA: { label: 'Alta', color: 'amber' },
  URGENTE: { label: 'Urgente', color: 'red' },
};

/**
 * Topo do cartão: o essencial visível de imediato (situação, prazo, equipe) e
 * o formulário completo só quando o usuário pede para editar.
 */
export function CardHeader({
  projectId, code, name, status, priority, archived, clientName, contract,
  contractValue, contractualDeadline, technicalLead, members, disciplines, folderPath,
  canWrite, initial, clientUnits, users,
}: {
  projectId: string;
  code: string;
  name: string;
  status: string;
  priority: string;
  archived: boolean;
  clientName: string;
  contract: { id: string; code: string } | null;
  contractValue: string | null;
  contractualDeadline: string | null;
  technicalLead: string | null;
  members: { id: string; name: string }[];
  disciplines: string[];
  folderPath: string | null;
  canWrite: boolean;
  initial: ProjectFormValues;
  clientUnits: { id: string; name: string }[];
  users: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const colunaAtual = columnForStatus(status);
  const prioridade = PRIORITY_LABEL[priority] ?? PRIORITY_LABEL.MEDIA;

  const atrasado = contractualDeadline
    && new Date(contractualDeadline) < new Date()
    && colunaAtual?.id !== 'finalizado';

  function mudarColuna(novoStatus: string) {
    startTransition(async () => {
      setError(null);
      const r = await setProjectStatusAction(projectId, novoStatus);
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }

  function alternarArquivo() {
    startTransition(async () => {
      setError(null);
      const r = await setProjectArchivedAction(projectId, !archived);
      if (r.error) setError(r.error);
      else if (archived) router.refresh();
      else router.push('/projetos');
    });
  }

  if (editing) {
    return (
      <ProjectForm
        projectId={projectId}
        initial={initial}
        clientUnits={clientUnits}
        users={users}
        startOpen
        onClose={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {archived ? (
        <p className="mb-3 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
          Este cartão está arquivado e não aparece no quadro.
        </p>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-semibold text-slate-400">{code}</span>
          <h1 className="text-xl font-bold leading-tight text-slate-900">{name}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {clientName}
            {contract ? (
              <>
                {' · '}
                <Link href={`/contratos/${contract.id}`} className="text-brand hover:underline">{contract.code}</Link>
              </>
            ) : null}
            {contractValue ? ` · ${formatBRL(contractValue)}` : ''}
          </p>
        </div>

        {canWrite ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button" onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
            </button>
            <button
              type="button" onClick={alternarArquivo} disabled={pending}
              title={archived ? 'Restaurar cartão' : 'Arquivar cartão'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {archived
                ? <><ArchiveRestore className="h-3.5 w-3.5" aria-hidden /> Restaurar</>
                : <><Archive className="h-3.5 w-3.5" aria-hidden /> Arquivar</>}
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canWrite ? (
          <select
            value={colunaAtual?.status ?? status}
            disabled={pending}
            onChange={(e) => mudarColuna(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium"
            aria-label="Situação do projeto"
          >
            {BOARD_COLUMNS.map((c) => <option key={c.id} value={c.status}>{c.label}</option>)}
            <option value="CANCELADO">Cancelado</option>
          </select>
        ) : (
          <Badge color="blue">{colunaAtual?.label ?? status}</Badge>
        )}

        <Badge color={prioridade.color}>{prioridade.label}</Badge>

        {contractualDeadline ? (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${atrasado ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'}`}>
            <CalendarClock className="h-3 w-3" aria-hidden />
            {formatDateBR(contractualDeadline)}
            {atrasado ? ' — vencido' : ''}
          </span>
        ) : null}

        {technicalLead ? (
          <span className="text-xs text-slate-500">Resp. técnico: {technicalLead}</span>
        ) : null}

        {members.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500" title={members.map((m) => m.name).join(', ')}>
            <Users className="h-3 w-3" aria-hidden /> {members.length}
          </span>
        ) : null}

        {disciplines.map((d) => <Badge key={d} color="violet">{d}</Badge>)}
      </div>

      {folderPath ? <div className="mt-3"><FolderLink path={folderPath} /></div> : null}

      <FormError message={error} />
    </div>
  );
}

const TABS = [
  { id: 'visao', label: 'Visão geral' },
  { id: 'tarefas', label: 'Tarefas', count: 'tarefas' as const },
  { id: 'entregaveis', label: 'Entregáveis', count: 'entregaveis' as const },
  { id: 'arquivos', label: 'Arquivos', count: 'arquivos' as const },
  { id: 'horas', label: 'Horas' },
];

export function CardTabs({ projectId, current, counts, showHoras }: {
  projectId: string;
  current: string;
  counts: { tarefas: number; entregaveis: number; arquivos: number; comentarios: number };
  showHoras: boolean;
}) {
  const abas = showHoras ? TABS : TABS.filter((t) => t.id !== 'horas');

  return (
    <nav className="mt-4 flex gap-1 border-b border-slate-200" aria-label="Seções do projeto">
      {abas.map((t) => {
        const ativo = current === t.id;
        const total = t.count ? counts[t.count] : 0;
        return (
          <Link
            key={t.id}
            href={`/projetos/${projectId}?aba=${t.id}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              ativo ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
            {total > 0 ? <span className="ml-1.5 text-xs text-slate-400">{total}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
