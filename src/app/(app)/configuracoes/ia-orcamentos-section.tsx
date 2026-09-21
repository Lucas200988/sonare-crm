'use client';

import { useActionState, useState, useTransition } from 'react';
import { CheckCircle2, Database, FileSpreadsheet } from 'lucide-react';
import {
  reindexarConhecimentoAction, saveAiQuoteSettingsAction, type AiActionState,
} from '@/actions/ai';
import { inputCls, Field, FormError } from '@/components/ui';

export type AiQuoteSettings = {
  usarHistorico: boolean;
  maxSimilares: number;
  somenteAprovadas: boolean;
  considerarRecusadas: boolean;
  permitirSugestaoPreco: boolean;
  permitirRascunho: boolean;
};

export type BaseComercial = { orcamentos: number; indexados: number; comEmbedding: number };

function Toggle({ name, rotulo, dica, ligado }: {
  name: keyof AiQuoteSettings; rotulo: string; dica: string; ligado: boolean;
}) {
  return (
    <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={ligado} className="mt-0.5 rounded border-slate-300" />
      <span>
        <span className="block font-medium text-slate-800">{rotulo}</span>
        <span className="block text-[11px] text-slate-500">{dica}</span>
      </span>
    </label>
  );
}

/**
 * Configurações → IA → Orçamentos: como o Jarvis usa a base comercial.
 * O que NÃO é configurável, de propósito: confirmação antes de gerar
 * (sempre) e envio direto ao cliente (não existe).
 */
export function IaOrcamentosSection({ settings, base }: { settings: AiQuoteSettings; base: BaseComercial }) {
  const [state, formAction, pending] = useActionState<AiActionState, FormData>(saveAiQuoteSettingsAction, {});
  const [reindex, setReindex] = useState<AiActionState | null>(null);
  const [reindexando, startReindex] = useTransition();

  return (
    <div>
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <FileSpreadsheet className="h-4 w-4 text-brand" aria-hidden /> IA → Orçamentos (Jarvis comercial)
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        O Jarvis monta orçamentos e propostas por conversa usando o módulo de orçamento como fonte de
        verdade: preços vêm do catálogo, do histórico ou da pessoa — nunca do modelo. A confirmação antes
        de gerar a proposta é sempre exigida, e a IA nunca envia proposta ao cliente.
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Toggle name="usarHistorico" ligado={settings.usarHistorico} rotulo="Usar histórico de propostas" dica="Consulta a base de conhecimento comercial para fundamentar preços." />
          <Toggle name="permitirSugestaoPreco" ligado={settings.permitirSugestaoPreco} rotulo="Permitir sugestão de preço" dica="Desligado, o Jarvis só usa preço de tabela ou o informado pela pessoa." />
          <Toggle name="somenteAprovadas" ligado={settings.somenteAprovadas} rotulo="Somente propostas aceitas/convertidas" dica="Restringe as referências ao que o mercado validou." />
          <Toggle name="considerarRecusadas" ligado={settings.considerarRecusadas} rotulo="Considerar propostas recusadas" dica="Entram com peso baixo — servem como teto do que não converteu." />
          <Toggle name="permitirRascunho" ligado={settings.permitirRascunho} rotulo="Permitir criação de rascunho" dica="Desligado, o Jarvis só pesquisa e compara; não monta orçamento." />
          <Field label="Máximo de propostas semelhantes consultadas" htmlFor="q-max">
            <input id="q-max" name="maxSimilares" type="number" min={1} max={15} defaultValue={settings.maxSimilares} className={inputCls} />
          </Field>
        </div>

        <FormError message={state.error} />
        {state.info ? (
          <p className="flex items-center gap-1.5 text-xs text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {state.info}
          </p>
        ) : null}
        <button
          type="submit" disabled={pending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? 'Salvando…' : 'Salvar configuração'}
        </button>
      </form>

      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <Database className="h-3.5 w-3.5" aria-hidden /> Base de conhecimento comercial
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          {base.indexados} de {base.orcamentos} orçamento(s) indexado(s); {base.comEmbedding} com busca
          semântica. Novos orçamentos entram sozinhos ao serem salvos, aprovados, recusados ou convertidos.
        </p>
        <button
          type="button"
          disabled={reindexando}
          onClick={() => startReindex(async () => setReindex(await reindexarConhecimentoAction()))}
          className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {reindexando ? 'Reindexando…' : 'Reindexar tudo agora'}
        </button>
        {reindex?.info ? <p className="mt-2 text-[11px] text-green-700">{reindex.info}</p> : null}
        {reindex?.error ? <p className="mt-2 text-[11px] text-red-700">{reindex.error}</p> : null}
      </div>
    </div>
  );
}
