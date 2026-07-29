'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { globalSearchAction } from '@/actions/search';
import type { SearchHit } from '@/server/services/search';

const ROTULO: Record<SearchHit['tipo'], { label: string; cor: string }> = {
  cliente: { label: 'Cliente', cor: 'bg-sky-100 text-sky-800' },
  oportunidade: { label: 'Oportunidade', cor: 'bg-violet-100 text-violet-800' },
  orcamento: { label: 'Orçamento', cor: 'bg-amber-100 text-amber-800' },
  contrato: { label: 'Contrato', cor: 'bg-slate-200 text-slate-800' },
  projeto: { label: 'Projeto', cor: 'bg-green-100 text-green-800' },
  parcela: { label: 'Parcela', cor: 'bg-red-100 text-red-800' },
};

/**
 * Busca única do sistema, aberta por Ctrl+K.
 *
 * Consulta clientes, oportunidades, orçamentos, contratos, projetos e
 * parcelas de uma vez — evita lembrar em qual tela o registro está.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [ativo, setAtivo] = useState(0);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl+K / Cmd+K abre; Esc fecha
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAberto(true);
      }
      if (e.key === 'Escape') setAberto(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (aberto) setTimeout(() => inputRef.current?.focus(), 50);
    else { setTermo(''); setHits([]); setAtivo(0); }
  }, [aberto]);

  // Espera a digitação parar antes de consultar, para não disparar a cada tecla
  useEffect(() => {
    if (termo.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => {
      startTransition(async () => {
        setHits(await globalSearchAction(termo));
        setAtivo(0);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [termo]);

  function abrir(hit: SearchHit) {
    setAberto(false);
    router.push(hit.href);
  }

  function navegar(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((i) => Math.min(i + 1, hits.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && hits[ativo]) { e.preventDefault(); abrir(hits[ativo]); }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-400 transition hover:border-slate-600 hover:text-slate-200"
      >
        <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="flex-1 text-left">Buscar…</span>
        <kbd className="rounded border border-slate-600 px-1 text-[10px]">Ctrl K</kbd>
      </button>

      {aberto ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/50 p-4 pt-24"
          role="dialog"
          aria-modal="true"
          aria-label="Busca do sistema"
          onClick={(e) => { if (e.target === e.currentTarget) setAberto(false); }}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <input
                ref={inputRef}
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                onKeyDown={navegar}
                placeholder="Cliente, código, projeto, contrato…"
                className="flex-1 text-sm outline-none"
                aria-label="Termo de busca"
              />
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar busca" className="rounded p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {termo.trim().length < 2 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">
                  Digite ao menos 2 letras. Busca por nome, código, CNPJ ou descrição.
                </p>
              ) : pending && hits.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">Procurando…</p>
              ) : hits.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">
                  Nada encontrado para “{termo}”.
                </p>
              ) : (
                <ul>
                  {hits.map((hit, i) => {
                    const r = ROTULO[hit.tipo];
                    return (
                      <li key={`${hit.tipo}-${hit.id}`}>
                        <button
                          type="button"
                          onClick={() => abrir(hit)}
                          onMouseEnter={() => setAtivo(i)}
                          className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${i === ativo ? 'bg-slate-100' : ''}`}
                        >
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${r.cor}`}>
                            {r.label}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-slate-900">{hit.titulo}</span>
                            {hit.subtitulo ? (
                              <span className="block truncate text-xs text-slate-500">{hit.subtitulo}</span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {hits.length > 0 ? (
              <p className="border-t border-slate-200 px-4 py-2 text-[11px] text-slate-400">
                ↑ ↓ para navegar · Enter para abrir · Esc para fechar
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
