'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquarePlus, X } from 'lucide-react';
import { addCollectionEventAction, type ActionState } from '@/actions/finance';
import { inputCls, Field, FormError, SubmitButton } from '@/components/ui';

export const TIPOS_COBRANCA: Array<[string, string]> = [
  ['LEMBRETE_PRE_VENCIMENTO', 'Lembrete antes do vencimento'],
  ['AVISO_VENCIMENTO', 'Aviso de vencimento'],
  ['PRIMEIRO_AVISO_ATRASO', '1º aviso de atraso'],
  ['SEGUNDO_AVISO_ATRASO', '2º aviso de atraso'],
  ['COBRANCA_FORMAL', 'Cobrança formal'],
  ['RENEGOCIACAO', 'Renegociação'],
  ['ENCAMINHAMENTO_JURIDICO', 'Encaminhado ao jurídico'],
];

/** Registra o contato feito, já sugerindo o passo adequado ao tempo de atraso. */
export function RegisterContactButton({
  receivableId, sugestao, cliente,
}: { receivableId: string; sugestao: string; cliente: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const action = addCollectionEventAction.bind(null, receivableId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  useEffect(() => {
    if (state.info) { setAberto(false); router.refresh(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
      >
        <MessageSquarePlus className="h-3 w-3" aria-hidden /> Registrar contato
      </button>

      {aberto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="Registrar contato de cobrança">
          <form action={formAction} className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Registrar cobrança</h3>
                <p className="text-xs text-slate-500">{cliente}</p>
              </div>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="rounded p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="space-y-3">
              <Field label="Tipo de contato" htmlFor="cb-tipo" required>
                <select id="cb-tipo" name="eventType" defaultValue={sugestao} required className={inputCls}>
                  {TIPOS_COBRANCA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <Field label="Canal" htmlFor="cb-canal">
                <select id="cb-canal" name="channel" defaultValue="WhatsApp" className={inputCls}>
                  <option>WhatsApp</option>
                  <option>E-mail</option>
                  <option>Telefone</option>
                  <option>Presencial</option>
                  <option>Carta</option>
                </select>
              </Field>
              <Field label="Anotação" htmlFor="cb-notas">
                <textarea id="cb-notas" name="notes" rows={2} placeholder="O que o cliente respondeu?" className={inputCls} />
              </Field>
            </div>

            <p className="mt-2 text-[11px] text-slate-500">
              Avisos de atraso movem a parcela para “Em cobrança”; encaminhamento ao jurídico
              marca como inadimplente.
            </p>

            <div className="mt-3"><FormError message={state.error} /></div>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setAberto(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <SubmitButton pending={pending}>Registrar</SubmitButton>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

/** Abre o WhatsApp com a mensagem de cobrança já escrita. */
export function WhatsAppButton({ telefone, mensagem }: { telefone: string; mensagem: string }) {
  const numero = telefone.replace(/\D/g, '');
  const completo = numero.length <= 11 ? `55${numero}` : numero;

  return (
    <a
      href={`https://wa.me/${completo}?text=${encodeURIComponent(mensagem)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-lg border border-green-300 px-2.5 py-1 text-[11px] font-medium text-green-700 hover:bg-green-50"
    >
      WhatsApp
    </a>
  );
}
