'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, Loader2, Paperclip, Trash2, Video } from 'lucide-react';
import {
  confirmarArquivoDiretoAction, excluirArquivoAction, prepararUploadArquivoAction,
} from '@/actions/diario-arquivos';

export type ArquivoDaTela = {
  id: string;
  kind: string;
  seq: number;
  description: string | null;
  attachmentId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
};

type Envio = { nome: string; estado: 'enviando' | 'erro'; erro?: string };

function tamanho(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Vídeos e anexos do dia.
 *
 * O envio segue o mesmo caminho das fotos: direto ao bucket em produção
 * (vídeo não cabe no limite de requisição da Vercel), pela rota no local.
 */
export function ArquivoSection({ projetoId, diarioId, arquivos, canWrite }: {
  projetoId: string;
  diarioId: string;
  arquivos: ArquivoDaTela[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const inputVideo = useRef<HTMLInputElement>(null);
  const inputAnexo = useRef<HTMLInputElement>(null);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [, startTransition] = useTransition();

  async function enviar(file: File, kind: 'VIDEO' | 'ANEXO') {
    const nome = file.name;
    setEnvios((p) => [...p, { nome, estado: 'enviando' }]);
    const marcarErro = (erro: string) => setEnvios((p) =>
      p.map((e) => (e.nome === nome ? { ...e, estado: 'erro' as const, erro } : e)));
    const concluir = () => setEnvios((p) => p.filter((e) => e.nome !== nome));

    const mimeType = file.type || (kind === 'VIDEO' ? 'video/mp4' : 'application/octet-stream');
    const prep = await prepararUploadArquivoAction(diarioId, {
      fileName: nome, mimeType, sizeBytes: file.size, kind,
    });
    if ('error' in prep) { marcarErro(prep.error ?? 'Falha ao preparar.'); return; }

    if (prep.modo === 'direto') {
      const put = await fetch(prep.url, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: file,
      });
      if (!put.ok) { marcarErro('Falha no envio ao armazenamento.'); return; }
      const conf = await confirmarArquivoDiretoAction(diarioId, projetoId, {
        storageKey: prep.storageKey, fileName: nome, mimeType, kind,
      });
      if (conf.error) { marcarErro(conf.error); return; }
    } else {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('diaryId', diarioId);
      fd.set('kind', kind);
      const res = await fetch('/api/obra/arquivo', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        marcarErro(body?.error ?? 'Falha no envio.');
        return;
      }
    }
    concluir();
    startTransition(() => router.refresh());
  }

  function aoEscolher(e: React.ChangeEvent<HTMLInputElement>, kind: 'VIDEO' | 'ANEXO') {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    // sequencial de propósito: vídeo é pesado e paralelo estoura banda de campo
    (async () => { for (const f of files) await enviar(f, kind); })();
  }

  function excluir(arq: ArquivoDaTela) {
    const motivo = window.prompt(`Excluir "${arq.originalFilename}"?\nInforme o motivo (obrigatório):`);
    if (motivo === null) return;
    startTransition(async () => {
      await excluirArquivoAction(arq.id, projetoId, motivo);
      router.refresh();
    });
  }

  const videos = arquivos.filter((a) => a.kind === 'VIDEO');
  const anexos = arquivos.filter((a) => a.kind !== 'VIDEO');

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <Video className="h-4 w-4" aria-hidden /> Vídeos e anexos
          {arquivos.length > 0 ? <span className="text-slate-400">({arquivos.length})</span> : null}
        </h2>
        {canWrite ? (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => inputVideo.current?.click()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              <Video className="h-3 w-3" aria-hidden /> Vídeo
            </button>
            <button
              type="button"
              onClick={() => inputAnexo.current?.click()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              <Paperclip className="h-3 w-3" aria-hidden /> Anexo
            </button>
          </div>
        ) : null}
      </div>
      <input
        ref={inputVideo} type="file" accept="video/*" hidden
        onChange={(e) => aoEscolher(e, 'VIDEO')}
      />
      <input
        ref={inputAnexo} type="file" hidden multiple
        accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.txt,.csv"
        onChange={(e) => aoEscolher(e, 'ANEXO')}
      />
      {canWrite ? (
        <p className="mb-2 text-[10px] text-slate-400">Vídeo até 100 MB · anexo (PDF, planilha, documento) até 25 MB.</p>
      ) : null}

      {envios.map((e) => (
        <p key={e.nome} className={`mb-1 flex items-center gap-1.5 text-xs ${e.estado === 'erro' ? 'text-red-600' : 'text-slate-500'}`}>
          {e.estado === 'enviando' ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <FileUp className="h-3 w-3" aria-hidden />}
          {e.nome}{e.estado === 'erro' ? ` — ${e.erro}` : '…'}
          {e.estado === 'erro' ? (
            <button type="button" className="underline" onClick={() => setEnvios((p) => p.filter((x) => x.nome !== e.nome))}>ok</button>
          ) : null}
        </p>
      ))}

      {arquivos.length === 0 && envios.length === 0 ? (
        <p className="text-xs text-slate-400">Nenhum vídeo ou anexo neste diário.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {[...videos, ...anexos].map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <a
                href={`/api/arquivos/${a.attachmentId}`}
                target="_blank" rel="noopener noreferrer"
                className="flex min-w-0 items-center gap-1.5 text-slate-800 hover:text-brand"
              >
                {a.kind === 'VIDEO'
                  ? <Video className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                  : <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />}
                <span className="min-w-0 truncate">{a.originalFilename}</span>
                <span className="shrink-0 text-[10px] text-slate-400">{tamanho(a.sizeBytes)}</span>
              </a>
              {canWrite ? (
                <button
                  type="button"
                  aria-label={`Excluir ${a.originalFilename}`}
                  onClick={() => excluir(a)}
                  className="rounded p-1 text-slate-300 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
