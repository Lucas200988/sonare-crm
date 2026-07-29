'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Undo2 } from 'lucide-react';
import { setProjectArchivedAction } from '@/actions/projects';
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
