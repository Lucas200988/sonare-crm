'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Plus, Save, Trash2 } from 'lucide-react';
import { saveVersionAction } from '@/actions/budgets';
import { computeBudgetTotals } from '@/lib/budget-calc';
import { formatBRL } from '@/lib/money';
import { parseDecimalBR, formatDecimalBR } from '@/lib/parse';
import { additionBlock, type MergeMode } from '@/lib/merge-text';
import { appendTextToHtml, htmlToText, isEmptyRich, textToHtml } from '@/lib/html-text';
import { aplicarServico, faixaPraticada } from '@/lib/aplicar-servico';
import { inputCls, Field } from '@/components/ui';
import { ReviewableTextarea } from '@/components/text-field';
import { RichEditor } from '@/components/rich-editor';
import {
  ScopeAssistant, type ScopeResult, type TemplateOption,
  type ApplyMode, type ApplyOptions,
} from './scope-assistant';

/**
 * Junta o texto do assistente a um campo que guarda HTML formatado.
 * Em "acrescentar", a formatação já existente é preservada; em "substituir",
 * o bloco novo passa a ser todo o conteúdo.
 */
function mergeRich(
  currentHtml: string,
  addition: string,
  mode: MergeMode,
  heading: string | null,
  dedupe = false,
): string {
  const textoAtual = mode === 'replace' ? '' : htmlToText(currentHtml);
  const bloco = additionBlock(textoAtual, addition, heading, dedupe);
  if (bloco === null) return currentHtml;
  return mode === 'replace' ? textToHtml(bloco) : appendTextToHtml(currentHtml, bloco);
}

type ServiceOption = {
  id: string;
  name: string;
  unit: string | null;
  defaultPrice: string | null;
  estimatedCost: string | null;
  scopeTemplate: string | null;
  premisesTemplate: string | null;
  exclusionsTemplate: string | null;
};

export type PriceSuggestion = {
  serviceCatalogId: string;
  sugerido: string;
  ultimo: string;
  menor: string;
  maior: string;
  amostras: number;
};

export type EditorItem = {
  serviceCatalogId: string | null;
  description: string;
  unit: string;
  quantity: string; // pt-BR
  unitPrice: string;
  unitCost: string;
  discount: string;
};

export type EditorFields = {
  validUntil: string;
  serviceType: string;
  scope: string;
  premises: string;
  exclusions: string;
  executionDeadline: string;
  deliveryMethod: string;
  paymentTerms: string;
  discount: string;
  surcharge: string;
  taxes: string;
  estimatedRetentions: string;
  internalNotes: string;
  clientNotes: string;
  /** Contato do cliente que pediu este orçamento. */
  contactId: string | null;
  /** `null` = usa o texto padrão da empresa; string = sobrepõe (mesmo vazia, para omitir o bloco). */
  generalInfoOverride: string | null;
  differentialsOverride: string | null;
};

const EMPTY_ITEM: EditorItem = {
  serviceCatalogId: null, description: '', unit: 'un',
  quantity: '1', unitPrice: '0', unitCost: '0', discount: '0',
};

export function BudgetEditor({
  budgetId, editable, initialFields, initialItems, services, aiEnabled, scopeTemplates,
  priceSuggestions = [], companyDefaults, contatos,
}: {
  budgetId: string;
  editable: boolean;
  initialFields: EditorFields;
  initialItems: EditorItem[];
  services: ServiceOption[];
  aiEnabled: boolean;
  scopeTemplates: TemplateOption[];
  /** Preços praticados por serviço, vindos dos orçamentos anteriores. */
  priceSuggestions?: PriceSuggestion[];
  /** Textos padrão cadastrados em Configurações — usados quando não há sobreposição. */
  companyDefaults: { generalInfo: string; differentials: string };
  /** Contatos do cliente, para escolher quem pediu o orçamento. */
  contatos: Array<{ id: string; name: string; position: string | null }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fields, setFields] = useState(initialFields);
  const [items, setItems] = useState<EditorItem[]>(initialItems.length > 0 ? initialItems : [{ ...EMPTY_ITEM }]);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const totals = useMemo(() => computeBudgetTotals({
    items: items.map((i) => ({
      quantity: parseDecimalBR(i.quantity),
      unitPrice: parseDecimalBR(i.unitPrice),
      unitCost: parseDecimalBR(i.unitCost),
      discount: parseDecimalBR(i.discount),
    })),
    discount: parseDecimalBR(fields.discount),
    surcharge: parseDecimalBR(fields.surcharge),
    taxes: parseDecimalBR(fields.taxes),
    estimatedRetentions: parseDecimalBR(fields.estimatedRetentions),
  }), [items, fields.discount, fields.surcharge, fields.taxes, fields.estimatedRetentions]);

  function setItem(idx: number, patch: Partial<EditorItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  /**
   * Escolher o serviço preenche o item e, quando faz sentido, o escopo.
   *
   * O preço vem do histórico praticado (mediana dos orçamentos que viraram
   * proposta) e cai para o preço de tabela quando não há histórico — a tabela
   * envelhece, o histórico não.
   */
  function applyService(idx: number, serviceId: string) {
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) {
      setItem(idx, { serviceCatalogId: null });
      return;
    }

    const historico = priceSuggestions.find((p) => p.serviceCatalogId === svc.id);
    const atual = items[idx];
    const { item, textos, aviso, semCadastro } = aplicarServico(svc, historico, fields, atual);

    setItem(idx, item);
    if (textos) setFields((f) => ({ ...f, ...textos }));
    if (aviso) setMessage({ kind: semCadastro ? 'err' : 'ok', text: aviso });
  }

  /**
   * Linha da tabela sem nenhum dado — sobra de "Adicionar item" que ninguém
   * preencheu. Só essas podem ser descartadas em silêncio; uma linha com
   * preço ou serviço mas sem descrição é um item real que ficaria incompleto.
   */
  function linhaEmBranco(i: EditorItem): boolean {
    return (
      !i.serviceCatalogId
      && i.description.trim() === ''
      && (i.unitPrice === '0' || i.unitPrice.trim() === '')
      && (i.unitCost === '0' || i.unitCost.trim() === '')
    );
  }

  function save() {
    setMessage(null);

    const semDescricao = items
      .map((item, idx) => ({ item, numero: idx + 1 }))
      .filter(({ item }) => !linhaEmBranco(item) && item.description.trim() === '');

    if (semDescricao.length > 0) {
      const linhas = semDescricao.map((i) => i.numero).join(', ');
      const rotulo = semDescricao.length > 1 ? `os itens ${linhas}` : `o item ${linhas}`;
      setMessage({
        kind: 'err',
        text: `Falta a descrição de ${rotulo} — sem ela, o item não é salvo.`,
      });
      return;
    }

    startTransition(async () => {
      const result = await saveVersionAction(budgetId, {
        ...fields,
        items: items
          .filter((i) => !linhaEmBranco(i))
          .map((i) => ({
            serviceCatalogId: i.serviceCatalogId,
            description: i.description,
            unit: i.unit || null,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            unitCost: i.unitCost,
            discount: i.discount,
          })),
      });
      if (result.error) setMessage({ kind: 'err', text: result.error });
      else {
        setMessage({ kind: 'ok', text: result.info ?? 'Salvo.' });
        router.refresh();
      }
    });
  }

  const set = (k: keyof EditorFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  /** Aplica o resultado do assistente (IA ou modelo padrão) aos campos do orçamento. */
  function applyScope(result: ScopeResult, options: ApplyOptions) {
    const { mode, heading } = options;

    setFields((f) => ({
      ...f,
      // escopo mantém um bloco por serviço; premissas e exclusões são
      // condições gerais e entram numa lista única, sem repetição
      scope: mergeRich(f.scope, result.scope, mode, heading),
      premises: mergeRich(f.premises, result.premises, mode, null, true),
      exclusions: mergeRich(f.exclusions, result.exclusions, mode, null, true),
      // prazo é um campo curto: só substitui quando estiver vazio ou em modo substituir
      executionDeadline:
        mode === 'replace' || !f.executionDeadline
          ? result.executionDeadline || f.executionDeadline
          : f.executionDeadline,
    }));

    const novosItens = result.items.map((i) => ({
      serviceCatalogId: null,
      description: i.description,
      unit: i.unit || 'un',
      quantity: i.quantity || '1',
      // modelos do catálogo já trazem o preço base do serviço
      unitPrice: i.unitPrice ? formatDecimalBR(i.unitPrice) : '0',
      unitCost: '0',
      discount: '0',
    }));

    if (novosItens.length === 0) {
      setMessage({
        kind: 'ok',
        text: mode === 'append' ? 'Escopo acrescentado. Revise e salve.' : 'Escopo aplicado. Revise e salve.',
      });
      return;
    }

    if (mode === 'append') {
      // descarta a linha em branco inicial de um orçamento recém-criado
      setItems((prev) => {
        const preenchidos = prev.filter((i) => i.description.trim() !== '');
        return [...preenchidos, ...novosItens];
      });
      setMessage({
        kind: 'ok',
        text: `Escopo acrescentado e ${novosItens.length} item(ns) somado(s). Preencha os preços e salve.`,
      });
      return;
    }

    if (options.replaceItems) {
      setItems(novosItens);
      setMessage({ kind: 'ok', text: 'Escopo e itens aplicados. Preencha os preços e salve.' });
    } else {
      setMessage({ kind: 'ok', text: 'Escopo aplicado. Revise o conteúdo e salve.' });
    }
  }

  const cellCls = 'w-full rounded border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand disabled:bg-slate-50 disabled:text-slate-500';

  return (
    <div className="space-y-6">
      {editable ? (
        <ScopeAssistant
          aiEnabled={aiEnabled}
          templates={scopeTemplates}
          defaultServiceType={fields.serviceType}
          hasContent={!isEmptyRich(fields.scope)}
          onApply={applyScope}
        />
      ) : null}

      {/* Escopo em destaque: é o conteúdo principal da proposta */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Escopo dos serviços
          </h3>
          {isEmptyRich(fields.scope) ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              <AlertTriangle className="h-3 w-3" aria-hidden /> Obrigatório na proposta
            </span>
          ) : null}
        </div>
        <RichEditor
          value={fields.scope}
          onChange={(v) => setFields((f) => ({ ...f, scope: v }))}
          disabled={!editable}
          minHeight={220}
          context="escopo de proposta de engenharia"
        />
        {isEmptyRich(fields.scope) ? (
          <p className="mt-1 text-xs text-amber-700">
            Sem escopo, a proposta sai sem a descrição dos serviços — o item mais importante para o cliente.
          </p>
        ) : null}
      </div>

      {/* Itens */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Itens do orçamento</h3>
          {editable ? (
            <button
              type="button"
              onClick={() => setItems((p) => [...p, { ...EMPTY_ITEM }])}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar item
            </button>
          ) : null}
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-2 font-medium" style={{ width: '16%' }}>Serviço (catálogo)</th>
                <th className="px-2 py-2 font-medium">Descrição</th>
                <th className="px-2 py-2 font-medium" style={{ width: '6%' }}>Un.</th>
                <th className="px-2 py-2 font-medium" style={{ width: '8%' }}>Qtd.</th>
                <th className="px-2 py-2 font-medium" style={{ width: '11%' }}>Preço unit.</th>
                <th className="px-2 py-2 font-medium" style={{ width: '11%' }}>Custo unit.</th>
                <th className="px-2 py-2 font-medium" style={{ width: '10%' }}>Desc. (R$)</th>
                <th className="px-2 py-2 text-right font-medium" style={{ width: '12%' }}>Total</th>
                {editable ? <th style={{ width: '4%' }} /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td className="px-2 py-1.5">
                    <select
                      value={item.serviceCatalogId ?? ''}
                      onChange={(e) => applyService(idx, e.target.value)}
                      disabled={!editable}
                      className={cellCls}
                      aria-label={`Serviço do item ${idx + 1}`}
                    >
                      <option value="">Livre</option>
                      {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={item.description}
                      onChange={(e) => setItem(idx, { description: e.target.value })}
                      disabled={!editable}
                      placeholder="Descrição do serviço/item"
                      className={
                        !editable || item.description.trim() !== '' || linhaEmBranco(item)
                          ? cellCls
                          : `${cellCls} border-red-400 bg-red-50`
                      }
                      aria-label={`Descrição do item ${idx + 1}`}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={item.unit} onChange={(e) => setItem(idx, { unit: e.target.value })} disabled={!editable} className={cellCls} aria-label="Unidade" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={item.quantity} onChange={(e) => setItem(idx, { quantity: e.target.value })} disabled={!editable} inputMode="decimal" className={`${cellCls} text-right`} aria-label="Quantidade" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={item.unitPrice} onChange={(e) => setItem(idx, { unitPrice: e.target.value })} disabled={!editable} inputMode="decimal" className={`${cellCls} text-right`} aria-label="Preço unitário" />
                    {(() => {
                      // Faixa já praticada neste serviço, para dar referência
                      // na hora de decidir o preço.
                      const h = item.serviceCatalogId
                        ? priceSuggestions.find((p) => p.serviceCatalogId === item.serviceCatalogId)
                        : null;
                      if (!h) return null;
                      const faixa = faixaPraticada(h);
                      return (
                        <p
                          className="mt-0.5 text-right text-[10px] text-slate-400"
                          title={`Praticado em ${h.amostras} orçamento(s). Último: ${formatBRL(h.ultimo)}`}
                        >
                          {faixa}
                        </p>
                      );
                    })()}
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={item.unitCost} onChange={(e) => setItem(idx, { unitCost: e.target.value })} disabled={!editable} inputMode="decimal" className={`${cellCls} text-right`} aria-label="Custo unitário" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={item.discount} onChange={(e) => setItem(idx, { discount: e.target.value })} disabled={!editable} inputMode="decimal" className={`${cellCls} text-right`} aria-label="Desconto do item" />
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium text-slate-900">
                    R$ {formatDecimalBR(totals.itemTotals[idx]?.toString() ?? '0')}
                  </td>
                  {editable ? (
                    <td className="px-1 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Remover item ${idx + 1}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ajustes globais + totais */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desconto global (R$)" htmlFor="g-discount">
            <input id="g-discount" value={fields.discount} onChange={set('discount')} disabled={!editable} inputMode="decimal" className={inputCls} />
          </Field>
          <Field label="Acréscimo (R$)" htmlFor="g-surcharge">
            <input id="g-surcharge" value={fields.surcharge} onChange={set('surcharge')} disabled={!editable} inputMode="decimal" className={inputCls} />
          </Field>
          <Field label="Impostos estimados (R$)" htmlFor="g-taxes">
            <input id="g-taxes" value={fields.taxes} onChange={set('taxes')} disabled={!editable} inputMode="decimal" className={inputCls} />
          </Field>
          <Field label="Retenções estimadas (R$)" htmlFor="g-ret">
            <input id="g-ret" value={fields.estimatedRetentions} onChange={set('estimatedRetentions')} disabled={!editable} inputMode="decimal" className={inputCls} />
          </Field>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <dl className="space-y-1.5">
            <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>R$ {formatDecimalBR(totals.subtotal.toString())}</dd></div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Desconto ({formatDecimalBR(totals.discountPercent.toString())}%)</dt>
              <dd className="text-red-600">− R$ {formatDecimalBR(totals.discount.toString())}</dd>
            </div>
            <div className="flex justify-between"><dt className="text-slate-500">Acréscimo</dt><dd>R$ {formatDecimalBR(totals.surcharge.toString())}</dd></div>
            <div className="flex justify-between border-t border-slate-300 pt-2 text-base font-bold">
              <dt>Total</dt><dd>R$ {formatDecimalBR(totals.total.toString())}</dd>
            </div>
            <div className="flex justify-between text-xs"><dt className="text-slate-500">Impostos + retenções estimados</dt><dd>− R$ {formatDecimalBR(totals.taxes.plus(totals.estimatedRetentions).toString())}</dd></div>
            <div className="flex justify-between text-xs"><dt className="text-slate-500">Líquido estimado</dt><dd>R$ {formatDecimalBR(totals.netEstimated.toString())}</dd></div>
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-xs">
              <dt className="text-slate-500">Custo interno</dt><dd>R$ {formatDecimalBR(totals.totalCost.toString())}</dd>
            </div>
            <div className="flex justify-between text-xs">
              <dt className="text-slate-500">Margem bruta</dt>
              <dd className={totals.totalCost.greaterThan(0) && totals.marginPercent.lessThan(20) ? 'font-semibold text-red-600' : 'text-green-700'}>
                R$ {formatDecimalBR(totals.grossMargin.toString())} ({formatDecimalBR(totals.marginPercent.toString())}%)
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[10px] text-slate-400">Custos e margem são internos — não aparecem na proposta.</p>
        </div>
      </div>

      {/* Condições e textos */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Solicitante (A/C)"
          htmlFor="f-solicitante"
          hint={
            contatos.length === 0
              ? 'Nenhum contato cadastrado neste cliente — cadastre na ficha do cliente.'
              : 'Sai na proposta como responsável pelo contato.'
          }
        >
          <select
            id="f-solicitante"
            value={fields.contactId ?? ''}
            onChange={(e) => setFields((f) => ({ ...f, contactId: e.target.value || null }))}
            disabled={!editable || contatos.length === 0}
            className={inputCls}
          >
            <option value="">Não informado</option>
            {contatos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.position ? `${c.name} — ${c.position}` : c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Validade (dd/mm/aaaa)" htmlFor="f-validade">
          <input id="f-validade" value={fields.validUntil} onChange={set('validUntil')} disabled={!editable} placeholder="dd/mm/aaaa" className={inputCls} />
        </Field>
        <Field label="Tipo de serviço" htmlFor="f-tipo">
          <input id="f-tipo" value={fields.serviceType} onChange={set('serviceType')} disabled={!editable} className={inputCls} />
        </Field>
        <Field label="Prazo de execução" htmlFor="f-prazo">
          <input id="f-prazo" value={fields.executionDeadline} onChange={set('executionDeadline')} disabled={!editable} placeholder="Ex.: 45 dias corridos" className={inputCls} />
        </Field>
        <Field label="Forma de entrega" htmlFor="f-entrega">
          <input id="f-entrega" value={fields.deliveryMethod} onChange={set('deliveryMethod')} disabled={!editable} placeholder="Ex.: digital (PDF + DWG)" className={inputCls} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Field label="Condições de pagamento" htmlFor="f-pgto">
          <ReviewableTextarea
            id="f-pgto" value={fields.paymentTerms} onChange={(v) => setFields((f) => ({ ...f, paymentTerms: v }))}
            disabled={!editable} rows={4}
            placeholder="Ex.: 30% na assinatura, 40% na entrega preliminar, 30% na entrega final"
            context="condições de pagamento de proposta comercial"
          />
        </Field>
        <Field label="Premissas" htmlFor="f-premissas">
          <RichEditor
            value={fields.premises} onChange={(v) => setFields((f) => ({ ...f, premises: v }))}
            disabled={!editable} minHeight={120} context="premissas de proposta de engenharia"
          />
        </Field>
        <Field label="Exclusões (o que NÃO está incluso)" htmlFor="f-exclusoes">
          <RichEditor
            value={fields.exclusions} onChange={(v) => setFields((f) => ({ ...f, exclusions: v }))}
            disabled={!editable} minHeight={120} context="exclusões de proposta de engenharia"
          />
        </Field>
        <Field label="Observações para o cliente (saem na proposta)" htmlFor="f-notas-cliente">
          <ReviewableTextarea
            id="f-notas-cliente" value={fields.clientNotes} onChange={(v) => setFields((f) => ({ ...f, clientNotes: v }))}
            disabled={!editable} rows={2} context="observações de proposta comercial"
          />
        </Field>
        <Field label="Notas internas (não saem na proposta)" htmlFor="f-notas-internas">
          <textarea
            id="f-notas-internas" value={fields.internalNotes} onChange={set('internalNotes')}
            disabled={!editable} rows={2} spellCheck lang="pt-BR" className={inputCls}
          />
        </Field>
        <OverridableCompanyText
          label="Informações gerais"
          hint="Texto padrão da empresa. Desligue quando ele não fizer sentido para este serviço."
          value={fields.generalInfoOverride}
          companyDefault={companyDefaults.generalInfo}
          editable={editable}
          onChange={(v) => setFields((f) => ({ ...f, generalInfoOverride: v }))}
        />
        <OverridableCompanyText
          label="Diferenciais"
          hint="Texto padrão da empresa. Desligue quando ele não fizer sentido para este serviço."
          value={fields.differentialsOverride}
          companyDefault={companyDefaults.differentials}
          editable={editable}
          onChange={(v) => setFields((f) => ({ ...f, differentialsOverride: v }))}
        />
      </div>

      {message ? (
        <p
          role="alert"
          className={`rounded-lg border px-3 py-2 text-sm ${
            message.kind === 'ok'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {editable ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            <Save className="h-4 w-4" aria-hidden />
            {pending ? 'Salvando…' : 'Salvar orçamento'}
          </button>
        </div>
      ) : (
        <p className="text-xs text-slate-400">
          Esta versão está bloqueada para edição (enviada/aprovada). Crie uma nova versão para alterar valores.
        </p>
      )}
    </div>
  );
}

/**
 * Texto padrão da empresa (Informações gerais / Diferenciais) com opção de
 * sobrepor por orçamento.
 *
 * Nem todo serviço se encaixa no texto genérico da empresa — um contrato de
 * limpeza de módulos não tem os mesmos diferenciais de um projeto elétrico.
 * "Usar o texto padrão" fica ligado por padrão; desligar revela um campo
 * editável, semeado com o texto atual da empresa como ponto de partida.
 */
function OverridableCompanyText({
  label, hint, value, companyDefault, editable, onChange,
}: {
  label: string;
  hint: string;
  /** `null` = usa o padrão da empresa; string = texto próprio deste orçamento. */
  value: string | null;
  companyDefault: string;
  editable: boolean;
  onChange: (value: string | null) => void;
}) {
  const usaPadrao = value === null;
  const id = `f-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <Field label={label} htmlFor={id} className="lg:col-span-2">
      <label className="mb-1.5 flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={usaPadrao}
          disabled={!editable}
          onChange={(e) => onChange(e.target.checked ? null : companyDefault)}
          className="rounded border-slate-300"
        />
        Usar o texto padrão da empresa
      </label>

      {usaPadrao ? (
        <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {companyDefault.trim() || 'Nenhum texto padrão cadastrado em Configurações.'}
        </p>
      ) : (
        <textarea
          id={id}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={!editable}
          rows={4}
          spellCheck
          className={inputCls}
        />
      )}
      <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
    </Field>
  );
}
