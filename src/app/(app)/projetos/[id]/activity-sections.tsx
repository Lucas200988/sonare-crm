'use client';

import { useActionState, useRef } from 'react';
import { Paperclip, Send } from 'lucide-react';
import { addProjectCommentAction, uploadProjectFileAction, type ActionState } from '@/actions/projects';
import { inputCls, FormError } from '@/components/ui';
import { formatDateTimeBR } from '@/lib/dates';

export type CommentRow = {
  id: string;
  body: string;
  createdAt: string;
  author: { name: string } | null;
};

export function CommentsSection({ projectId, comments }: { projectId: string; comments: CommentRow[] }) {
  const action = addProjectCommentAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Comentários</h2>

      <form
        ref={formRef}
        action={async (formData) => {
          await formAction(formData);
          formRef.current?.reset();
        }}
        className="mb-4 flex gap-2"
      >
        <textarea
          name="body" rows={2} required
          placeholder="Escreva um comentário para a equipe…"
          className={inputCls}
          aria-label="Novo comentário"
        />
        <button
          type="submit" disabled={pending}
          className="shrink-0 self-end rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          aria-label="Publicar comentário"
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </form>
      <FormError message={state.error} />

      {comments.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum comentário ainda.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg bg-slate-50 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">{c.author?.name ?? 'Usuário removido'}</span>
                <span className="text-[11px] text-slate-400">{formatDateTimeBR(c.createdAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type AttachmentRow = {
  id: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentsSection({
  projectId, attachments, canWrite,
}: { projectId: string; attachments: AttachmentRow[]; canWrite: boolean }) {
  const action = uploadProjectFileAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Arquivos</h2>

      {canWrite ? (
        <form
          ref={formRef}
          action={async (formData) => {
            await formAction(formData);
            formRef.current?.reset();
          }}
          className="mb-3 flex items-center gap-2"
        >
          <input
            type="file" name="file" required
            className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            aria-label="Arquivo para anexar"
          />
          <button
            type="submit" disabled={pending}
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {pending ? 'Enviando…' : 'Anexar'}
          </button>
        </form>
      ) : null}
      <FormError message={state.error} />

      {attachments.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum arquivo anexado.</p>
      ) : (
        <ul className="space-y-1.5">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
              <a
                href={`/api/arquivos/${a.id}`}
                target="_blank" rel="noopener noreferrer"
                className="flex min-w-0 items-center gap-1.5 text-slate-700 hover:underline"
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                <span className="truncate">{a.fileName}</span>
              </a>
              <span className="shrink-0 text-[11px] text-slate-400">{formatSize(a.sizeBytes)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
