'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  BookmarkPlus, ChevronDown, ChevronUp, Copy, FileStack, FileText,
  Plus, Sparkles, Trash2, Upload, X,
} from 'lucide-react';
import {
  extrairDocumentoAction, generateScopeAction, saveScopeTemplateAction,
} from '@/actions/ai';
import { inputCls, Field, FormError } from '@/components/ui';
import { ReviewableTextarea } from '@/components/text-field';

export type AnaliseComercial = {
  status: 'pronto' | 'pronto_com_premissas' | 'requer_informacoes';
  titulo: string;
  resumoExecutivo: string;
  perguntas: string[];
  pontosAConfirmar: string[];
  informacoesInferidas: string[];
  riscos: Array<{ item: string; impacto: 'baixo' | 'medio' | 'alto'; justificativa: string }>;
  servicosOpcionais: Array<{ servico: string; motivo: string }>;
  beneficios: string[];
  resumoWhatsapp: string;
  observacoesInternas: string[];
};

export type ScopeResult = {
  scope: string;
  premises: string;
  exclusions: string;
  executionDeadline: string;
  items: Array<{ description: string; unit: string; quantity: string; unitPrice?: string }>;
  /** Só existe quando veio da IA — modelo do catálogo não analisa nada. */
  analise?: AnaliseComercial;
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

/** Quanto detalhe a IA deve produzir no escopo. */
type NivelDetalhe = 'resumido' | 'padrao' | 'detalhado';

const NIVEIS: Array<{ value: NivelDetalhe; label: string; hint: string }> = [
  {
    value: 'resumido',
    label: 'Resumido',
    hint: '2 a 4 etapas — serviço simples, orçamento rápido.',
  },
  {
    value: 'padrao',
    label: 'Padrão',
    hint: '4 a 7 etapas, com 3 a 6 atividades cada — proposta de engenharia.',
  },
  {
    value: 'detalhado',
    label: 'Detalhado',
    hint: '6 a 10 etapas, nível de memorial — concorrência e órgão público.',
  },
];

/**
 * Campos do briefing que a IA usa para não supor.
 *
 * São os que mudam preço, prazo ou responsabilidade — os outros dados da
 * seção "dados da solicitação" o sistema já conhece (cliente, empreendimento)
 * ou cabem no termo de referência colado.
 */
const CAMPOS: Array<{ chave: string; rotulo: string; placeholder: string }> = [
  { chave: 'objetivo', rotulo: 'Objetivo informado', placeholder: 'Objetivo: o que o cliente quer resolver' },
  { chave: 'informacoesTecnicas', rotulo: 'Informações técnicas conhecidas', placeholder: 'Informações técnicas (potência, tensão, cargas…)' },
  { chave: 'quantidades', rotulo: 'Quantidades', placeholder: 'Quantidade de unidades, sistemas ou áreas' },
  { chave: 'visitas', rotulo: 'Visitas previstas', placeholder: 'Visitas previstas (ex.: 1 visita técnica)' },
  { chave: 'prazoSolicitado', rotulo: 'Prazo solicitado', placeholder: 'Prazo solicitado pelo cliente' },
  { chave: 'aprovacoes', rotulo: 'Aprovações envolvidas', placeholder: 'Aprovações ou protocolos (concessionária, bombeiros…)' },
  { chave: 'entregaveisCombinados', rotulo: 'Entregáveis combinados', placeholder: 'Entregáveis já combinados' },
  { chave: 'exclusoesConhecidas', rotulo: 'Itens excluídos', placeholder: 'O que já se sabe que está fora' },
  { chave: 'observacoesComerciais', rotulo: 'Observações comerciais', placeholder: 'Observações comerciais' },
];

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
  aiEnabled, templates, defaultServiceType, clienteNome, hasContent, onApply,
}: {
  aiEnabled: boolean;
  templates: TemplateOption[];
  defaultServiceType: string;
  clienteNome: string;
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
  const [detalhes, setDetalhes] = useState(false);
  const [documentos, setDocumentos] = useState('');
  const [nomeDocumento, setNomeDocumento] = useState('');
  const [extras, setExtras] = useState<Record<string, string>>({});

  const preenchidos = (documentos.trim() ? 1 : 0)
    + Object.values(extras).filter((v) => v.trim() !== '').length;
  // Padrão: o escopo curto demais era a queixa; o mínimo de engenharia vira o normal.
  const [nivel, setNivel] = useState<NivelDetalhe>('padrao');

  /*
   * Contador de segundos enquanto gera. Sem ele "Gerando…" parado é
   * indistinguível de travado, e o usuário recarrega a página no meio.
   */
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [pending]);

  /**
   * Espera máxima do lado do navegador.
   *
   * A função do servidor tem teto próprio, mas se ela for encerrada no meio
   * a ação nunca retorna e o botão fica em "Gerando…" para sempre. Esta
   * corrida garante que a tela sempre volta, com mensagem.
   */
  function comLimite<T>(promessa: Promise<T>, limiteSegundos: number): Promise<T> {
    return Promise.race([
      promessa,
      new Promise<T>((_, rejeitar) =>
        setTimeout(() => rejeitar(new Error('sem-resposta')), limiteSegundos * 1000)),
    ]);
  }

  function runAi() {
    setError(null);
    setSegundos(0);
    startTransition(async () => {
      try {
        await gerar();
      } catch {
        setError(
          'O servidor não respondeu a tempo. Tente o nível "Resumido", ou confira o modelo '
          + 'em Configurações → Inteligência artificial (o botão "Testar conexão" mostra se ele existe).',
        );
      }
    });
  }

  async function gerar() {
    const result = await comLimite(
      generateScopeAction({
        serviceType, description, clientType: clientType || undefined, area: area || undefined,
        cliente: clienteNome || undefined,
        documentos: documentos.trim() || undefined,
        ...Object.fromEntries(
          Object.entries(extras).filter(([, v]) => v.trim() !== ''),
        ),
        nivel,
      }),
      70,
    );

    if ('error' in result) setError(result.error);
    else {
      setDraft(result.scope);
      setSourceTemplateId('');
    }
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
                placeholder="Descrição recebida do cliente: o que ele pediu, com as palavras dele."
                className={inputCls} aria-label="Descrição recebida do cliente"
              />

              {/*
                Termo de referência, edital, memorial. É o campo que mais muda a
                qualidade do escopo: com o documento em mãos a IA para de supor.
              */}
              <div>
                <button
                  type="button"
                  onClick={() => setDetalhes((v) => !v)}
                  className="flex w-full items-center justify-between rounded-lg border border-dashed border-slate-300 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 hover:border-slate-400"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" aria-hidden />
                    Termo de referência e detalhes da solicitação
                    {preenchidos > 0 ? (
                      <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                        {preenchidos}
                      </span>
                    ) : null}
                  </span>
                  {detalhes ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
                </button>

                {detalhes ? (
                  <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <DocumentoAnexo
                      atual={documentos ? { nome: nomeDocumento, caracteres: documentos.length } : null}
                      onLido={(texto, nome) => { setDocumentos(texto); setNomeDocumento(nome); }}
                      onRemover={() => { setDocumentos(''); setNomeDocumento(''); }}
                    />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {CAMPOS.map((c) => (
                        <input
                          key={c.chave}
                          value={extras[c.chave] ?? ''}
                          onChange={(e) => setExtras((p) => ({ ...p, [c.chave]: e.target.value }))}
                          placeholder={c.placeholder}
                          aria-label={c.rotulo}
                          className={inputCls}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <fieldset>
                <legend className="mb-1 text-[11px] font-medium text-slate-600">
                  Nível de detalhe
                </legend>
                <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                  {NIVEIS.map((n) => (
                    <button
                      key={n.value}
                      type="button"
                      onClick={() => setNivel(n.value)}
                      aria-pressed={nivel === n.value}
                      title={n.hint}
                      className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition ${
                        nivel === n.value
                          ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {n.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  {NIVEIS.find((n) => n.value === nivel)?.hint}
                </p>
              </fieldset>

              <button
                type="button" onClick={runAi}
                disabled={pending || description.trim().length < 10}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                {pending ? `Gerando… ${segundos}s` : 'Gerar escopo'}
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

      {draft.analise ? <PainelAnalise analise={draft.analise} /> : null}

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

const STATUS_ANALISE: Record<AnaliseComercial['status'], { rotulo: string; classe: string }> = {
  pronto: { rotulo: 'Pronto', classe: 'bg-green-100 text-green-800' },
  pronto_com_premissas: { rotulo: 'Pronto, com premissas', classe: 'bg-amber-100 text-amber-800' },
  requer_informacoes: { rotulo: 'Faltam informações', classe: 'bg-red-100 text-red-800' },
};

const IMPACTO_CLASSE: Record<string, string> = {
  baixo: 'bg-slate-100 text-slate-600',
  medio: 'bg-amber-100 text-amber-800',
  alto: 'bg-red-100 text-red-800',
};

function ListaAnalise({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (itens.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-700">{titulo}</p>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[11px] text-slate-600">
        {itens.map((i, idx) => <li key={idx}>{i}</li>)}
      </ul>
    </div>
  );
}

/**
 * O que a IA percebeu e não entra na proposta.
 *
 * Perguntas, riscos e oportunidades são para quem vai precificar — mandar
 * isso ao cliente seria mostrar as próprias dúvidas. Fica visível na tela,
 * separado do texto que será aplicado ao orçamento.
 */
export function PainelAnalise({ analise }: { analise: AnaliseComercial }) {
  const [copiado, setCopiado] = useState(false);
  const s = STATUS_ANALISE[analise.status] ?? STATUS_ANALISE.pronto_com_premissas;

  const temAlgo = analise.perguntas.length > 0 || analise.pontosAConfirmar.length > 0
    || analise.riscos.length > 0 || analise.servicosOpcionais.length > 0
    || analise.informacoesInferidas.length > 0 || analise.observacoesInternas.length > 0
    || analise.resumoWhatsapp !== '';
  if (!temAlgo && !analise.resumoExecutivo) return null;

  return (
    <div className="rounded-lg border border-slate-300 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-800">Análise interna</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${s.classe}`}>{s.rotulo}</span>
        <span className="text-[10px] text-slate-400">não vai para o cliente</span>
      </div>

      {analise.resumoExecutivo ? (
        <p className="mb-2 text-[11px] text-slate-600">{analise.resumoExecutivo}</p>
      ) : null}

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {analise.perguntas.length > 0 ? (
          <div className="rounded bg-amber-50 p-2 sm:col-span-2">
            <p className="text-[11px] font-semibold text-amber-900">
              Perguntar ao cliente antes de fechar o preço
            </p>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[11px] text-amber-900">
              {analise.perguntas.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
        ) : null}

        <ListaAnalise titulo="A confirmar" itens={analise.pontosAConfirmar} />
        <ListaAnalise titulo="Inferido tecnicamente" itens={analise.informacoesInferidas} />

        {analise.riscos.length > 0 ? (
          <div className="sm:col-span-2">
            <p className="text-[11px] font-semibold text-slate-700">Riscos para o orçamento</p>
            <ul className="mt-0.5 space-y-1">
              {analise.riscos.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-600">
                  <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase ${IMPACTO_CLASSE[r.impacto] ?? IMPACTO_CLASSE.medio}`}>
                    {r.impacto}
                  </span>
                  <span><strong>{r.item}</strong>{r.justificativa ? ` — ${r.justificativa}` : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {analise.servicosOpcionais.length > 0 ? (
          <div className="sm:col-span-2 rounded bg-sky-50 p-2">
            <p className="text-[11px] font-semibold text-sky-900">
              Serviços que cabem nesta venda (não incluídos)
            </p>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[11px] text-sky-900">
              {analise.servicosOpcionais.map((o, i) => (
                <li key={i}><strong>{o.servico}</strong>{o.motivo ? ` — ${o.motivo}` : ''}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <ListaAnalise titulo="Observações internas" itens={analise.observacoesInternas} />
      </div>

      {analise.resumoWhatsapp ? (
        <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-slate-700">Resumo para WhatsApp</p>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(analise.resumoWhatsapp);
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              }}
              className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-white"
            >
              <Copy className="h-3 w-3" aria-hidden /> {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-[11px] text-slate-600">{analise.resumoWhatsapp}</p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Termo de referência anexado.
 *
 * O arquivo não é guardado: o servidor extrai o texto, devolve, e é o texto
 * que entra no briefing da IA. A leitura é um passo separado da geração de
 * propósito — um PDF digitalizado, sem camada de texto, aparece na hora, e
 * não depois de quarenta segundos esperando o escopo.
 */
function DocumentoAnexo({
  atual, onLido, onRemover,
}: {
  atual: { nome: string; caracteres: number } | null;
  onLido: (texto: string, nome: string) => void;
  onRemover: () => void;
}) {
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  async function enviar(arquivo: File) {
    setErro(null);
    setAviso(null);
    setLendo(true);
    try {
      const dados = new FormData();
      dados.append('arquivo', arquivo);
      const r = await extrairDocumentoAction(dados);
      if ('error' in r) { setErro(r.error); return; }
      onLido(r.texto, r.nome);
      if (r.cortado) {
        setAviso(
          `Documento longo (${r.caracteres.toLocaleString('pt-BR')} caracteres). `
          + 'Foram usados os primeiros 60 mil — normalmente é onde está o objeto do serviço.',
        );
      }
    } catch {
      setErro('Falha ao enviar o arquivo. Tente novamente.');
    } finally {
      setLendo(false);
      if (campo.current) campo.current.value = '';
    }
  }

  if (atual) {
    return (
      <div>
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-2.5 py-2">
          <FileText className="h-4 w-4 shrink-0 text-green-700" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-green-900">{atual.nome}</p>
            <p className="text-[11px] text-green-800">
              {atual.caracteres.toLocaleString('pt-BR')} caracteres lidos
            </p>
          </div>
          <button
            type="button" onClick={onRemover}
            className="rounded p-1 text-green-700 hover:bg-green-100"
            aria-label="Remover documento"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        {aviso ? <p className="mt-1 text-[11px] text-amber-700">{aviso}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <input
        ref={campo} type="file" accept=".pdf,.docx,.txt,.md" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviar(f); }}
      />
      <button
        type="button"
        disabled={lendo}
        onClick={() => campo.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-xs font-medium text-slate-600 hover:border-brand hover:text-brand disabled:opacity-60"
      >
        <Upload className="h-4 w-4" aria-hidden />
        {lendo ? 'Lendo o documento…' : 'Anexar termo de referência, edital ou memorial'}
      </button>
      <p className="mt-1 text-center text-[10px] text-slate-400">
        PDF, Word (.docx) ou texto, até 15 MB. O arquivo não é guardado — só o texto é lido.
      </p>
      {erro ? <p className="mt-1 text-[11px] text-red-600">{erro}</p> : null}
    </div>
  );
}
