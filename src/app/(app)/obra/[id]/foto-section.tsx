'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Images, Loader2, Tag, Trash2, X } from 'lucide-react';
import {
  categorizarFotoAction, confirmarFotoAction, excluirFotoAction,
  prepararUploadFotoAction,
} from '@/actions/diario-fotos';

export type FotoDaTela = {
  id: string;
  seq: number;
  codigo: string;
  category: string | null;
  description: string | null;
  captureSource: string;
  hora: string;
};

/** Categorias de um toque — as mais usadas primeiro; o resto é digitável depois. */
const CATEGORIAS = [
  'Visão geral', 'Serviço executado', 'Antes', 'Durante', 'Depois',
  'Material', 'Equipamento', 'Segurança', 'Não conformidade', 'Outros',
];

type Envio = { nome: string; estado: 'enviando' | 'ok' | 'erro'; detalhe?: string };

/**
 * Câmera e galeria do diário.
 *
 * O original vai do aparelho direto ao bucket quando há URL assinada (o
 * limite de 4,5 MB por requisição da Vercel não comporta foto de celular);
 * em desenvolvimento segue pela rota. Nos dois casos o servidor calcula o
 * hash do que recebeu — nunca é o cliente que afirma a integridade.
 */
export function FotoSection({ projetoId, diarioId, fotos, canWrite }: {
  projetoId: string;
  diarioId: string;
  fotos: FotoDaTela[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [ampliada, setAmpliada] = useState<FotoDaTela | null>(null);

  /** Posição atual, com timeout curto — a foto não espera o GPS. */
  function posicao(): Promise<{ lat: number | null; lng: number | null; accuracy: number | null }> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ lat: null, lng: null, accuracy: null });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        () => resolve({ lat: null, lng: null, accuracy: null }),
        { enableHighAccuracy: true, timeout: 5_000, maximumAge: 30_000 },
      );
    });
  }

  async function enviarUm(
    file: File, origem: 'APP_CAMERA' | 'GALLERY_IMPORT',
    loc: { lat: number | null; lng: number | null; accuracy: number | null },
  ) {
    const nome = file.name || 'foto.jpg';
    setEnvios((prev) => [...prev, { nome, estado: 'enviando' }]);
    const marcar = (estado: Envio['estado'], detalhe?: string) =>
      setEnvios((prev) => prev.map((e) => (e.nome === nome ? { ...e, estado, detalhe } : e)));

    try {
      const prep = await prepararUploadFotoAction(diarioId, {
        fileName: nome, mimeType: file.type || 'image/jpeg', sizeBytes: file.size,
      });
      if ('error' in prep) { marcar('erro', prep.error); return; }

      if (prep.modo === 'direto') {
        // original direto ao bucket; só marcar enviada depois do 200
        const put = await fetch(prep.url, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'image/jpeg' },
          body: file,
        });
        if (!put.ok) { marcar('erro', 'Falha no envio ao armazenamento.'); return; }

        const conf = await confirmarFotoAction(diarioId, projetoId, {
          storageKey: prep.storageKey,
          fileName: nome,
          mimeType: file.type || 'image/jpeg',
          capturedAt: file.lastModified || null,
          lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy,
          source: origem,
        });
        if (conf.error) { marcar('erro', conf.error); return; }
        marcar('ok');
      } else {
        const fd = new FormData();
        fd.set('file', file);
        fd.set('diaryId', diarioId);
        fd.set('source', origem);
        if (file.lastModified) fd.set('capturedAt', String(file.lastModified));
        if (loc.lat !== null) fd.set('lat', String(loc.lat));
        if (loc.lng !== null) fd.set('lng', String(loc.lng));
        if (loc.accuracy !== null) fd.set('accuracy', String(loc.accuracy));
        const res = await fetch('/api/obra/foto', { method: 'POST', body: fd });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          marcar('erro', body?.error ?? 'Falha no envio.');
          return;
        }
        marcar('ok');
      }
    } catch {
      marcar('erro', 'Sem conexão — tente de novo.');
    }
  }

  async function aoEscolher(lista: FileList | null, origem: 'APP_CAMERA' | 'GALLERY_IMPORT') {
    if (!lista || lista.length === 0) return;
    const arquivos = Array.from(lista);
    const loc = await posicao();
    // sequencial de propósito: manter a ordem das fotos e não afogar a rede da obra
    for (const f of arquivos) {
       
      await enviarUm(f, origem, loc);
    }
    router.refresh();
    setTimeout(() => setEnvios((prev) => prev.filter((e) => e.estado === 'erro')), 2_500);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <Camera className="h-4 w-4" aria-hidden /> Fotos
          {fotos.length > 0 ? (
            <span className="rounded-full bg-slate-100 px-1.5 text-xs text-slate-500">{fotos.length}</span>
          ) : null}
        </h2>
      </div>

      {canWrite ? (
        <>
          <input
            ref={cameraRef} type="file" accept="image/*" capture="environment"
            className="hidden"
            onChange={(e) => { void aoEscolher(e.target.files, 'APP_CAMERA'); e.target.value = ''; }}
          />
          <input
            ref={galeriaRef} type="file" accept="image/*" multiple
            className="hidden"
            onChange={(e) => { void aoEscolher(e.target.files, 'GALLERY_IMPORT'); e.target.value = ''; }}
          />
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-xl bg-brand px-3 py-4 text-sm font-bold text-white shadow-md hover:bg-brand-dark"
            >
              <Camera className="h-5 w-5" aria-hidden /> Tirar foto
            </button>
            <button
              type="button"
              onClick={() => galeriaRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 px-3 py-4 text-sm font-semibold text-slate-800 hover:border-brand/50"
            >
              <Images className="h-5 w-5" aria-hidden /> Da galeria
            </button>
          </div>
        </>
      ) : null}

      {envios.length > 0 ? (
        <ul className="mb-3 space-y-1">
          {envios.map((e, i) => (
            <li key={`${e.nome}-${i}`} className={`flex items-center gap-1.5 text-xs ${
              e.estado === 'erro' ? 'text-red-600' : e.estado === 'ok' ? 'text-green-700' : 'text-slate-500'
            }`}>
              {e.estado === 'enviando' ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
              {e.estado === 'enviando' ? `Enviando ${e.nome}…`
                : e.estado === 'ok' ? `${e.nome} enviada`
                  : `${e.nome}: ${e.detalhe}`}
            </li>
          ))}
        </ul>
      ) : null}

      {fotos.length === 0 ? (
        <p className="text-xs text-slate-400">Nenhuma foto registrada hoje.</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {fotos.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setAmpliada(f)}
              className="group relative aspect-square overflow-hidden rounded-lg bg-slate-100"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/foto/${f.id}?v=thumb`}
                alt={f.description ?? `Foto ${f.seq}`}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              {!f.category ? (
                <span className="absolute right-1 top-1 rounded bg-amber-400 px-1 text-[9px] font-bold text-amber-950">
                  sem categoria
                </span>
              ) : null}
              <span className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5 text-left text-[9px] text-white">
                F{String(f.seq).padStart(3, '0')} · {f.hora}
              </span>
            </button>
          ))}
        </div>
      )}

      {ampliada ? (
        <FotoAmpliada
          foto={ampliada}
          projetoId={projetoId}
          canWrite={canWrite}
          onFechar={() => setAmpliada(null)}
        />
      ) : null}
    </div>
  );
}

/** Foto aberta: versão com tarja, categoria por um toque e exclusão com motivo. */
function FotoAmpliada({ foto, projetoId, canWrite, onFechar }: {
  foto: FotoDaTela;
  projetoId: string;
  canWrite: boolean;
  onFechar: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function categorizar(categoria: string) {
    startTransition(async () => {
      setErro(null);
      const r = await categorizarFotoAction(foto.id, projetoId, { category: categoria });
      if (r.error) { setErro(r.error); return; }
      onFechar();
      router.refresh();
    });
  }

  function excluir() {
    const motivo = window.prompt('Motivo da exclusão (fica registrado):');
    if (!motivo?.trim()) return;
    startTransition(async () => {
      setErro(null);
      const r = await excluirFotoAction(foto.id, projetoId, motivo);
      if (r.error) { setErro(r.error); return; }
      onFechar();
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 p-3"
      role="dialog" aria-modal="true" aria-label={`Foto ${foto.codigo}`}
    >
      <div className="flex items-center justify-between text-white">
        <p className="text-sm font-medium">
          {foto.codigo}
          {foto.captureSource === 'GALLERY_IMPORT' ? (
            <span className="ml-2 rounded bg-amber-500/80 px-1.5 py-0.5 text-[10px] font-semibold">
              importada da galeria
            </span>
          ) : null}
        </p>
        <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded p-1.5 hover:bg-white/10">
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center py-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/foto/${foto.id}?v=view`}
          alt={foto.description ?? `Foto ${foto.seq}`}
          className="max-h-full max-w-full rounded-lg object-contain"
        />
      </div>

      {canWrite ? (
        <div className="space-y-2">
          <p className="flex items-center gap-1 text-xs text-white/80">
            <Tag className="h-3 w-3" aria-hidden />
            {foto.category ? `Categoria: ${foto.category} (toque para trocar)` : 'Classifique com um toque:'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIAS.map((c) => (
              <button
                key={c}
                type="button"
                disabled={pending}
                onClick={() => categorizar(c)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
                  foto.category === c
                    ? 'bg-white text-slate-900'
                    : 'bg-white/15 text-white hover:bg-white/30'
                }`}
              >
                {c}
              </button>
            ))}
            <button
              type="button"
              disabled={pending}
              onClick={excluir}
              className="ml-auto flex items-center gap-1 rounded-full bg-red-500/80 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" aria-hidden /> Excluir
            </button>
          </div>
          {erro ? <p className="text-xs text-red-300">{erro}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
