'use client';

import { useActionState, useState, useTransition } from 'react';
import { CheckCircle2, KeyRound, Sparkles, Trash2 } from 'lucide-react';
import {
  saveAiConfigAction, testAiConnectionAction, removeAiKeyAction, type AiActionState,
} from '@/actions/ai';
import { inputCls, Field, FormError } from '@/components/ui';

const MODEL_HINTS: Record<string, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  anthropic: ['claude-sonnet-4-5', 'claude-haiku-4-5'],
};

export function AiSection({
  status,
}: {
  status: { configured: boolean; masked: string | null; provider: string; model: string; enabled: boolean };
}) {
  const [state, formAction, pending] = useActionState<AiActionState, FormData>(saveAiConfigAction, {});
  const [provider, setProvider] = useState(status.provider);
  const [testing, startTest] = useTransition();
  const [testResult, setTestResult] = useState<AiActionState | null>(null);

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
              onChange={(e) => setProvider(e.target.value)} className={inputCls}
            >
              <option value="openai">OpenAI (ChatGPT)</option>
              <option value="anthropic">Anthropic (Claude)</option>
            </select>
          </Field>
          <Field label="Modelo" htmlFor="ai-model">
            <input
              id="ai-model" name="model" list="ai-models"
              defaultValue={status.model || MODEL_HINTS[provider]?.[0]}
              className={inputCls}
            />
            <datalist id="ai-models">
              {(MODEL_HINTS[provider] ?? []).map((m) => <option key={m} value={m} />)}
            </datalist>
          </Field>
        </div>

        <Field label={status.configured ? 'Nova chave de API (deixe vazio para manter a atual)' : 'Chave de API'} htmlFor="ai-key">
          <input
            id="ai-key" name="apiKey" type="password" autoComplete="off"
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
