'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Eye, FileDown, FilePlus2, SendHorizonal, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { PdfViewer, ViewDocumentButton } from '@/components/pdf-viewer';
import {
  submitBudgetAction, decideApprovalAction, newVersionAction,
  generateProposalAction, proposalEventAction, deleteBudgetAction, cancelBudgetAction,
  type ActionState,
} from '@/actions/budgets';
import { inputCls, FormError } from '@/components/ui';

/** Mostra o PDF como a proposta ficará, na própria tela, sem emitir documento. */
export function PreviewButton({ budgetId, budgetCode }: { budgetId: string; budgetCode: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        <Eye className="h-4 w-4" aria-hidden /> Pré-visualizar proposta
      </button>
      {open ? (
        <PdfViewer
          url={`/api/orcamentos/${budgetId}/previa`}
          title={`Pré-visualização — ${budgetCode}`}
          fileName={`previa-${budgetCode}.pdf`}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}


export function SubmitBudgetButton({ budgetId }: { budgetId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => {
          setErr(null); setMsg(null);
          const r = await submitBudgetAction(budgetId);
          if (r.error) setErr(r.error);
          else { setMsg(r.info ?? 'Submetido.'); router.refresh(); }
        })}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
      >
        <ShieldCheck className="h-4 w-4" aria-hidden />
        {pending ? 'Verificando…' : 'Submeter para aprovação'}
      </button>
      {msg ? <p className="text-xs text-green-700">{msg}</p> : null}
      <FormError message={err} />
    </div>
  );
}

export function ApprovalDecision({ budgetId }: { budgetId: string }) {
  const approveAction = decideApprovalAction.bind(null, budgetId, true);
  const rejectAction = decideApprovalAction.bind(null, budgetId, false);
  const [stateA, formApprove, pendingA] = useActionState<ActionState, FormData>(approveAction, {});
  const [stateR, formReject, pendingR] = useActionState<ActionState, FormData>(rejectAction, {});
  const [comment, setComment] = useState('');

  return (
    <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50 p-3">
      <p className="text-xs font-semibold text-violet-800">Aprovação interna pendente</p>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        placeholder="Comentário (opcional)"
        className={inputCls}
      />
      <div className="flex gap-2">
        <form action={formApprove} className="flex-1">
          <input type="hidden" name="comment" value={comment} />
          <button type="submit" disabled={pendingA || pendingR} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-500 disabled:opacity-60">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Aprovar
          </button>
        </form>
        <form action={formReject} className="flex-1">
          <input type="hidden" name="comment" value={comment} />
          <button type="submit" disabled={pendingA || pendingR} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60">
            <XCircle className="h-3.5 w-3.5" aria-hidden /> Devolver p/ revisão
          </button>
        </form>
      </div>
      <FormError message={stateA.error ?? stateR.error} />
    </div>
  );
}

export function NewVersionForm({ budgetId }: { budgetId: string }) {
  const action = newVersionAction.bind(null, budgetId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        <FilePlus2 className="h-4 w-4" aria-hidden /> Nova versão
      </button>
    );
  }
  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <label htmlFor="nv-reason" className="text-xs font-medium text-slate-600">Justificativa da nova versão</label>
      <input id="nv-reason" name="reason" required placeholder="Ex.: ajuste de escopo a pedido do cliente" className={inputCls} />
      <FormError message={state.error} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
          {pending ? 'Criando…' : 'Criar versão'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-white">
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function GenerateProposalButton({ budgetId, jaEmitida }: {
  budgetId: string;
  /** Já existe proposta para a versão corrente — o botão passa a reemitir. */
  jaEmitida?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [attachmentId, setAttachmentId] = useState<string | null>(null);

  const rotulo = jaEmitida ? 'Reemitir proposta (PDF)' : 'Gerar proposta (PDF)';

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => {
          setErr(null); setMsg(null);
          const r = await generateProposalAction(budgetId);
          if (r.error) setErr(r.error);
          else {
            setMsg(r.info ?? 'Proposta gerada.');
            setAttachmentId(r.attachmentId ?? null);
            router.refresh();
          }
        })}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        <FileDown className="h-4 w-4" aria-hidden />
        {pending ? 'Gerando PDF…' : rotulo}
      </button>

      {msg ? <p className="text-xs text-green-700">{msg}</p> : null}
      {attachmentId ? (
        <ViewDocumentButton
          attachmentId={attachmentId}
          title="Proposta"
          fileName="proposta.pdf"
          label="Abrir proposta"
        />
      ) : null}
      {jaEmitida && !msg ? (
        <p className="text-[11px] text-slate-500">
          Reemitir gera o PDF de novo com o mesmo número. Para numerar outra proposta,
          crie uma nova versão do orçamento.
        </p>
      ) : null}
      <FormError message={err} />
    </div>
  );
}

/** Exclusão (apenas sem proposta enviada) e cancelamento do orçamento. */
export function DangerZone({ budgetId, canDelete }: { budgetId: string; canDelete: boolean }) {
  const cancelAction = cancelBudgetAction.bind(null, budgetId);
  const [cancelState, cancelForm, cancelPending] = useActionState<ActionState, FormData>(cancelAction, {});
  const [mode, setMode] = useState<'none' | 'cancel' | 'delete'>('none');
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  return (
    <div className="space-y-2 border-t border-slate-200 pt-3">
      {mode === 'none' ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('cancel')}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancelar orçamento
          </button>
          {canDelete ? (
            <button
              type="button"
              onClick={() => setMode('delete')}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Excluir
            </button>
          ) : null}
        </div>
      ) : null}

      {mode === 'cancel' ? (
        <form action={cancelForm} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <label htmlFor="cancel-reason" className="text-xs font-medium text-slate-600">
            Motivo do cancelamento
          </label>
          <input id="cancel-reason" name="reason" required placeholder="Ex.: cliente desistiu do serviço" className={inputCls} />
          <FormError message={cancelState.error} />
          <div className="flex gap-2">
            <button type="submit" disabled={cancelPending} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
              {cancelPending ? 'Cancelando…' : 'Confirmar cancelamento'}
            </button>
            <button type="button" onClick={() => setMode('none')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-white">
              Voltar
            </button>
          </div>
        </form>
      ) : null}

      {mode === 'delete' ? (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-xs text-red-800">
            <strong>Excluir este orçamento?</strong> Ele sai das listas e dos indicadores.
            O registro fica preservado na auditoria e a ação pode ser revertida por um administrador.
          </p>
          <FormError message={deleteError} />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => startDelete(async () => {
                setDeleteError(null);
                const r = await deleteBudgetAction(budgetId);
                if (r?.error) setDeleteError(r.error);
              })}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
            >
              {deleting ? 'Excluindo…' : 'Sim, excluir'}
            </button>
            <button type="button" onClick={() => setMode('none')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-white">
              Voltar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const EVENT_OPTIONS = [
  { value: 'ENVIADA', label: 'Registrar envio ao cliente' },
  { value: 'VISUALIZADA', label: 'Cliente visualizou' },
  { value: 'ACEITA', label: 'Cliente aceitou' },
  { value: 'RECUSADA', label: 'Cliente recusou' },
] as const;

export function ProposalEventForm({ proposalId, budgetId, status }: { proposalId: string; budgetId: string; status: string }) {
  const action = proposalEventAction.bind(null, proposalId, budgetId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const [event, setEvent] = useState<string>('ENVIADA');

  const available = EVENT_OPTIONS.filter((o) => {
    if (status === 'ACEITA' || status === 'RECUSADA') return false;
    if (status === 'RASCUNHO') return true;
    return o.value !== 'ENVIADA'; // já enviada
  });
  if (available.length === 0) return null;

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2">
      <select
        name="event" value={event} onChange={(e) => setEvent(e.target.value)}
        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
        aria-label="Evento da proposta"
      >
        {available.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {event === 'ENVIADA' ? (
        <>
          <input name="sentVia" placeholder="Canal (e-mail, WhatsApp…)" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" aria-label="Canal de envio" />
          <input name="recipients" placeholder="Destinatários" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" aria-label="Destinatários" />
        </>
      ) : null}
      {event === 'RECUSADA' ? (
        <input name="rejectionReason" placeholder="Motivo da recusa" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" aria-label="Motivo da recusa" />
      ) : null}
      <button type="submit" disabled={pending} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
        <SendHorizonal className="h-3 w-3" aria-hidden /> Registrar
      </button>
      <FormError message={state.error} />
    </form>
  );
}
