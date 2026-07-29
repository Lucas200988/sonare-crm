'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Plus, Trash2, X } from 'lucide-react';
import {
  createTechRespAction, dischargeTechRespAction, cancelTechRespAction,
  deleteTechRespAction, type ActionState,
} from '@/actions/tech-resp';
import { inputCls, Field, FormError, SubmitButton } from '@/components/ui';

export type ProjectOption = { id: string; code: string; name: string };
export type ProfessionalOption = { id: string; name: string; creaCau: string | null };

/**
 * Cadastro da responsabilidade técnica registrada no conselho.
 *
 * O sistema não emite a ART — o registro segue no portal do CREA/CAU. Aqui
 * fica o controle de qual documento cobre qual projeto e o que falta baixar.
 */
export function NewTechResp({ projects, professionals }: {
  projects: ProjectOption[]; professionals: ProfessionalOption[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createTechRespAction, {});
  const [interno, setInterno] = useState(true);

  useEffect(() => {
    if (state.info) { setAberto(false); router.refresh(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
      >
        <Plus className="h-4 w-4" aria-hidden /> Cadastrar ART/RRT
      </button>
    );
  }

  return (
    <form action={formAction} className="grid w-full gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
      <Field label="Tipo" htmlFor="tr-tipo" required>
        <select id="tr-tipo" name="docType" defaultValue="ART" className={inputCls}>
          <option value="ART">ART (CREA)</option>
          <option value="RRT">RRT (CAU)</option>
          <option value="TRT">TRT (CFT)</option>
        </select>
      </Field>
      <Field label="Número" htmlFor="tr-numero" required>
        <input id="tr-numero" name="number" required className={inputCls} />
      </Field>
      <Field label="Conselho" htmlFor="tr-conselho">
        <input id="tr-conselho" name="council" defaultValue="CREA-MT" className={inputCls} />
      </Field>
      <Field label="Emissão" htmlFor="tr-emissao">
        <input id="tr-emissao" name="issuedAt" type="date" className={inputCls} />
      </Field>

      <Field label="Projeto" htmlFor="tr-projeto" className="sm:col-span-2">
        <select id="tr-projeto" name="projectId" defaultValue="" className={inputCls}>
          <option value="">Sem projeto vinculado</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
      </Field>
      <Field label="Taxa paga (R$)" htmlFor="tr-valor">
        <input id="tr-valor" name="value" placeholder="0,00" className={inputCls} />
      </Field>
      <div className="flex items-end pb-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox" checked={interno}
            onChange={(e) => setInterno(e.target.checked)}
            className="rounded border-slate-300"
          />
          Profissional da equipe
        </label>
      </div>

      {interno ? (
        <Field label="Profissional" htmlFor="tr-prof" className="sm:col-span-2">
          <select id="tr-prof" name="professionalId" defaultValue="" className={inputCls}>
            <option value="">Selecione…</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.creaCau ? ` — ${p.creaCau}` : ''}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-500">
            O registro profissional vem do cadastro em Usuários.
          </p>
        </Field>
      ) : (
        <>
          <Field label="Nome do profissional" htmlFor="tr-nome" className="sm:col-span-2">
            <input id="tr-nome" name="professionalName" className={inputCls} />
          </Field>
          <Field label="Registro (CREA/CAU)" htmlFor="tr-reg" className="sm:col-span-2">
            <input id="tr-reg" name="registration" placeholder="MT 029137" className={inputCls} />
          </Field>
        </>
      )}

      <Field label="Descrição do serviço" htmlFor="tr-desc" className="sm:col-span-4">
        <input
          id="tr-desc" name="serviceDescription"
          placeholder="Ex.: Projeto elétrico de baixa tensão — 450 m²"
          className={inputCls}
        />
      </Field>

      <div className="sm:col-span-4"><FormError message={state.error} /></div>
      <div className="flex gap-2 sm:col-span-4">
        <SubmitButton pending={pending}>Cadastrar</SubmitButton>
        <button type="button" onClick={() => setAberto(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function DischargeButton({ id, numero }: { id: string; numero: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const action = dischargeTechRespAction.bind(null, id);
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
        className="inline-flex items-center gap-1 rounded-lg border border-green-300 px-2.5 py-1 text-[11px] font-medium text-green-700 hover:bg-green-50"
      >
        <CheckCircle2 className="h-3 w-3" aria-hidden /> Dar baixa
      </button>

      {aberto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="Baixa da ART">
          <form action={formAction} className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Dar baixa</h3>
                <p className="text-xs text-slate-500">{numero}</p>
              </div>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="rounded p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <Field label="Data da baixa" htmlFor="tb-data" required>
              <input
                id="tb-data" name="dischargedAt" type="date" required
                defaultValue={new Date().toISOString().slice(0, 10)}
                className={inputCls}
              />
            </Field>
            <p className="mt-2 text-[11px] text-slate-500">
              A baixa encerra a responsabilidade técnica e deve ser feita também no
              portal do conselho.
            </p>

            <div className="mt-3"><FormError message={state.error} /></div>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setAberto(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <SubmitButton pending={pending}>Confirmar</SubmitButton>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

export function TechRespRowActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-end gap-1.5">
      {status !== 'CANCELADA' ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm('Cancelar este registro?')) return;
            startTransition(async () => {
              await cancelTechRespAction(id);
              router.refresh();
            });
          }}
          className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancelar
        </button>
      ) : null}
      <button
        type="button"
        disabled={pending}
        aria-label="Remover registro"
        onClick={() => {
          if (!confirm('Remover este registro?')) return;
          startTransition(async () => {
            await deleteTechRespAction(id);
            router.refresh();
          });
        }}
        className="rounded-lg border border-slate-300 p-1 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
      >
        <Trash2 className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}
