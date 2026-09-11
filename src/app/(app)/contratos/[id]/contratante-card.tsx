'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState } from 'react';
import { AlertTriangle, CheckCircle2, UserRound } from 'lucide-react';
import { completarDadosContratanteAction, type ActionState } from '@/actions/contracts';
import { inputCls, Field, FormError, SubmitButton } from '@/components/ui';

export type ContratanteInfo = {
  id: string;
  legalName: string;
  personType: 'FISICA' | 'JURIDICA';
  documento: string | null;
  endereco: string | null;
  /** PJ: existe contato marcado como contratual (o representante da minuta)? */
  temRepresentante: boolean;
};

/**
 * Os dados do contratante que a minuta imprime, com conserto no lugar.
 *
 * Sem isto, o "[informar]" só aparecia depois de gerar a minuta — e a
 * correção exigia sair do contrato, achar o cliente e voltar. Aqui o aviso
 * vem antes, e o cadastro se completa sem trocar de tela.
 */
export function ContratanteCard({ contractId, cliente, canFixClient }: {
  contractId: string;
  cliente: ContratanteInfo;
  canFixClient: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);

  const rotuloDoc = cliente.personType === 'FISICA' ? 'CPF' : 'CNPJ';
  const faltando: string[] = [];
  if (!cliente.documento) faltando.push(rotuloDoc);
  if (!cliente.endereco) faltando.push('endereço');
  if (cliente.personType === 'JURIDICA' && !cliente.temRepresentante) {
    faltando.push('representante legal');
  }

  const acao = completarDadosContratanteAction.bind(null, cliente.id, contractId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const r = await acao(prev, fd);
      if (!r.error) { setAberto(false); router.refresh(); }
      return r;
    },
    {},
  );

  return (
    <div>
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <UserRound className="h-4 w-4" aria-hidden /> Contratante
      </h2>
      <p className="text-xs text-slate-700">{cliente.legalName}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">
        {cliente.documento ? `${rotuloDoc} ${cliente.documento}` : null}
        {cliente.documento && cliente.endereco ? ' · ' : ''}
        {cliente.endereco ?? ''}
      </p>

      {faltando.length === 0 ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Dados completos para a minuta.
        </p>
      ) : (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="flex items-start gap-1.5 text-[11px] text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Sem <strong>{faltando.join(', ')}</strong> no cadastro — a minuta sai
              com <span className="font-mono">[informar]</span> no lugar.
            </span>
          </p>

          {canFixClient && (!cliente.documento || !cliente.endereco) && !aberto ? (
            <button
              type="button"
              onClick={() => setAberto(true)}
              className="mt-2 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
            >
              Completar cadastro agora
            </button>
          ) : null}

          {cliente.personType === 'JURIDICA' && !cliente.temRepresentante ? (
            <p className="mt-2 text-[11px] text-amber-900">
              O representante legal vem do contato marcado como <strong>contratual</strong>{' '}
              no cadastro —{' '}
              <Link href={`/clientes/${cliente.id}`} className="underline">
                cadastre no cliente
              </Link>.
            </p>
          ) : null}

          {!canFixClient ? (
            <p className="mt-2 text-[11px] text-amber-900">
              Complete no{' '}
              <Link href={`/clientes/${cliente.id}`} className="underline">cadastro do cliente</Link>
              {' '}(requer acesso de edição de clientes).
            </p>
          ) : null}
        </div>
      )}

      {aberto ? (
        <form action={formAction} className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
          {!cliente.documento ? (
            <Field label={rotuloDoc} htmlFor="ct-doc" required>
              <input
                id="ct-doc" name="documento" required inputMode="numeric"
                placeholder={cliente.personType === 'FISICA' ? '000.000.000-00' : '00.000.000/0000-00'}
                className={inputCls}
              />
            </Field>
          ) : null}

          {!cliente.endereco ? (
            <>
              <div className="grid grid-cols-[1fr_5rem] gap-2">
                <Field label="Rua / Avenida" htmlFor="ct-rua" required>
                  <input id="ct-rua" name="addressStreet" required className={inputCls} />
                </Field>
                <Field label="Nº" htmlFor="ct-num">
                  <input id="ct-num" name="addressNumber" className={inputCls} />
                </Field>
              </div>
              <Field label="Bairro" htmlFor="ct-bairro">
                <input id="ct-bairro" name="addressDistrict" className={inputCls} />
              </Field>
              <div className="grid grid-cols-[1fr_4rem_6rem] gap-2">
                <Field label="Cidade" htmlFor="ct-cidade">
                  <input id="ct-cidade" name="city" className={inputCls} />
                </Field>
                <Field label="UF" htmlFor="ct-uf">
                  <input id="ct-uf" name="state" maxLength={2} placeholder="MT" className={inputCls} />
                </Field>
                <Field label="CEP" htmlFor="ct-cep">
                  <input id="ct-cep" name="zipCode" inputMode="numeric" placeholder="78000-000" className={inputCls} />
                </Field>
              </div>
            </>
          ) : null}

          <FormError message={state.error} />
          <div className="flex gap-2">
            <SubmitButton pending={pending}>Salvar no cadastro</SubmitButton>
            <button
              type="button" onClick={() => setAberto(false)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-600"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {state.info ? (
        <p className="mt-2 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-[11px] text-green-800">
          {state.info}
        </p>
      ) : null}
    </div>
  );
}
