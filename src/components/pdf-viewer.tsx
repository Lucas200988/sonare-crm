'use client';

import { useEffect, useState } from 'react';
import { Download, FileText, Loader2, X } from 'lucide-react';

/**
 * Visualizador de PDF em modal.
 *
 * Carrega o arquivo como blob e exibe num <iframe>: assim o documento aparece
 * na própria tela mesmo quando o navegador está configurado para baixar PDFs
 * em vez de abri-los. O download só acontece se o usuário pedir.
 */
/** Botão que abre um documento já emitido (proposta, minuta) na própria tela. */
export function ViewDocumentButton({
  attachmentId, title, fileName, label = 'Abrir PDF',
}: {
  attachmentId: string;
  title: string;
  fileName: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
      >
        <FileText className="h-3.5 w-3.5" aria-hidden /> {label}
      </button>
      {open ? (
        <PdfViewer
          url={`/api/arquivos/${attachmentId}`}
          title={title}
          fileName={fileName}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export function PdfViewer({
  url, title, fileName, onClose,
}: {
  url: string;
  title: string;
  fileName: string;
  onClose: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Falha ao gerar o documento (${res.status}).`);
        }
        const blob = await res.blob();
        if (cancelled) return;
        revoked = URL.createObjectURL(blob);
        setBlobUrl(revoked);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao carregar o documento.');
      }
    })();

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [url]);

  // Fecha com Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/70 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
          <h2 className="truncate text-sm font-semibold text-slate-900">{title}</h2>
          <div className="flex shrink-0 items-center gap-2">
            {blobUrl ? (
              <a
                href={blobUrl}
                download={fileName}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" aria-hidden /> Baixar
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Fechar visualização"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-slate-100">
          {error ? (
            <div className="flex h-full items-center justify-center p-6">
              <p role="alert" className="max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
                {error}
              </p>
            </div>
          ) : blobUrl ? (
            <iframe src={blobUrl} title={title} className="h-full w-full border-0" />
          ) : (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Gerando documento…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
