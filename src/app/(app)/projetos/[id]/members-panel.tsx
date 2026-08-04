'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Check, Lock, Plus, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { setProjectMembersAction } from '@/actions/projects';

/** Iniciais do nome, para o disco de quem está na equipe. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? '?';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}

/**
 * Cor estável a partir do nome — a mesma pessoa tem sempre o mesmo disco,
 * o que faz a equipe ser reconhecida de relance no cartão.
 */
const CORES = [
  'bg-sky-600', 'bg-emerald-600', 'bg-violet-600', 'bg-amber-600',
  'bg-rose-600', 'bg-teal-600', 'bg-indigo-600', 'bg-orange-600',
];
function corDoNome(nome: string): string {
  let soma = 0;
  for (const c of nome) soma = (soma + c.charCodeAt(0)) % 997;
  return CORES[soma % CORES.length];
}

function Disco({ nome, titulo }: { nome: string; titulo?: string }) {
  return (
    <span
      title={titulo ?? nome}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white ring-2 ring-white ${corDoNome(nome)}`}
    >
      {iniciais(nome)}
    </span>
  );
}

/**
 * Equipe do cartão, no cabeçalho do projeto.
 *
 * A equipe é também quem enxerga o cartão, então ela mora aqui, visível e
 * editável em um clique — e não dentro do formulário de edição do projeto.
 */
export function MembersPanel({
  projectId, members, users, canWrite, restrito, responsaveis,
}: {
  projectId: string;
  members: { id: string; name: string }[];
  users: { id: string; name: string }[];
  canWrite: boolean;
  /** Há alguém na empresa que não vê todos os projetos? */
  restrito: boolean;
  /** Responsável técnico e coordenador: veem o cartão mesmo fora da equipe. */
  responsaveis: { id: string; name: string; papel: string }[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [selected, setSelected] = useState<string[]>(members.map((m) => m.id));
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora — comportamento esperado de um seletor solto na tela
  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  function alternar(userId: string) {
    const novo = selected.includes(userId)
      ? selected.filter((id) => id !== userId)
      : [...selected, userId];
    setSelected(novo);
    startTransition(async () => {
      setErro(null);
      const r = await setProjectMembersAction(projectId, novo);
      if (r.error) { setErro(r.error); setSelected(selected); }
      else router.refresh();
    });
  }

  const naEquipe = users.filter((u) => selected.includes(u.id));

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
          <Users className="h-3.5 w-3.5" aria-hidden /> Equipe
        </span>

        <div className="flex items-center -space-x-1.5">
          {naEquipe.map((u) => <Disco key={u.id} nome={u.name} />)}
          {responsaveis
            .filter((r) => !selected.includes(r.id))
            .map((r) => <Disco key={r.id} nome={r.name} titulo={`${r.name} · ${r.papel}`} />)}
        </div>

        {naEquipe.length === 0 && responsaveis.length === 0 ? (
          <span className="text-xs text-slate-400">ninguém atribuído</span>
        ) : null}

        {canWrite ? (
          <div className="relative" ref={caixa}>
            <button
              type="button"
              onClick={() => setAberto((v) => !v)}
              title="Adicionar ou remover pessoas"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>

            {aberto ? (
              <div className="absolute left-0 top-9 z-30 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                <p className="px-2 py-1 text-[11px] font-semibold text-slate-500">
                  Quem trabalha neste projeto
                </p>
                <div className="max-h-64 overflow-y-auto">
                  {users.map((u) => {
                    const marcado = selected.includes(u.id);
                    const papel = responsaveis.find((r) => r.id === u.id)?.papel;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => alternar(u.id)}
                        disabled={pending}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-slate-50 disabled:opacity-60 ${marcado ? 'text-slate-900' : 'text-slate-600'}`}
                      >
                        <Disco nome={u.name} />
                        <span className="min-w-0 flex-1 truncate">
                          {u.name}
                          {papel ? <span className="block text-[10px] text-slate-400">{papel}</span> : null}
                        </span>
                        {marcado ? <Check className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {restrito ? (
        <p className="mt-2 inline-flex items-start gap-1.5 text-[11px] text-slate-500">
          <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          Só quem está aqui — mais o responsável técnico, o coordenador e quem tem permissão
          de ver todos os projetos — enxerga este cartão.
        </p>
      ) : null}

      {erro ? <p className="mt-1 text-[11px] text-red-600">{erro}</p> : null}
    </div>
  );
}
