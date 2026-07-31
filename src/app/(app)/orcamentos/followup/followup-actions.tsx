'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, Play, Send, X } from 'lucide-react';
import {
  saveFollowUpConfigAction, sendFollowUpAction, registerContactAction,
  runFollowUpNowAction, type ActionState,
} from '@/actions/followup';
import { inputCls, Field, FormError, SubmitButton } from '@/components/ui';

export type ConfigForm = {
  ativo: boolean;
  nivel: 'avisar' | 'preparar' | 'automatico';
  diasSemRetorno: number;
  diasVisualizadaSemDecisao: number;
  diasAntesDaValidade: number;
  intervaloMinimoDias: number;
  maximoPorClienteSemana: number;
};

const NIVEIS = [
  { valor: 'avisar', rotulo: 'Só avisar a equipe', hint: 'Cria aviso no painel. Nada sai para o cliente.' },
  { valor: 'preparar', rotulo: 'Preparar e aguardar', hint: 'O texto fica na fila; você revisa e envia.' },
  { valor: 'automatico', rotulo: 'Enviar sozinho', hint: 'Dispara na rotina diária, em horário comercial.' },
] as const;

/** Ajuste das regras, com o interruptor geral em destaque. */
export function ConfigPanel({ inicial }: { inicial: ConfigForm }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [nivel, setNivel] = useState(inicial.nivel);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveFollowUpConfigAction, {});

  useEffect(() => {
    if (state.info) { setAberto(false); router.refresh(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        Ajustar regras
      </button>
    );
  }

  return (
    <form action={formAction} className="w-full rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Regras de follow-up</h3>
        <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="rounded p-1 text-slate-400 hover:bg-slate-100">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <label className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <input type="checkbox" name="ativo" defaultChecked={inicial.ativo} className="rounded border-slate-300" />
        <span className="font-medium text-slate-800">Automação ligada</span>
        <span className="text-xs text-slate-500">— desligue para pausar tudo de uma vez</span>
      </label>

      <fieldset className="mb-3">
        <legend className="mb-1 text-xs font-medium text-slate-600">O que o sistema pode fazer</legend>
        <div className="space-y-1">
          {NIVEIS.map((n) => (
            <label
              key={n.valor}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 ${
                nivel === n.valor ? 'border-brand bg-brand-light/30' : 'border-slate-200'
              }`}
            >
              <input
                type="radio" name="nivel" value={n.valor}
                checked={nivel === n.valor}
                onChange={() => setNivel(n.valor)}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">{n.rotulo}</span>
                <span className="block text-[11px] text-slate-500">{n.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Dias úteis sem retorno" htmlFor="f-d1">
          <input id="f-d1" name="diasSemRetorno" type="number" min={1} max={60} defaultValue={inicial.diasSemRetorno} className={inputCls} />
        </Field>
        <Field label="Dias após visualizar" htmlFor="f-d2">
          <input id="f-d2" name="diasVisualizadaSemDecisao" type="number" min={1} max={60} defaultValue={inicial.diasVisualizadaSemDecisao} className={inputCls} />
        </Field>
        <Field label="Avisar N dias antes de vencer" htmlFor="f-d3">
          <input id="f-d3" name="diasAntesDaValidade" type="number" min={1} max={60} defaultValue={inicial.diasAntesDaValidade} className={inputCls} />
        </Field>
        <Field label="Silêncio mínimo (dias)" htmlFor="f-d4" hint="Entre dois toques da mesma proposta.">
          <input id="f-d4" name="intervaloMinimoDias" type="number" min={1} max={60} defaultValue={inicial.intervaloMinimoDias} className={inputCls} />
        </Field>
        <Field label="Máx. por cliente na semana" htmlFor="f-d5" hint="Teto de contatos automáticos.">
          <input id="f-d5" name="maximoPorClienteSemana" type="number" min={1} max={20} defaultValue={inicial.maximoPorClienteSemana} className={inputCls} />
        </Field>
      </div>

      <div className="mt-3"><FormError message={state.error} /></div>
      <div className="mt-3"><SubmitButton pending={pending}>Salvar regras</SubmitButton></div>
    </form>
  );
}

/** Roda a verificação na hora, sem esperar a rotina diária. */
export function RunNowButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const r = await runFollowUpNowAction();
          setMsg(r.error ?? r.info ?? null);
          router.refresh();
        })}
        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
      >
        <Play className="h-3.5 w-3.5" aria-hidden /> {pending ? 'Verificando…' : 'Verificar agora'}
      </button>
      {msg ? <p className="mt-1 text-[11px] text-slate-600">{msg}</p> : null}
    </div>
  );
}

/**
 * Ações de um item da fila.
 *
 * O texto vem pronto mas continua editável — quem envia assina embaixo, e
 * cada negociação tem seu tom.
 */
export function QueueItemActions({
  proposalId, tipo, para, assunto, corpo, urlWhatsApp,
}: {
  proposalId: string; tipo: string;
  para: string | null; assunto: string; corpo: string; urlWhatsApp: string | null;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [state, formAction, enviando] = useActionState<ActionState, FormData>(sendFollowUpAction, {});

  useEffect(() => {
    if (state.info) { setAberto(false); router.refresh(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function registrar(canal: 'WHATSAPP' | 'INTERNO') {
    startTransition(async () => {
      const r = await registerContactAction(proposalId, tipo, canal);
      if (r.error) setErro(r.error);
      else router.refresh();
    });
  }

  if (aberto) {
    return (
      <form action={formAction} className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <input type="hidden" name="proposalId" value={proposalId} />
        <input type="hidden" name="tipo" value={tipo} />
        <Field label="Para" htmlFor={`fu-para-${proposalId}`} required>
          <input id={`fu-para-${proposalId}`} name="para" type="email" required defaultValue={para ?? ''} className={inputCls} />
        </Field>
        <Field label="Assunto" htmlFor={`fu-as-${proposalId}`} required>
          <input id={`fu-as-${proposalId}`} name="assunto" required defaultValue={assunto} className={inputCls} />
        </Field>
        <Field label="Mensagem" htmlFor={`fu-co-${proposalId}`} required>
          <textarea id={`fu-co-${proposalId}`} name="corpo" required rows={5} defaultValue={corpo} spellCheck className={inputCls} />
        </Field>
        <p className="text-[11px] text-slate-500">
          O e-mail sai com o botão “Visualizar proposta” e a resposta volta para você.
        </p>
        <FormError message={state.error} />
        <div className="flex gap-2">
          <SubmitButton pending={enviando}>Enviar</SubmitButton>
          <button type="button" onClick={() => setAberto(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={!para}
          title={para ? undefined : 'Cliente sem e-mail cadastrado'}
          onClick={() => setAberto(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
        >
          <Send className="h-3 w-3" aria-hidden /> Revisar e enviar
        </button>
        {urlWhatsApp ? (
          <a
            href={urlWhatsApp}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => registrar('WHATSAPP')}
            className="inline-flex items-center gap-1 rounded-lg border border-green-300 px-2.5 py-1 text-[11px] font-medium text-green-700 hover:bg-green-50"
          >
            <MessageCircle className="h-3 w-3" aria-hidden /> WhatsApp
          </a>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={() => registrar('INTERNO')}
          className="rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
        >
          Dispensar
        </button>
      </div>
      <FormError message={erro} />
    </div>
  );
}
