'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FileDown, PenLine, Plus, X } from 'lucide-react';
import {
  generateDraftAction, addSignerAction, confirmSignatureAction,
  setStatusAction, createAmendmentAction, signAmendmentAction, type ActionState,
} from '@/actions/contracts';
import { inputCls, Field, FormError } from '@/components/ui';
import { formatDateBR } from '@/lib/dates';

const STATUS_OPTIONS = [
  ['MINUTA', 'Minuta'],
  ['EM_REVISAO_INTERNA', 'Em revisão interna'],
  ['AGUARDANDO_APROVACAO', 'Aguardando aprovação'],
  ['ENVIADO_AO_CLIENTE', 'Enviado ao cliente'],
  ['EM_NEGOCIACAO', 'Em negociação'],
  ['AGUARDANDO_ASSINATURA', 'Aguardando assinatura'],
  ['ASSINADO', 'Assinado'],
  ['VIGENTE', 'Vigente'],
  ['SUSPENSO', 'Suspenso'],
  ['ENCERRADO', 'Encerrado'],
  ['RESCINDIDO', 'Rescindido'],
  ['CANCELADO', 'Cancelado'],
] as const;

export function StatusSelect({ contractId, current }: { contractId: string; current: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-1.5">
      <label htmlFor="contract-status" className="block text-xs font-medium uppercase tracking-wide text-slate-500">
        Situação do contrato
      </label>
      <select
        id="contract-status" value={current} disabled={pending}
        onChange={(e) => startTransition(async () => {
          setError(null);
          const r = await setStatusAction(contractId, e.target.value);
          if (r.error) setError(r.error);
          else router.refresh();
        })}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium"
      >
        {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <FormError message={error} />
    </div>
  );
}

export function GenerateDraftButton({ contractId }: { contractId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => {
          setError(null); setMessage(null); setMissing([]);
          const r = await generateDraftAction(contractId);
          if (r.error) { setError(r.error); return; }
          setMessage(r.info ?? 'Minuta gerada.');
          setMissing(r.missing ?? []);
          router.refresh();
        })}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
      >
        <FileDown className="h-4 w-4" aria-hidden />
        {pending ? 'Gerando minuta…' : 'Gerar minuta (PDF)'}
      </button>
      {message ? <p className="text-xs text-green-700">{message}</p> : null}
      {missing.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          <p className="font-semibold">Campos por preencher na minuta:</p>
          <ul className="mt-1 list-inside list-disc">
            {missing.map((m) => <li key={m}>{m}</li>)}
          </ul>
          <p className="mt-1">Eles aparecem entre colchetes no PDF.</p>
        </div>
      ) : null}
      <FormError message={error} />
    </div>
  );
}

export type SignatureRow = {
  id: string;
  signerName: string;
  signerRole: string | null;
  signerEmail: string | null;
  status: string;
  signedAt: string | null;
};

export function SignaturesSection({
  contractId, signatures, canWrite, canSign,
}: {
  contractId: string;
  signatures: SignatureRow[];
  canWrite: boolean;
  canSign: boolean;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const action = addSignerAction.bind(null, contractId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const r = await action(prev, fd);
      if (!r.error) setShowForm(false);
      return r;
    },
    {},
  );
  const [confirming, startConfirm] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Assinaturas ({signatures.length})</h2>
        {canWrite ? (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
          >
            {showForm ? <X className="h-3 w-3" aria-hidden /> : <Plus className="h-3 w-3" aria-hidden />}
            {showForm ? 'Fechar' : 'Adicionar signatário'}
          </button>
        ) : null}
      </div>

      {showForm ? (
        <form action={formAction} className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <Field label="Nome de quem assina" htmlFor="s-name" required>
            <input id="s-name" name="signerName" required className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Papel" htmlFor="s-role">
              <select id="s-role" name="signerRole" className={inputCls} defaultValue="Contratante">
                <option>Contratante</option>
                <option>Contratada</option>
                <option>Testemunha</option>
              </select>
            </Field>
            <Field label="E-mail" htmlFor="s-email">
              <input id="s-email" name="signerEmail" type="email" className={inputCls} />
            </Field>
          </div>
          <FormError message={state.error} />
          <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
            {pending ? 'Adicionando…' : 'Adicionar'}
          </button>
        </form>
      ) : null}

      <ul className="mt-3 space-y-2">
        {signatures.length === 0 ? (
          <li className="text-xs text-slate-500">
            Nenhum signatário registrado. Adicione contratante, contratada e testemunhas.
          </li>
        ) : signatures.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{s.signerName}</p>
              <p className="text-[11px] text-slate-500">
                {s.signerRole ?? '—'}
                {s.signedAt ? ` · assinou em ${formatDateBR(s.signedAt)}` : ''}
              </p>
            </div>
            {s.status === 'assinado' ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Assinado
              </span>
            ) : canSign ? (
              <button
                type="button"
                disabled={confirming}
                onClick={() => startConfirm(async () => {
                  setError(null);
                  const r = await confirmSignatureAction(s.id, contractId);
                  if (r.error) setError(r.error);
                  else router.refresh();
                })}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <PenLine className="h-3 w-3" aria-hidden /> Registrar assinatura
              </button>
            ) : (
              <span className="shrink-0 text-[11px] text-slate-400">Pendente</span>
            )}
          </li>
        ))}
      </ul>
      <FormError message={error} />
    </div>
  );
}

export type AmendmentRow = {
  id: string;
  number: number;
  amendmentType: string;
  description: string;
  valueDelta: string | null;
  newEndDate: string | null;
  signedAt: string | null;
};

const AMENDMENT_TYPES = [
  ['VALOR', 'Valor'], ['PRAZO', 'Prazo'], ['ESCOPO', 'Escopo'],
  ['FORMA_PAGAMENTO', 'Forma de pagamento'], ['RESPONSABILIDADE', 'Responsabilidade'],
  ['SUSPENSAO', 'Suspensão'], ['RETOMADA', 'Retomada'], ['RESCISAO', 'Rescisão'],
] as const;

export function AmendmentsSection({
  contractId, amendments, canWrite, canSign, allowNew,
}: {
  contractId: string;
  amendments: AmendmentRow[];
  canWrite: boolean;
  canSign: boolean;
  allowNew: boolean;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const action = createAmendmentAction.bind(null, contractId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const r = await action(prev, fd);
      if (!r.error) { setShowForm(false); router.refresh(); }
      return r;
    },
    {},
  );
  const [signing, startSign] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Aditivos ({amendments.length})</h2>
        {canWrite && allowNew ? (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
          >
            {showForm ? <X className="h-3 w-3" aria-hidden /> : <Plus className="h-3 w-3" aria-hidden />}
            {showForm ? 'Fechar' : 'Novo aditivo'}
          </button>
        ) : null}
      </div>

      {!allowNew ? (
        <p className="mt-2 text-[11px] text-slate-400">
          Aditivos ficam disponíveis após a assinatura do contrato.
        </p>
      ) : null}

      {showForm ? (
        <form action={formAction} className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Tipo" htmlFor="a-type" required>
              <select id="a-type" name="amendmentType" className={inputCls} defaultValue="VALOR">
                {AMENDMENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Variação de valor (R$)" htmlFor="a-delta">
              <input id="a-delta" name="valueDelta" inputMode="decimal" placeholder="5.000,00 ou -2.000,00" className={inputCls} />
            </Field>
          </div>
          <Field label="Nova data de término" htmlFor="a-date">
            <input id="a-date" name="newEndDate" placeholder="dd/mm/aaaa" className={inputCls} />
          </Field>
          <Field label="Descrição do aditivo" htmlFor="a-desc" required>
            <textarea id="a-desc" name="description" required rows={3} spellCheck lang="pt-BR" className={inputCls} />
          </Field>
          <FormError message={state.error} />
          <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
            {pending ? 'Registrando…' : 'Registrar aditivo'}
          </button>
        </form>
      ) : null}

      <ul className="mt-3 space-y-2">
        {amendments.length === 0 ? (
          <li className="text-xs text-slate-500">Nenhum aditivo.</li>
        ) : amendments.map((a) => (
          <li key={a.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">
                  Aditivo {String(a.number).padStart(2, '0')} — {AMENDMENT_TYPES.find(([v]) => v === a.amendmentType)?.[1] ?? a.amendmentType}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">{a.description}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {a.valueDelta ? `Variação: R$ ${a.valueDelta} · ` : ''}
                  {a.newEndDate ? `Novo término: ${formatDateBR(a.newEndDate)} · ` : ''}
                  {a.signedAt ? `Assinado em ${formatDateBR(a.signedAt)}` : 'Pendente de assinatura'}
                </p>
              </div>
              {!a.signedAt && canSign ? (
                <button
                  type="button"
                  disabled={signing}
                  onClick={() => startSign(async () => {
                    setError(null);
                    const r = await signAmendmentAction(a.id, contractId);
                    if (r.error) setError(r.error);
                    else router.refresh();
                  })}
                  className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Assinar e aplicar
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <FormError message={error} />
    </div>
  );
}
