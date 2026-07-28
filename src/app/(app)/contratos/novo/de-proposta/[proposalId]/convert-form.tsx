'use client';

import { useState, useTransition } from 'react';
import { FileSignature } from 'lucide-react';
import { createFromProposalAction } from '@/actions/contracts';
import { inputCls, Field, FormError } from '@/components/ui';

export function ConvertProposalForm({
  proposalId, templates,
}: {
  proposalId: string;
  templates: Array<{ id: string; name: string; kind: string }>;
}) {
  const [templateId, setTemplateId] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Field label="Modelo de contrato" htmlFor="templateId" required>
        <select
          id="templateId" value={templateId}
          onChange={(e) => setTemplateId(e.target.value)} className={inputCls}
        >
          <option value="">Selecione o modelo…</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          Define as cláusulas da minuta. Você poderá revisar tudo antes de gerar o PDF.
        </p>
      </Field>

      <FormError message={error} />

      <button
        type="button"
        disabled={pending || !templateId}
        onClick={() => startTransition(async () => {
          setError(null);
          const result = await createFromProposalAction(proposalId, templateId);
          if (result?.error) setError(result.error);
        })}
        className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        <FileSignature className="h-4 w-4" aria-hidden />
        {pending ? 'Gerando contrato…' : 'Gerar contrato'}
      </button>
    </div>
  );
}
