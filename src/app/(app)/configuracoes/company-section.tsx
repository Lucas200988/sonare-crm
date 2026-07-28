'use client';

import { useActionState } from 'react';
import { Building2, CheckCircle2 } from 'lucide-react';
import { saveCompanyAction, type CompanyActionState } from '@/actions/company';
import { inputCls, Field, FormError } from '@/components/ui';
import { formatCNPJ, formatCEP, formatPhoneBR } from '@/lib/br';

export type CompanyValues = {
  legalName: string;
  tradeName: string | null;
  cnpj: string | null;
  stateRegistration: string | null;
  cityRegistration: string | null;
  crea: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressDistrict: string | null;
  zipCode: string | null;
  city: string | null;
  state: string | null;
  signerName: string | null;
  signerTitle: string | null;
  signerRegistration: string | null;
  signerPhone: string | null;
  signerEmail: string | null;
};

export function CompanySection({ company }: { company: CompanyValues }) {
  const [state, formAction, pending] = useActionState<CompanyActionState, FormData>(saveCompanyAction, {});

  return (
    <div>
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <Building2 className="h-4 w-4 text-brand" aria-hidden /> Dados do proponente
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Usados no cabeçalho, rodapé e assinatura de todas as propostas e contratos gerados.
      </p>

      <form action={formAction} className="mt-4 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <Field label="Razão social" htmlFor="c-legal" required className="sm:col-span-4">
            <input id="c-legal" name="legalName" defaultValue={company.legalName} required className={inputCls} />
          </Field>
          <Field label="Nome fantasia" htmlFor="c-trade" className="sm:col-span-2">
            <input id="c-trade" name="tradeName" defaultValue={company.tradeName ?? ''} className={inputCls} />
          </Field>
          <Field label="CNPJ" htmlFor="c-cnpj" className="sm:col-span-2">
            <input id="c-cnpj" name="cnpj" defaultValue={company.cnpj ? formatCNPJ(company.cnpj) : ''} placeholder="00.000.000/0000-00" className={inputCls} />
          </Field>
          <Field label="Inscrição estadual" htmlFor="c-ie" className="sm:col-span-2">
            <input id="c-ie" name="stateRegistration" defaultValue={company.stateRegistration ?? ''} className={inputCls} />
          </Field>
          <Field label="Inscrição municipal" htmlFor="c-im" className="sm:col-span-2">
            <input id="c-im" name="cityRegistration" defaultValue={company.cityRegistration ?? ''} className={inputCls} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <Field label="Telefone" htmlFor="c-phone" className="sm:col-span-2">
            <input id="c-phone" name="phone" defaultValue={company.phone ? formatPhoneBR(company.phone) : ''} placeholder="(65) 3321-3284" className={inputCls} />
          </Field>
          <Field label="WhatsApp" htmlFor="c-wpp" className="sm:col-span-2">
            <input id="c-wpp" name="whatsapp" defaultValue={company.whatsapp ?? ''} className={inputCls} />
          </Field>
          <Field label="E-mail" htmlFor="c-email" className="sm:col-span-2">
            <input id="c-email" name="email" type="email" defaultValue={company.email ?? ''} className={inputCls} />
          </Field>
          <Field label="Site" htmlFor="c-site" className="sm:col-span-3">
            <input id="c-site" name="website" defaultValue={company.website ?? ''} placeholder="www.sonareengenharia.com.br" className={inputCls} />
          </Field>
          <Field label="CREA da empresa" htmlFor="c-crea" className="sm:col-span-3">
            <input id="c-crea" name="crea" defaultValue={company.crea ?? ''} placeholder="MT 029137" className={inputCls} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <Field label="CEP" htmlFor="c-cep" className="sm:col-span-2">
            <input id="c-cep" name="zipCode" defaultValue={company.zipCode ? formatCEP(company.zipCode) : ''} placeholder="78010-000" className={inputCls} />
          </Field>
          <Field label="Logradouro" htmlFor="c-street" className="sm:col-span-4">
            <input id="c-street" name="addressStreet" defaultValue={company.addressStreet ?? ''} className={inputCls} />
          </Field>
          <Field label="Número" htmlFor="c-number" className="sm:col-span-1">
            <input id="c-number" name="addressNumber" defaultValue={company.addressNumber ?? ''} className={inputCls} />
          </Field>
          <Field label="Complemento" htmlFor="c-comp" className="sm:col-span-2">
            <input id="c-comp" name="addressComplement" defaultValue={company.addressComplement ?? ''} className={inputCls} />
          </Field>
          <Field label="Bairro" htmlFor="c-district" className="sm:col-span-3">
            <input id="c-district" name="addressDistrict" defaultValue={company.addressDistrict ?? ''} className={inputCls} />
          </Field>
          <Field label="Cidade" htmlFor="c-city" className="sm:col-span-4">
            <input id="c-city" name="city" defaultValue={company.city ?? ''} className={inputCls} />
          </Field>
          <Field label="UF" htmlFor="c-state" className="sm:col-span-2">
            <input id="c-state" name="state" defaultValue={company.state ?? ''} maxLength={2} className={inputCls} />
          </Field>
        </div>

        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Assinatura padrão das propostas
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Responsável pela proposta" htmlFor="c-signer">
              <input id="c-signer" name="signerName" defaultValue={company.signerName ?? ''} placeholder="Lucas Silva Costa" className={inputCls} />
            </Field>
            <Field label="Cargo / função" htmlFor="c-signer-title">
              <input id="c-signer-title" name="signerTitle" defaultValue={company.signerTitle ?? ''} placeholder="Responsável Técnico" className={inputCls} />
            </Field>
            <Field label="Registro profissional" htmlFor="c-signer-reg">
              <input id="c-signer-reg" name="signerRegistration" defaultValue={company.signerRegistration ?? ''} placeholder="CREA-MT 029137" className={inputCls} />
            </Field>
            <Field label="Telefone do responsável" htmlFor="c-signer-phone">
              <input id="c-signer-phone" name="signerPhone" defaultValue={company.signerPhone ?? ''} placeholder="+55 (65) 98463-3872" className={inputCls} />
            </Field>
            <Field label="E-mail do responsável" htmlFor="c-signer-email">
              <input id="c-signer-email" name="signerEmail" type="email" defaultValue={company.signerEmail ?? ''} placeholder="lucas@sonareengenharia.com.br" className={inputCls} />
            </Field>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Sai no rodapé da proposta, abaixo da linha de assinatura. Em branco, usa o telefone e o e-mail da empresa.
          </p>
        </fieldset>

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
          {pending ? 'Salvando…' : 'Salvar dados do proponente'}
        </button>
      </form>
    </div>
  );
}
