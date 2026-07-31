'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { deleteClientAction } from '@/actions/clients';
import { FormError } from '@/components/ui';

export type Vinculo = { tipo: 'contrato' | 'projeto'; href: string; rotulo: string };

/**
 * Exclusão do cadastro do cliente.
 *
 * É exclusão lógica: o cliente sai das listas e dos seletores, mas o registro
 * permanece para a auditoria e pode ser restaurado por um administrador.
 *
 * Contrato ou projeto vinculado bloqueia — e o motivo aparece na tela, com
 * link para o documento. Só dizer "não pode" mandaria a pessoa caçar às
 * cegas, ainda mais quando o projeto está arquivado e sumiu do quadro.
 */
export function DeleteClientButton({
  clientId, nome, vinculos,
}: {
  clientId: string;
  nome: string;
  vinculos: Vinculo[];
}) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);

  const bloqueado = vinculos.length > 0;

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={
          bloqueado
            ? 'inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50'
            : 'inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50'
        }
      >
        <Trash2 className="h-4 w-4" aria-hidden /> Excluir
      </button>
    );
  }

  if (bloqueado) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-left">
        <p className="text-xs font-semibold text-amber-900">
          Não dá para excluir {nome} agora
        </p>
        <p className="mt-1 text-xs text-amber-800">
          Há {vinculos.length === 1 ? 'um registro vinculado' : `${vinculos.length} registros vinculados`}.
          Exclua {vinculos.length === 1 ? 'ele' : 'eles'} primeiro, ou marque o cliente como
          <strong> Inativo</strong> na edição — assim o histórico continua rastreável.
        </p>
        <ul className="mt-2 space-y-1">
          {vinculos.map((v) => (
            <li key={v.href}>
              <Link
                href={v.href}
                className="text-xs font-medium text-amber-900 underline hover:text-amber-950"
              >
                {v.rotulo}
              </Link>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100"
        >
          Entendi
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-left">
      <p className="text-xs text-red-800">
        <strong>Excluir {nome}?</strong> O cadastro sai das listas e dos seletores.
        O registro fica preservado na auditoria e pode ser restaurado por um administrador.
      </p>
      <FormError message={erro} />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => {
            setErro(null);
            const r = await deleteClientAction(clientId);
            // sucesso redireciona para a lista; só um erro volta com mensagem
            if (r?.error) setErro(r.error);
          })}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
        >
          {pending ? 'Excluindo…' : 'Sim, excluir'}
        </button>
        <button
          type="button"
          onClick={() => { setAberto(false); setErro(null); }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          Voltar
        </button>
      </div>
    </div>
  );
}
