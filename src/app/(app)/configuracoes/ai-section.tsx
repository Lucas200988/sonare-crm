'use client';

import { useActionState, useState, useTransition } from 'react';
import { CheckCircle2, KeyRound, Sparkles, Trash2 } from 'lucide-react';
import {
  saveAiConfigAction, testAiConnectionAction, removeAiKeyAction, type AiActionState,
} from '@/actions/ai';
import { inputCls, Field, FormError } from '@/components/ui';

/**
 * Modelos oferecidos por provedor. O primeiro é o padrão ao trocar de
 * provedor — e é um modelo forte de propósito: o prompt de escopo tem treze
 * seções de regras, e modelo pequeno obedece mal justamente na parte de não
 * ampliar o escopo.
 *
 * A lista envelhece; por isso existe a opção de digitar um nome à mão, para
 * não travar quem quiser usar um modelo lançado depois desta tela.
 */
const MODELOS: Record<string, Array<{ id: string; rotulo: string }>> = {
  openai: [
    { id: 'gpt-4o', rotulo: 'GPT-4o — rápido e equilibrado, recomendado' },
    { id: 'gpt-4.1', rotulo: 'GPT-4.1 — mais capaz, ainda rápido' },
    { id: 'gpt-4.1-mini', rotulo: 'GPT-4.1 mini — o mais barato' },
    { id: 'gpt-4o-mini', rotulo: 'GPT-4o mini — barato, obedece mal a prompt longo' },
  ],
  anthropic: [
    { id: 'claude-sonnet-5', rotulo: 'Claude Sonnet 5 — equilibrado, recomendado' },
    { id: 'claude-haiku-4-5', rotulo: 'Claude Haiku 4.5 — o mais rápido' },
    { id: 'claude-opus-5', rotulo: 'Claude Opus 5 — o mais capaz, mais lento' },
  ],
};

const OUTRO = '__outro__';

/**
 * Modelo de raciocínio (série o, família GPT-5)?
 *
 * Eles "pensam" antes de responder, o que aqui é só espera: a geração de
 * escopo pede obediência a um prompt longo, com a estrutura da resposta já
 * definida. Na prática estouram o tempo da requisição.
 */
function ehRaciocinio(model: string): boolean {
  return /^(o\d|gpt-5)/i.test(model.trim());
}

/** Prefixos que identificam a que provedor um modelo pertence. */
const PREFIXOS: Record<string, string> = { openai: 'gpt', anthropic: 'claude' };

function modeloCombina(provider: string, model: string): boolean {
  const prefixo = PREFIXOS[provider];
  if (!prefixo || !model.trim()) return true;
  return model.trim().toLowerCase().startsWith(prefixo);
}

export function AiSection({
  status,
}: {
  status: { configured: boolean; masked: string | null; provider: string; model: string; enabled: boolean };
}) {
  const [state, formAction, pending] = useActionState<AiActionState, FormData>(saveAiConfigAction, {});
  const [provider, setProvider] = useState(status.provider);
  // Controlado: com defaultValue, trocar de provedor deixava o modelo antigo
  // no campo — e "Anthropic + gpt-4" só falha lá na frente, na chamada.
  const [model, setModel] = useState(
    status.model || MODELOS[status.provider]?.[0]?.id || '',
  );
  const [testing, startTest] = useTransition();
  const [testResult, setTestResult] = useState<AiActionState | null>(null);

  /*
   * "Outro" precisa de estado próprio: deduzir pelo valor faria o campo
   * voltar sozinho para o primeiro da lista assim que o usuário apagasse o
   * texto para digitar outro nome.
   */
  const [personalizado, setPersonalizado] = useState(() => {
    const lista = MODELOS[status.provider] ?? [];
    return Boolean(status.model) && !lista.some((m) => m.id === status.model);
  });

  const daLista = MODELOS[provider] ?? [];

  function escolherModelo(valor: string) {
    if (valor === OUTRO) { setPersonalizado(true); setModel(''); return; }
    setPersonalizado(false);
    setModel(valor);
  }

  function trocarProvedor(novo: string) {
    setProvider(novo);
    if (!modeloCombina(novo, model)) {
      setPersonalizado(false);
      setModel(MODELOS[novo]?.[0]?.id ?? '');
    }
  }

  return (
    <div>
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <Sparkles className="h-4 w-4 text-brand" aria-hidden /> Inteligência artificial
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Conecte uma API para gerar o escopo técnico das propostas a partir de um briefing curto.
        A chave é criptografada antes de ser gravada e nunca é exibida novamente.
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Provedor" htmlFor="ai-provider">
            <select
              id="ai-provider" name="provider" value={provider}
              onChange={(e) => trocarProvedor(e.target.value)} className={inputCls}
            >
              <option value="openai">OpenAI (ChatGPT)</option>
              <option value="anthropic">Anthropic (Claude)</option>
            </select>
          </Field>
          <Field label="Modelo" htmlFor="ai-model">
            {/*
              Lista fechada, não autocompletar: o datalist anterior filtrava as
              sugestões pelo texto já digitado, então o campo parecia ter uma
              opção só. O valor enviado vai no input escondido.
            */}
            <select
              id="ai-model"
              value={personalizado ? OUTRO : model}
              onChange={(e) => escolherModelo(e.target.value)}
              className={inputCls}
            >
              {daLista.map((m) => <option key={m.id} value={m.id}>{m.rotulo}</option>)}
              <option value={OUTRO}>Outro — digitar o nome do modelo</option>
            </select>
            <input type="hidden" name="model" value={model} />

            {personalizado ? (
              <input
                aria-label="Nome do modelo"
                value={model} onChange={(e) => setModel(e.target.value)}
                placeholder={provider === 'openai' ? 'gpt-…' : 'claude-…'}
                className={`${inputCls} mt-1.5`}
              />
            ) : null}

            {!modeloCombina(provider, model) ? (
              <p className="mt-1 text-[11px] text-amber-700">
                “{model}” não parece um modelo da {provider === 'openai' ? 'OpenAI' : 'Anthropic'} —
                a chamada vai falhar na hora de gerar.
              </p>
            ) : ehRaciocinio(model) ? (
              <p className="mt-1 rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                <strong>“{model}” é um modelo de raciocínio.</strong> Ele pensa antes de escrever,
                e a geração de escopo costuma passar do tempo da requisição — a tela devolve erro
                em vez do texto. Para esta função, prefira um modelo direto como GPT-4o.
              </p>
            ) : null}
          </Field>
        </div>

        <Field label={status.configured ? 'Nova chave de API (deixe vazio para manter a atual)' : 'Chave de API'} htmlFor="ai-key">
          <input
            // "new-password" porque o Chrome ignora "off" e preenche o campo
            // com a senha salva do site — que sobrescreveria a chave da API
            id="ai-key" name="apiKey" type="password" autoComplete="new-password"
            placeholder={provider === 'openai' ? 'sk-proj-…' : 'sk-ant-…'}
            className={inputCls}
          />
        </Field>

        {status.configured ? (
          <p className="flex items-center gap-1.5 text-xs text-green-700">
            <KeyRound className="h-3.5 w-3.5" aria-hidden />
            Chave configurada: <code className="rounded bg-slate-100 px-1">{status.masked}</code>
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            Nenhuma chave configurada. Crie uma em{' '}
            {provider === 'openai' ? 'platform.openai.com → API keys' : 'console.anthropic.com → API keys'}.
          </p>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox" name="enabled" defaultChecked={status.enabled}
            className="rounded border-slate-300"
          />
          Ativar geração de escopo por IA
        </label>
        {!status.configured ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            Sem chave, a geração fica desligada mesmo com esta caixa marcada. Provedor e modelo
            podem ser salvos agora; a chave pode vir depois.
          </p>
        ) : null}

        <FormError message={state.error} />
        {state.info ? (
          <p className="flex items-center gap-1.5 text-xs text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {state.info}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="submit" disabled={pending}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {pending ? 'Salvando…' : 'Salvar configuração'}
          </button>
          <button
            type="button"
            disabled={testing || !status.configured}
            onClick={() => startTest(async () => setTestResult(await testAiConnectionAction()))}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {testing ? 'Testando…' : 'Testar conexão'}
          </button>
          {status.configured ? (
            <button
              type="button"
              onClick={() => {
                if (confirm('Remover a chave de API? A geração por IA será desativada.')) {
                  void removeAiKeyAction();
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remover chave
            </button>
          ) : null}
        </div>
      </form>

      {testResult ? (
        testResult.error ? (
          <FormError message={testResult.error} />
        ) : (
          <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {testResult.info}
          </p>
        )
      ) : null}

      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
        O uso da API é cobrado pelo provedor conforme o volume de texto gerado. O conteúdo produzido
        é uma sugestão: revise tecnicamente antes de enviar qualquer proposta ao cliente.
      </p>
    </div>
  );
}
