'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, ChevronDown, ChevronUp, FileSignature, Plus, Trash2, Variable,
} from 'lucide-react';
import { saveContractTemplateAction } from '@/actions/settings';
import { inputCls, FormError } from '@/components/ui';
import { VARIAVEIS_CONTRATO, variaveisInvalidas } from '@/config/contract-variables';

export type ClausulaEditavel = { title: string; paragraphs: string[]; items: string[] };
export type ModeloContrato = {
  id: string;
  name: string;
  kind: string;
  preamble: string;
  clauses: ClausulaEditavel[];
};

/**
 * Edição das cláusulas dos modelos de contrato.
 *
 * A numeração (Cláusula Primeira, 1.1, 1.2…) é gerada na hora de montar a
 * minuta — aqui se escreve apenas o título e os parágrafos, na ordem.
 */
export function ContractTemplatesSection({ templates }: { templates: ModeloContrato[] }) {
  const [selecionado, setSelecionado] = useState(templates[0]?.id ?? '');
  const modelo = templates.find((t) => t.id === selecionado);

  if (templates.length === 0) {
    return (
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <FileSignature className="h-4 w-4 text-brand" aria-hidden /> Modelos de contrato
        </h2>
        <p className="mt-2 text-sm text-slate-500">Nenhum modelo cadastrado.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <FileSignature className="h-4 w-4 text-brand" aria-hidden /> Modelos de contrato
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        As cláusulas usadas na minuta em PDF. A numeração é automática — escreva só o
        título e os parágrafos.
      </p>

      <select
        value={selecionado}
        onChange={(e) => setSelecionado(e.target.value)}
        className={`${inputCls} mt-3 max-w-md`}
        aria-label="Modelo de contrato"
      >
        {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>

      {modelo ? <TemplateEditor key={modelo.id} modelo={modelo} /> : null}
    </div>
  );
}

function TemplateEditor({ modelo }: { modelo: ModeloContrato }) {
  const router = useRouter();
  const [preamble, setPreamble] = useState(modelo.preamble);
  const [clausulas, setClausulas] = useState<ClausulaEditavel[]>(modelo.clauses);
  const [abertas, setAbertas] = useState<number[]>([]);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [mostrarVariaveis, setMostrarVariaveis] = useState(false);

  // Variáveis digitadas que não existem — o PDF sairia com a chave crua
  const textoCompleto = [
    preamble,
    ...clausulas.flatMap((c) => [c.title, ...c.paragraphs, ...c.items]),
  ].join('\n');
  const invalidas = variaveisInvalidas(textoCompleto);

  function alterar(i: number, patch: Partial<ClausulaEditavel>) {
    setClausulas((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  function mover(i: number, direcao: -1 | 1) {
    const destino = i + direcao;
    if (destino < 0 || destino >= clausulas.length) return;
    setClausulas((prev) => {
      const copia = [...prev];
      [copia[i], copia[destino]] = [copia[destino], copia[i]];
      return copia;
    });
    setAbertas((prev) => prev.map((x) => (x === i ? destino : x === destino ? i : x)));
  }

  function salvar() {
    setErro(null); setInfo(null);
    startTransition(async () => {
      const r = await saveContractTemplateAction({
        templateId: modelo.id,
        preamble,
        clauses: clausulas.map((c) => ({
          title: c.title,
          paragraphs: c.paragraphs,
          items: c.items,
        })),
      });
      if (r.error) setErro(r.error);
      else { setInfo(r.info ?? 'Modelo salvo.'); router.refresh(); }
    });
  }

  return (
    <div className="mt-4 space-y-4">
      <div>
        <label htmlFor="ct-preambulo" className="mb-1 block text-sm font-medium text-slate-700">
          Preâmbulo
        </label>
        <textarea
          id="ct-preambulo"
          value={preamble}
          onChange={(e) => setPreamble(e.target.value)}
          rows={2}
          className={inputCls}
        />
        <p className="mt-1 text-[11px] text-slate-500">
          Texto de abertura, logo após a qualificação das partes.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setMostrarVariaveis((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        <Variable className="h-3.5 w-3.5" aria-hidden />
        {mostrarVariaveis ? 'Ocultar' : 'Ver'} variáveis disponíveis
      </button>

      {mostrarVariaveis ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs text-slate-600">
            Escreva <code className="rounded bg-white px-1">{'{{caminho}}'}</code> no texto — o valor
            entra na hora de gerar a minuta.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {VARIAVEIS_CONTRATO.map((g) => (
              <div key={g.grupo}>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {g.grupo}
                </p>
                <ul className="space-y-0.5">
                  {g.itens.map((v) => (
                    <li key={v.caminho}>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(`{{${v.caminho}}}`)}
                        title={`${v.descricao} — ex.: ${v.exemplo}. Clique para copiar.`}
                        className="w-full truncate text-left font-mono text-[11px] text-slate-600 hover:text-brand"
                      >
                        {`{{${v.caminho}}}`}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {invalidas.length > 0 ? (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Estas variáveis não existem e sairiam no PDF como texto:{' '}
            <span className="font-mono">{invalidas.map((v) => `{{${v}}}`).join(', ')}</span>
          </span>
        </p>
      ) : null}

      <ol className="space-y-2">
        {clausulas.map((c, i) => {
          const aberta = abertas.includes(i);
          return (
            <li key={i} className="rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="shrink-0 text-xs font-semibold text-slate-400">{i + 1}</span>
                <input
                  value={c.title}
                  onChange={(e) => alterar(i, { title: e.target.value })}
                  placeholder="TÍTULO DA CLÁUSULA"
                  aria-label={`Título da cláusula ${i + 1}`}
                  className="min-w-0 flex-1 rounded border border-transparent px-2 py-1 text-sm font-medium uppercase text-slate-800 hover:border-slate-200 focus:border-slate-300 focus:outline-none"
                />
                <div className="flex shrink-0 items-center gap-0.5">
                  <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Mover para cima" className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button type="button" onClick={() => mover(i, 1)} disabled={i === clausulas.length - 1} aria-label="Mover para baixo" className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAbertas((p) => (aberta ? p.filter((x) => x !== i) : [...p, i]))}
                    className="rounded px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                  >
                    {aberta ? 'Fechar' : `${c.paragraphs.length} parágrafo(s)`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm(`Remover a cláusula "${c.title}"?`)) return;
                      setClausulas((prev) => prev.filter((_, idx) => idx !== i));
                    }}
                    aria-label="Remover cláusula"
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>

              {aberta ? (
                <div className="space-y-2 border-t border-slate-100 p-3">
                  {c.paragraphs.map((p, pi) => (
                    <div key={pi} className="flex gap-2">
                      <span className="mt-2 shrink-0 text-[11px] text-slate-400">{i + 1}.{pi + 1}</span>
                      <textarea
                        value={p}
                        onChange={(e) => alterar(i, {
                          paragraphs: c.paragraphs.map((x, xi) => (xi === pi ? e.target.value : x)),
                        })}
                        rows={3}
                        aria-label={`Parágrafo ${i + 1}.${pi + 1}`}
                        className={inputCls}
                      />
                      <button
                        type="button"
                        onClick={() => alterar(i, { paragraphs: c.paragraphs.filter((_, xi) => xi !== pi) })}
                        aria-label="Remover parágrafo"
                        className="mt-1 h-7 shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => alterar(i, { paragraphs: [...c.paragraphs, ''] })}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Plus className="h-3 w-3" aria-hidden /> Parágrafo
                  </button>

                  {c.items.length > 0 ? (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <p className="mb-1 text-[11px] font-medium text-slate-500">
                        Itens em lista (I, II, III…)
                      </p>
                      {c.items.map((it, ii) => (
                        <div key={ii} className="mb-1 flex gap-2">
                          <input
                            value={it}
                            onChange={(e) => alterar(i, {
                              items: c.items.map((x, xi) => (xi === ii ? e.target.value : x)),
                            })}
                            aria-label={`Item ${ii + 1}`}
                            className={inputCls}
                          />
                          <button
                            type="button"
                            onClick={() => alterar(i, { items: c.items.filter((_, xi) => xi !== ii) })}
                            aria-label="Remover item"
                            className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => alterar(i, { items: [...c.items, ''] })}
                    className="ml-2 inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Plus className="h-3 w-3" aria-hidden /> Item de lista
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <button
        type="button"
        onClick={() => {
          setClausulas((prev) => [...prev, { title: '', paragraphs: [''], items: [] }]);
          setAbertas((prev) => [...prev, clausulas.length]);
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden /> Nova cláusula
      </button>

      <FormError message={erro} />
      {info ? <p className="text-xs text-green-700">{info}</p> : null}

      <div className="flex items-center gap-3 border-t border-slate-200 pt-3">
        <button
          type="button"
          onClick={salvar}
          disabled={pending}
          className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? 'Salvando…' : 'Salvar modelo'}
        </button>
        <p className="text-[11px] text-slate-500">
          Vale para as próximas minutas. As já geradas ficam preservadas no histórico do contrato.
        </p>
      </div>
    </div>
  );
}
