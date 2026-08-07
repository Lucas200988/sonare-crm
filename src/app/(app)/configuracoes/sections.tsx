'use client';

import { Fragment, useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  addCatalogItemAction, toggleCatalogItemAction, addStageAction, toggleStageAction,
  setStageCelebrateAction,
  saveServiceAction, toggleServiceAction, updateRetentionAction, type ActionState,
} from '@/actions/catalogs';
import { inputCls, FormError } from '@/components/ui';
import { formatBRL } from '@/lib/money';
import { formatDecimalBR } from '@/lib/parse';

type SimpleItem = { id: string; name: string; active: boolean };

export function SimpleCatalogSection({
  title, catalog, items,
}: {
  title: string;
  catalog: 'leadSource' | 'lossReason' | 'paymentMethod';
  items: SimpleItem[];
}) {
  const action = addCatalogItemAction.bind(null, catalog);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <form action={formAction} className="mt-3 flex gap-2">
        <input name="name" placeholder="Novo item…" required className={inputCls} aria-label={`Adicionar em ${title}`} />
        <button type="submit" disabled={pending} className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-white hover:bg-slate-700 disabled:opacity-60" aria-label="Adicionar">
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </form>
      <FormError message={state.error} />
      <ul className="mt-3 space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <span className={item.active ? 'text-slate-800' : 'text-slate-400 line-through'}>{item.name}</span>
            <button
              type="button"
              onClick={() => void toggleCatalogItemAction(catalog, item.id, !item.active)}
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                item.active ? 'text-slate-500 hover:bg-slate-100' : 'text-green-600 hover:bg-green-50'
              }`}
            >
              {item.active ? 'Desativar' : 'Reativar'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

type StageItem = {
  id: string; name: string; kind: string; color: string | null;
  active: boolean; celebrate: boolean;
};

const KIND_LABEL: Record<string, string> = {
  ABERTA: 'Aberta', GANHA: 'Ganho', PERDIDA: 'Perda', SUSPENSA: 'Suspensa',
};

export function StagesSection({ stages }: { stages: StageItem[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(addStageAction, {});

  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900">Etapas do pipeline</h2>
      <p className="mt-1 text-xs text-slate-500">
        A ordem define o quadro Kanban. Etapas de ganho/perda encerram a oportunidade.
        A etapa marcada com 🎉 comemora na tela quando um cartão chega nela.
      </p>
      <form action={formAction} className="mt-3 flex flex-wrap gap-2">
        <input name="name" placeholder="Nova etapa…" required className={`${inputCls} flex-1`} aria-label="Nome da etapa" />
        <select name="kind" defaultValue="ABERTA" className={`${inputCls} w-32`} aria-label="Tipo da etapa">
          {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input name="color" type="color" defaultValue="#0ea5e9" className="h-9 w-12 cursor-pointer rounded-lg border border-slate-300" aria-label="Cor" />
        <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-3 py-2 text-white hover:bg-slate-700 disabled:opacity-60" aria-label="Adicionar etapa">
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </form>
      <FormError message={state.error} />
      <ul className="mt-3 space-y-1.5">
        {stages.map((s) => (
          <li key={s.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color ?? '#94a3b8' }} />
              <span className={s.active ? 'text-slate-800' : 'text-slate-400 line-through'}>{s.name}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{KIND_LABEL[s.kind]}</span>
            </span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void setStageCelebrateAction(s.id, !s.celebrate)}
                title={s.celebrate
                  ? 'Comemora quando um cartão chega aqui'
                  : 'Marcar como a etapa da comemoração'}
                aria-pressed={s.celebrate}
                className={`rounded px-2 py-0.5 text-xs ${
                  s.celebrate ? 'bg-green-50' : 'opacity-30 grayscale hover:opacity-70'
                }`}
              >
                🎉
              </button>
              <button
              type="button"
              onClick={() => void toggleStageAction(s.id, !s.active)}
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                s.active ? 'text-slate-500 hover:bg-slate-100' : 'text-green-600 hover:bg-green-50'
              }`}
            >
              {s.active ? 'Desativar' : 'Reativar'}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type ServiceItem = {
  id: string; code: string; name: string; category: string | null;
  unit: string | null; defaultPrice: string | null; estimatedCost: string | null;
  scopeTemplate: string | null; premisesTemplate: string | null;
  exclusionsTemplate: string | null; active: boolean;
};

const textareaCls = `${inputCls} min-h-[90px] resize-y`;

/**
 * Formulário de um serviço do catálogo — o mesmo para criar e para editar.
 *
 * É aqui que entram o preço base e os textos padrão de escopo, premissas e
 * exclusões: sem eles, escolher o serviço no orçamento não preenche nada.
 */
function ServiceForm({ service, onDone }: { service: ServiceItem | null; onDone: () => void }) {
  const action = saveServiceAction.bind(null, service?.id ?? null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const result = await action(prev, fd);
      if (!result.error) onDone();
      return result;
    },
    {},
  );

  return (
    <form action={formAction} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-6">
      <input name="code" placeholder="Código" required defaultValue={service?.code} className={inputCls} aria-label="Código" />
      <input name="name" placeholder="Nome do serviço" required defaultValue={service?.name} className={`${inputCls} sm:col-span-3`} aria-label="Nome" />
      <input name="category" placeholder="Categoria" defaultValue={service?.category ?? ''} className={inputCls} aria-label="Categoria" />
      <input name="unit" placeholder="Unidade (un, m², h)" defaultValue={service?.unit ?? ''} className={inputCls} aria-label="Unidade" />
      <input name="defaultPrice" placeholder="Preço base" inputMode="decimal" defaultValue={service?.defaultPrice ? formatDecimalBR(service.defaultPrice) : ''} className={`${inputCls} sm:col-span-3`} aria-label="Preço base" />
      <input name="estimatedCost" placeholder="Custo estimado" inputMode="decimal" defaultValue={service?.estimatedCost ? formatDecimalBR(service.estimatedCost) : ''} className={`${inputCls} sm:col-span-3`} aria-label="Custo estimado" />

      <div className="col-span-2 sm:col-span-6">
        <p className="mb-2 text-xs text-slate-500">
          Os textos abaixo entram sozinhos no orçamento quando este serviço é escolhido —
          desde que o campo correspondente ainda esteja em branco.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs font-medium text-slate-600">
            Escopo padrão
            <textarea name="scopeTemplate" defaultValue={service?.scopeTemplate ?? ''} className={textareaCls} placeholder="Uma linha por item do escopo…" />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Premissas
            <textarea name="premisesTemplate" defaultValue={service?.premisesTemplate ?? ''} className={textareaCls} placeholder="O que assumimos para este serviço…" />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Exclusões
            <textarea name="exclusionsTemplate" defaultValue={service?.exclusionsTemplate ?? ''} className={textareaCls} placeholder="O que NÃO está incluso…" />
          </label>
        </div>
      </div>

      <div className="col-span-2 flex items-center gap-2 sm:col-span-6">
        <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
          {pending ? 'Salvando…' : 'Salvar serviço'}
        </button>
        <button type="button" onClick={onDone} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
          Cancelar
        </button>
        <FormError message={state.error} />
      </div>
    </form>
  );
}

export function ServicesSection({ services }: { services: ServiceItem[] }) {
  // `null` = nada aberto; `'novo'` = criando; caso contrário, o id em edição.
  const [aberto, setAberto] = useState<string | null>(null);
  const semPreco = services.filter((s) => s.active && !s.defaultPrice).length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Catálogo de serviços ({services.length})</h2>
        <button
          type="button"
          onClick={() => setAberto(aberto === 'novo' ? null : 'novo')}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> {aberto === 'novo' ? 'Fechar' : 'Novo serviço'}
        </button>
      </div>

      {semPreco > 0 ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {semPreco} serviço(s) ainda sem preço base. Enquanto isso, escolher o serviço no
          orçamento não sugere valor nenhum.
        </p>
      ) : null}

      {aberto === 'novo' ? (
        <div className="mt-3">
          <ServiceForm service={null} onDone={() => setAberto(null)} />
        </div>
      ) : null}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2 pr-3 font-medium">Código</th>
              <th className="py-2 pr-3 font-medium">Serviço</th>
              <th className="py-2 pr-3 font-medium">Preço base</th>
              <th className="py-2 pr-3 font-medium">Escopo padrão</th>
              <th className="py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {services.map((s) => (
              <Fragment key={s.id}>
                <tr className={s.active ? '' : 'opacity-50'}>
                  <td className="py-2 pr-3 font-mono text-xs">{s.code}</td>
                  <td className="py-2 pr-3">
                    {s.name}
                    {s.category ? <span className="ml-1 text-xs text-slate-400">· {s.category}</span> : null}
                  </td>
                  <td className="py-2 pr-3">{s.defaultPrice ? formatBRL(s.defaultPrice) : <span className="text-amber-600">—</span>}</td>
                  <td className="py-2 pr-3 text-xs">
                    {s.scopeTemplate
                      ? <span className="text-emerald-700">cadastrado</span>
                      : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => setAberto(aberto === s.id ? null : s.id)}
                      className="rounded px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      {aberto === s.id ? 'Fechar' : 'Editar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleServiceAction(s.id, !s.active)}
                      className="rounded px-2 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
                    >
                      {s.active ? 'Desativar' : 'Reativar'}
                    </button>
                  </td>
                </tr>
                {aberto === s.id ? (
                  <tr>
                    <td colSpan={5} className="py-2">
                      <ServiceForm service={s} onDone={() => setAberto(null)} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type RetentionItem = { id: string; code: string; name: string; percent: string; active: boolean };

function RetentionRow({ retention }: { retention: RetentionItem }) {
  const action = updateRetentionAction.bind(null, retention.id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
      <span className="w-16 text-sm font-semibold text-slate-800">{retention.code}</span>
      <input
        name="percent"
        defaultValue={retention.percent.replace('.', ',')}
        inputMode="decimal"
        className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm"
        aria-label={`Percentual ${retention.code}`}
      />
      <span className="text-xs text-slate-400">%</span>
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <input type="checkbox" name="active" defaultChecked={retention.active} className="rounded border-slate-300" />
        Ativa
      </label>
      <button type="submit" disabled={pending} className="ml-auto rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60">
        {pending ? '…' : 'Salvar'}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}

export function RetentionsSection({ retentions }: { retentions: RetentionItem[] }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900">Retenções tributárias</h2>
      <p className="mt-1 text-xs text-amber-700">
        Percentuais zerados por padrão. Configure com orientação do seu contador — eles impactam o valor líquido das parcelas.
      </p>
      <div className="mt-3 space-y-1.5">
        {retentions.map((r) => <RetentionRow key={r.id} retention={r} />)}
      </div>
    </div>
  );
}
