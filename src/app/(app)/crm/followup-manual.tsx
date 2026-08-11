'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, MessageCircle, Send, X } from 'lucide-react';
import { prepararFollowUpManualAction, sendFollowUpAction } from '@/actions/followup';
import { inputCls, Field, FormError } from '@/components/ui';
import { formatDateTimeBR } from '@/lib/dates';

type Preparado = {
  proposalId: string;
  tipo: string;
  codigo: string;
  cliente: string;
  para: string | null;
  contato: string | null;
  valor: string;
  assunto: string;
  corpo: string;
  contatosRecentes: number;
  ultimoToqueEm: string | null;
  urlWhatsApp: string | null;
};

/**
 * Follow-up manual, disparado do cartão do pipeline.
 *
 * Existe para furar as regras da rotina de propósito: o comercial sentiu
 * que é hora de cobrar, e o sistema não discute — avisa. Se houve contato
 * com o cliente nos últimos dias, o aviso aparece antes do envio e a
 * decisão fica com quem está enviando.
 */
export function FollowUpManualButton({ opportunityId, cliente }: {
  opportunityId: string;
  cliente: string;
}) {
  const router = useRouter();
  const [carregando, startCarregar] = useTransition();
  const [enviando, startEnviar] = useTransition();
  const [dados, setDados] = useState<Preparado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [para, setPara] = useState('');
  const [assunto, setAssunto] = useState('');
  const [corpo, setCorpo] = useState('');

  function abrir() {
    setErro(null);
    startCarregar(async () => {
      const r = await prepararFollowUpManualAction(opportunityId);
      if ('error' in r) { setErro(r.error ?? 'Não foi possível preparar o follow-up.'); return; }
      setDados(r);
      setPara(r.para ?? '');
      setAssunto(r.assunto);
      setCorpo(r.corpo);
    });
  }

  function enviar() {
    if (!dados) return;
    startEnviar(async () => {
      setErro(null);
      const fd = new FormData();
      fd.set('proposalId', dados.proposalId);
      fd.set('tipo', dados.tipo);
      fd.set('para', para);
      fd.set('assunto', assunto);
      fd.set('corpo', corpo);
      const r = await sendFollowUpAction({}, fd);
      if (r.error) { setErro(r.error); return; }
      setDados(null);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={carregando}
        // o cartão é arrastável: sem isto, tocar no botão inicia o drag
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrir(); }}
        title="Enviar follow-up agora"
        aria-label={`Enviar follow-up para ${cliente}`}
        className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-brand disabled:opacity-50"
      >
        {carregando
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          : <Send className="h-3.5 w-3.5" aria-hidden />}
      </button>

      {erro && !dados ? (
        <span
          role="alert"
          className="absolute left-2 right-2 top-2 z-10 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {erro}
          <button type="button" className="ml-1 underline" onClick={() => setErro(null)}>ok</button>
        </span>
      ) : null}

      {dados ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog" aria-modal="true" aria-label="Enviar follow-up"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Follow-up manual</h3>
                <p className="text-xs text-slate-500">
                  {dados.codigo} · {dados.cliente} · {dados.valor}
                </p>
              </div>
              <button
                type="button" onClick={() => setDados(null)} aria-label="Fechar"
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {dados.contatosRecentes > 0 ? (
              <p className="mb-3 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  Já houve {dados.contatosRecentes} contato(s) com este cliente nos últimos 7 dias
                  {dados.ultimoToqueEm ? ` (último em ${formatDateTimeBR(dados.ultimoToqueEm)})` : ''}.
                  O envio é sua decisão — insistência demais também fala.
                </span>
              </p>
            ) : null}

            <div className="space-y-3">
              <Field label="Para" htmlFor="fm-para" required>
                <input
                  id="fm-para" type="email" value={para}
                  onChange={(e) => setPara(e.target.value)} className={inputCls}
                />
              </Field>
              <Field label="Assunto" htmlFor="fm-assunto" required>
                <input
                  id="fm-assunto" value={assunto}
                  onChange={(e) => setAssunto(e.target.value)} className={inputCls}
                />
              </Field>
              <Field label="Mensagem" htmlFor="fm-corpo" required>
                <textarea
                  id="fm-corpo" rows={7} value={corpo}
                  onChange={(e) => setCorpo(e.target.value)}
                  className={`${inputCls} text-sm`}
                />
              </Field>
            </div>

            <FormError message={erro} />

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={enviar}
                disabled={enviando || !para.includes('@') || !corpo.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" aria-hidden />
                {enviando ? 'Enviando…' : 'Enviar por e-mail'}
              </button>
              {dados.urlWhatsApp ? (
                <a
                  href={dados.urlWhatsApp}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
                >
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden /> WhatsApp
                </a>
              ) : null}
              <button
                type="button" onClick={() => setDados(null)}
                className="ml-auto rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
