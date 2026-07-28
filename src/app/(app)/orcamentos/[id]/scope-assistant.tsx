'use client';

import { useState, useTransition } from 'react';
import { BookmarkPlus, FileStack, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { generateScopeAction, saveScopeTemplateAction } from '@/actions/ai';
import { inputCls, Field, FormError } from '@/components/ui';
import { ReviewableTextarea } from '@/components/text-field';

export type ScopeResult = {
  scope: string;
  premises: string;
  exclusions: string;
  executionDeadline: string;
  items: Array<{ description: string; unit: string; quantity: string; unitPrice?: string }>;
};

export type TemplateOption = {
  serviceId: string;
  serviceName: string;
  label: string;
  scope: string;
  premises: string;
  exclusions: string;
  unit: string | null;
  defaultPrice: string | null;
};

/** Como o conteúdo gerado entra no orçamento. */
export type ApplyMode = 'append' | 'replace';

export type ApplyOptions = {
  mode: ApplyMode;
  /** Cabeçalho que separa este bloco dos demais (ex.: "PROJETO ELÉTRICO"). */
  heading: string | null;
  /** Só vale no modo "substituir": troca os itens do orçamento pelos sugeridos. */
  replaceItems: boolean;
};

/**
 * Assistente de escopo: gera o conteúdo técnico por IA ou aplica um modelo padrão.
 * O resultado é editável antes de ir para o orçamento e pode ser gravado como
 * novo modelo padrão do catálogo.
 *
 * Orçamentos com vários serviços acumulam blocos: cada aplicação acrescenta ao
 * que já existe, com um subtítulo separando os serviços.
 */
export function ScopeAssistant({
  aiEnabled, templates, defaultServiceType, hasContent, onApply,
}: {
  aiEnabled: boolean;
  templates: TemplateOption[];
  defaultServiceType: string;
  /** Já existe escopo preenchido? Define o modo padrão. */
  hasContent: boolean;
  onApply: (result: ScopeResult, options: ApplyOptions) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ScopeResult | null>(null);
  const [sourceTemplateId, setSourceTemplateId] = useState<string>('');
  const [replaceItems, setReplaceItems] = useState(true);

  const [serviceType, setServiceType] = useState(defaultServiceType);
  const [description, setDescription] = useState('');
  const [clientType, setClientType] = useState('');
  const [area, setArea] = useState('');

  function runAi() {
    setError(null);
    startTransition(async () => {
      const result = await generateScopeAction({
        serviceType, description, clientType: clientType || undefined, area: area || undefined,
      });
      if ('error' in result) setError(result.error);
      else {
        setDraft(result.scope);
        setSourceTemplateId('');
      }
    });
  }

  function applyTemplate(templateId: string) {
    const t = templates.find((x) => x.serviceId === templateId);
    if (!t) return;
    setError(null);
    setSourceTemplateId(t.serviceId);
    setServiceType(t.serviceName);
    setDraft({
      scope: t.scope,
      premises: t.premises,
      exclusions: t.exclusions,
      executionDeadline: '',
      // o serviço do catálogo já entra como linha da planilha de preços
      items: [{
        description: t.serviceName,
        unit: t.unit || 'vb',
        quantity: '1',
        unitPrice: t.defaultPrice ?? undefined,
      }],
    });
  }

  function close() {
    setOpen(false);
    setDraft(null);
    setError(null);
    setSourceTemplateId('');
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-brand/40 bg-brand-light px-3 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand hover:text-white"
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden /> Assistente de escopo
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-brand/30 bg-brand-light/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <Sparkles className="h-4 w-4 text-brand" aria-hidden /> Assistente de escopo
        </h3>
        <button
          type="button" onClick={close}
          className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700"
          aria-label="Fechar assistente"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Origem do conteúdo */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {templates.length > 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <label htmlFor="tpl" className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <FileStack className="h-3.5 w-3.5" aria-hidden /> Aplicar modelo padrão
            </label>
            <select
              id="tpl" value={sourceTemplateId}
              onChange={(e) => { if (e.target.value) applyTemplate(e.target.value); }}
              className={inputCls}
            >
              <option value="">Selecione um modelo…</option>
              {templates.map((t) => <option key={t.serviceId} value={t.serviceId}>{t.label}</option>)}
            </select>
            <p className="mt-1.5 text-[10px] text-slate-400">
              Os modelos ficam no catálogo de serviços e podem ser editados aqui antes de aplicar.
            </p>
          </div>
        ) : null}

        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Gerar com inteligência artificial
          </p>
          {!aiEnabled ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Não configurada. Um administrador pode ativá-la em
              <strong> Configurações → Inteligência artificial</strong>.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={serviceType} onChange={(e) => setServiceType(e.target.value)}
                  placeholder="Tipo de serviço" className={inputCls} aria-label="Tipo de serviço"
                />
                <input
                  value={area} onChange={(e) => setArea(e.target.value)}
                  placeholder="Área / porte (450 m²)" className={inputCls} aria-label="Área ou porte"
                />
              </div>
              <input
                value={clientType} onChange={(e) => setClientType(e.target.value)}
                placeholder="Tipo de edificação (térrea, condomínio…)" className={inputCls}
                aria-label="Tipo de edificação"
              />
              <textarea
                value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                placeholder="Briefing: descreva a demanda em uma ou duas frases."
                className={inputCls} aria-label="Briefing da demanda"
              />
              <button
                type="button" onClick={runAi}
                disabled={pending || description.trim().length < 10}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                {pending ? 'Gerando…' : 'Gerar escopo'}
              </button>
            </div>
          )}
        </div>
      </div>

      <FormError message={error} />

      {draft ? (
        <ScopeDraftEditor
          // remonta ao trocar a origem do conteúdo, para o subtítulo sugerido
          // acompanhar o serviço escolhido
          key={sourceTemplateId || 'ia'}
          draft={draft}
          onChange={setDraft}
          replaceItems={replaceItems}
          onReplaceItemsChange={setReplaceItems}
          templates={templates}
          sourceTemplateId={sourceTemplateId}
          suggestedName={serviceType}
          hasContent={hasContent}
          onApply={(options) => { onApply(draft, options); close(); }}
          onDiscard={() => { setDraft(null); setSourceTemplateId(''); }}
        />
      ) : null}
    </div>
  );
}

/** Edição do rascunho antes de aplicar, com opção de gravar como modelo padrão. */
function ScopeDraftEditor({
  draft, onChange, replaceItems, onReplaceItemsChange, templates,
  sourceTemplateId, suggestedName, hasContent, onApply, onDiscard,
}: {
  draft: ScopeResult;
  onChange: (next: ScopeResult) => void;
  replaceItems: boolean;
  onReplaceItemsChange: (v: boolean) => void;
  templates: TemplateOption[];
  sourceTemplateId: string;
  suggestedName: string;
  hasContent: boolean;
  onApply: (options: ApplyOptions) => void;
  onDiscard: () => void;
}) {
  const [showSave, setShowSave] = useState(false);
  const [saveTarget, setSaveTarget] = useState(sourceTemplateId);
  const [saveName, setSaveName] = useState(
    templates.find((t) => t.serviceId === sourceTemplateId)?.serviceName || suggestedName,
  );
  const [saving, startSave] = useTransition();
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Já havendo conteúdo, o padrão é somar — orçamentos com vários serviços
  // acumulam os escopos em vez de sobrescrever.
  const [mode, setMode] = useState<ApplyMode>(hasContent ? 'append' : 'replace');
  const [heading, setHeading] = useState(
    templates.find((t) => t.serviceId === sourceTemplateId)?.serviceName || suggestedName,
  );
  const [useHeading, setUseHeading] = useState(hasContent);

  const set = (k: keyof ScopeResult) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
    onChange({ ...draft, [k]: e.target.value });

  function setItem(idx: number, patch: Partial<ScopeResult['items'][number]>) {
    onChange({ ...draft, items: draft.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) });
  }

  function saveTemplate() {
    setSaveErr(null); setSaveMsg(null);
    startSave(async () => {
      const result = await saveScopeTemplateAction({
        serviceId: saveTarget || undefined,
        name: saveName,
        scope: draft.scope,
        premises: draft.premises,
        exclusions: draft.exclusions,
      });
      if ('error' in result) setSaveErr(result.error);
      else {
        setSaveMsg(`Modelo “${result.name}” salvo. Já disponível para os próximos orçamentos.`);
        setShowSave(false);
      }
    });
  }

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Revisão — edite antes de aplicar
        </p>
        <button
          type="button"
          onClick={() => setShowSave((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
        >
          <BookmarkPlus className="h-3.5 w-3.5" aria-hidden /> Salvar como modelo
        </button>
      </div>

      {showSave ? (
        <div className="space-y-2 rounded-lg border border-brand/30 bg-brand-light/50 p-3">
          <p className="text-xs font-medium text-slate-700">Gravar este conteúdo como modelo padrão</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Onde salvar" htmlFor="save-target">
              <select
                id="save-target" value={saveTarget}
                onChange={(e) => {
                  setSaveTarget(e.target.value);
                  const t = templates.find((x) => x.serviceId === e.target.value);
                  if (t) setSaveName(t.serviceName);
                }}
                className={inputCls}
              >
                <option value="">Criar novo modelo</option>
                {templates.map((t) => (
                  <option key={t.serviceId} value={t.serviceId}>Substituir “{t.label}”</option>
                ))}
              </select>
            </Field>
            <Field label="Nome do modelo" htmlFor="save-name" required>
              <input id="save-name" value={saveName} onChange={(e) => setSaveName(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <FormError message={saveErr} />
          <div className="flex gap-2">
            <button
              type="button" onClick={saveTemplate}
              disabled={saving || saveName.trim().length < 3}
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Salvar modelo'}
            </button>
            <button
              type="button" onClick={() => setShowSave(false)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-white"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {saveMsg ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">{saveMsg}</p>
      ) : null}

      <Field label="Escopo dos serviços" htmlFor="d-scope">
        <ReviewableTextarea
          id="d-scope" value={draft.scope} onChange={(v) => onChange({ ...draft, scope: v })}
          rows={8} className="font-mono text-xs" context="escopo de proposta de engenharia"
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Premissas" htmlFor="d-premises">
          <ReviewableTextarea
            id="d-premises" value={draft.premises} onChange={(v) => onChange({ ...draft, premises: v })}
            rows={5} className="font-mono text-xs" context="premissas de proposta de engenharia"
          />
        </Field>
        <Field label="Exclusões" htmlFor="d-exclusions">
          <ReviewableTextarea
            id="d-exclusions" value={draft.exclusions} onChange={(v) => onChange({ ...draft, exclusions: v })}
            rows={5} className="font-mono text-xs" context="exclusões de proposta de engenharia"
          />
        </Field>
      </div>
      <Field label="Prazo de execução" htmlFor="d-deadline">
        <input id="d-deadline" value={draft.executionDeadline} onChange={set('executionDeadline')} className={inputCls} />
      </Field>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-medium text-slate-600">Itens sugeridos ({draft.items.length})</p>
          <button
            type="button"
            onClick={() => onChange({ ...draft, items: [...draft.items, { description: '', unit: 'un', quantity: '1' }] })}
            className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
          >
            <Plus className="h-3 w-3" aria-hidden /> Adicionar
          </button>
        </div>
        {draft.items.length === 0 ? (
          <p className="text-xs text-slate-400">Nenhum item sugerido — os itens atuais do orçamento serão mantidos.</p>
        ) : (
          <>
            <ul className="space-y-1.5">
              {draft.items.map((item, idx) => (
                <li key={idx} className="flex gap-1.5">
                  <input
                    value={item.description}
                    onChange={(e) => setItem(idx, { description: e.target.value })}
                    className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs"
                    aria-label={`Descrição do item sugerido ${idx + 1}`}
                  />
                  <input
                    value={item.quantity}
                    onChange={(e) => setItem(idx, { quantity: e.target.value })}
                    className="w-14 rounded border border-slate-200 px-2 py-1 text-right text-xs"
                    aria-label="Quantidade"
                  />
                  <input
                    value={item.unit}
                    onChange={(e) => setItem(idx, { unit: e.target.value })}
                    className="w-14 rounded border border-slate-200 px-2 py-1 text-center text-xs"
                    aria-label="Unidade"
                  />
                  <button
                    type="button"
                    onClick={() => onChange({ ...draft, items: draft.items.filter((_, i) => i !== idx) })}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Remover item sugerido ${idx + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            {mode === 'replace' ? (
              <label className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox" checked={replaceItems}
                  onChange={(e) => onReplaceItemsChange(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Substituir os itens atuais do orçamento por estes
              </label>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                Os itens serão <strong>somados</strong> aos que já estão no orçamento.
              </p>
            )}
          </>
        )}
      </div>

      {/* Como o conteúdo entra no orçamento */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-medium text-slate-700">Ao aplicar</p>
        <div className="space-y-1.5">
          <label className="flex items-start gap-2 text-xs text-slate-700">
            <input
              type="radio" name="apply-mode" value="append" checked={mode === 'append'}
              onChange={() => setMode('append')} className="mt-0.5 border-slate-300"
            />
            <span>
              <strong>Acrescentar</strong> ao que já existe
              <span className="block text-[11px] text-slate-500">
                Para orçamentos com vários serviços — os escopos se somam.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-xs text-slate-700">
            <input
              type="radio" name="apply-mode" value="replace" checked={mode === 'replace'}
              onChange={() => setMode('replace')} className="mt-0.5 border-slate-300"
            />
            <span>
              <strong>Substituir</strong> o conteúdo atual
              <span className="block text-[11px] text-slate-500">
                Descarta escopo, premissas e exclusões já preenchidos.
              </span>
            </span>
          </label>
        </div>

        {/* Disponível nos dois modos: assim o primeiro serviço já entra rotulado
            e o orçamento fica coerente quando outros forem acrescentados. */}
        <div className="mt-2.5 border-t border-slate-200 pt-2.5">
          <label className="flex items-center gap-1.5 text-xs text-slate-700">
            <input
              type="checkbox" checked={useHeading}
              onChange={(e) => setUseHeading(e.target.checked)}
              className="rounded border-slate-300"
            />
            Identificar o serviço com subtítulo no escopo
          </label>
          {useHeading ? (
            <input
              value={heading} onChange={(e) => setHeading(e.target.value)}
              placeholder="Ex.: PROJETO ELÉTRICO"
              className="mt-1.5 w-full rounded border border-slate-300 px-2 py-1 text-xs uppercase"
              aria-label="Subtítulo do bloco"
            />
          ) : null}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => onApply({
            mode,
            heading: useHeading && heading.trim() ? heading.trim().toUpperCase() : null,
            replaceItems,
          })}
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
        >
          {mode === 'append' ? 'Acrescentar ao orçamento' : 'Substituir no orçamento'}
        </button>
        <button
          type="button" onClick={onDiscard}
          className="rounded-lg border border-slate-300 px-4 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          Descartar
        </button>
      </div>
      <p className="text-[10px] text-slate-400">
        Revise tecnicamente o conteúdo antes de enviar a proposta ao cliente.
      </p>
    </div>
  );
}
