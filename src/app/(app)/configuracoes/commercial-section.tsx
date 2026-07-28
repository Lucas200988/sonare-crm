'use client';

import { useActionState } from 'react';
import { CheckCircle2, SlidersHorizontal } from 'lucide-react';
import { saveCommercialSettingsAction, type ActionState } from '@/actions/settings';
import { inputCls, Field, FormError } from '@/components/ui';

export type CommercialSettings = {
  maxDiscountPercent: string;
  minMarginPercent: string;
  maxValueWithoutApproval: string;
  defaultValidityDays: string;
  infoGerais: string;
  diferenciais: string;
};

/**
 * Regras comerciais e textos padrão dos documentos.
 * Tudo aqui é lido do banco a cada documento gerado — mudanças valem na hora,
 * sem precisar republicar o sistema.
 */
export function CommercialSection({ settings }: { settings: CommercialSettings }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveCommercialSettingsAction, {},
  );

  return (
    <div>
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <SlidersHorizontal className="h-4 w-4 text-brand" aria-hidden /> Regras e textos dos documentos
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Valem para os próximos orçamentos e propostas. Alterações entram em vigor imediatamente.
      </p>

      <form action={formAction} className="mt-4 space-y-5">
        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Aprovação interna de orçamentos
          </legend>
          <p className="mb-3 text-[11px] text-slate-500">
            Ao submeter um orçamento, o sistema exige aprovação da diretoria se qualquer
            limite abaixo for ultrapassado.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Desconto máximo sem aprovação (%)" htmlFor="s-desc">
              <input id="s-desc" name="maxDiscountPercent" defaultValue={settings.maxDiscountPercent} inputMode="decimal" className={inputCls} />
            </Field>
            <Field label="Margem mínima exigida (%)" htmlFor="s-marg">
              <input id="s-marg" name="minMarginPercent" defaultValue={settings.minMarginPercent} inputMode="decimal" className={inputCls} />
            </Field>
            <Field label="Valor máximo sem aprovação (R$)" htmlFor="s-val">
              <input id="s-val" name="maxValueWithoutApproval" defaultValue={settings.maxValueWithoutApproval} inputMode="decimal" className={inputCls} />
            </Field>
          </div>
        </fieldset>

        <Field label="Validade padrão da proposta (dias)" htmlFor="s-validade" className="max-w-xs">
          <input id="s-validade" name="defaultValidityDays" defaultValue={settings.defaultValidityDays} inputMode="numeric" className={inputCls} />
        </Field>

        <Field label="Seção 6 da proposta — Informações gerais" htmlFor="s-info">
          <textarea
            id="s-info" name="infoGerais" defaultValue={settings.infoGerais} rows={8}
            spellCheck lang="pt-BR" className={`${inputCls} font-mono text-xs`}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Uma condição por linha, começando com &quot;- &quot;.
          </p>
        </Field>

        <Field label="Seção 7 da proposta — Diferenciais" htmlFor="s-dif">
          <textarea
            id="s-dif" name="diferenciais" defaultValue={settings.diferenciais} rows={5}
            spellCheck lang="pt-BR" className={`${inputCls} font-mono text-xs`}
          />
        </Field>

        <FormError message={state.error} />
        {state.info ? (
          <p className="flex items-center gap-1.5 text-xs text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {state.info}
          </p>
        ) : null}

        <button
          type="submit" disabled={pending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? 'Salvando…' : 'Salvar regras e textos'}
        </button>
      </form>
    </div>
  );
}
