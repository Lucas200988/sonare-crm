'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteClientAction } from '@/actions/clients';
import { FormError } from '@/components/ui';

/**
 * Exclusão do cadastro do cliente.
 *
 * É exclusão lógica: o cliente sai das listas e dos seletores, mas o registro
 * permanece para a auditoria e pode ser restaurado por um administrador.
 *
 * Contrato ou projeto vinculado bloqueia — nesse caso o certo é inativar. A
 * tela já avisa disso antes do clique, para o bloqueio não virar surpresa.
 */
export function DeleteClientButton({
  clientId, nome, contratos, projetos,
}: {
  clientId: string;
  nome: string;
  contratos: number;
  projetos: number;
}) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const bloqueios = [
    contratos > 0 ? `${contratos} contrato(s)` : null,
    projetos > 0 ? `${projetos} projeto(s)` : null,
  ].filter(Boolean);
  const bloqueado = bloqueios.length > 0;

  if (bloqueado) {
    return (
      <span
        title={`Este cliente tem ${bloqueios.join(' e ')} vinculado(s). Marque-o como Inativo na edição.`}
        className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-400"
      >
        <Trash2 className="h-4 w-4" aria-hidden /> Excluir
      </span>
    );
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
      >
        <Trash2 className="h-4 w-4" aria-hidden /> Excluir
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
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
          onClick={() => { setConfirmando(false); setErro(null); }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          Voltar
        </button>
      </div>
    </div>
  );
}
