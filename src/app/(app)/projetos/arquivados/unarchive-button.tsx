'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Undo2 } from 'lucide-react';
import { deleteProjectAction, setProjectArchivedAction } from '@/actions/projects';
import { FormError } from '@/components/ui';

/**
 * Devolve o cartão ao quadro.
 *
 * O projeto volta para a coluna do status que tinha quando foi arquivado —
 * arquivar nunca mexeu no status, só tirou o cartão da frente.
 */
export function UnarchiveButton({ projectId, projectName }: {
  projectId: string; projectName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => {
          setErro(null);
          const r = await setProjectArchivedAction(projectId, false);
          if (r.error) setErro(r.error);
          else router.refresh();
        })}
        aria-label={`Desarquivar ${projectName}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
      >
        <Undo2 className="h-3.5 w-3.5" aria-hidden />
        {pending ? 'Devolvendo…' : 'Devolver ao quadro'}
      </button>
      <FormError message={erro} />
    </div>
  );
}

/**
 * Exclui de vez um cartão arquivado.
 *
 * Arquivar é a antessala: some do quadro e fica aqui. Quem confirmar depois
 * que não serve mais apaga — e a exclusão é lógica, então o registro segue
 * na auditoria e pode ser restaurado por um administrador.
 */
export function DeleteProjectButton({ projectId, projectName }: {
  projectId: string; projectName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          aria-label={`Excluir ${projectName}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Excluir
        </button>
        <FormError message={erro} />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-2">
      <p className="text-[11px] text-red-800">
        Excluir <strong>{projectName}</strong>? Sai das listas; o registro fica na auditoria.
      </p>
      <FormError message={erro} />
      <div className="mt-1.5 flex gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => {
            setErro(null);
            const r = await deleteProjectAction(projectId);
            if (r.error) { setErro(r.error); setConfirmando(false); }
            else router.refresh();
          })}
          className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-500 disabled:opacity-60"
        >
          {pending ? 'Excluindo…' : 'Sim, excluir'}
        </button>
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
        >
          Voltar
        </button>
      </div>
    </div>
  );
}
