'use client';

import { useState } from 'react';
import { Check, Copy, FolderOpen } from 'lucide-react';

/**
 * Abre a pasta de rede do projeto em um clique.
 *
 * O navegador bloqueia `file://` vindo de uma página web (proteção do
 * Chrome/Edge). A saída é o atalho `sonare://`, registrado uma vez por máquina
 * pelo instalador em `ferramentas/abrir-pasta`. Se o atalho não estiver
 * instalado, o caminho é copiado para colar no Explorador — assim o botão
 * nunca fica sem função.
 */
/** Dispara o atalho e avisa (copiando o caminho) se ele não estiver instalado. */
export function abrirPastaNoExplorador(
  path: string,
  onSemAtalho?: () => void,
): void {
  const antes = Date.now();
  let saiuDoFoco = false;
  const marcar = () => { saiuDoFoco = true; };
  window.addEventListener('blur', marcar, { once: true });

  window.location.href = `sonare://abrir?p=${encodeURIComponent(path)}`;

  setTimeout(() => {
    window.removeEventListener('blur', marcar);
    // continuou com o foco = o Windows não conhece o atalho
    if (!saiuDoFoco && Date.now() - antes < 3000) {
      void navigator.clipboard.writeText(path).catch(() => {});
      onSemAtalho?.();
    }
  }, 1500);
}

export function FolderLink({ path }: { path: string }) {
  const [copiado, setCopiado] = useState(false);
  const [semAtalho, setSemAtalho] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(path);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
      return true;
    } catch {
      return false;
    }
  }

  function abrir() {
    abrirPastaNoExplorador(path, () => { setSemAtalho(true); setCopiado(true); });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-600" title={path}>
          {path}
        </span>
        <button
          type="button"
          onClick={abrir}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-dark"
        >
          <FolderOpen className="h-3 w-3" aria-hidden /> Abrir pasta
        </button>
        <button
          type="button"
          onClick={copiar}
          title="Copiar caminho"
          aria-label="Copiar caminho da pasta"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
        >
          {copiado
            ? <><Check className="h-3 w-3 text-green-600" aria-hidden /> Copiado</>
            : <><Copy className="h-3 w-3" aria-hidden /></>}
        </button>
      </div>

      {semAtalho ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          Este computador ainda não abre pastas com um clique — o caminho foi copiado, é só colar no
          Explorador (Win+E, depois Ctrl+L e Ctrl+V). Para habilitar,{' '}
          <a href="/ferramentas/sonare-abrir-pasta-v2.zip" download className="font-semibold underline">
            baixe o atalho
          </a>{' '}
          e rode o <span className="font-mono">instalar.cmd</span> uma única vez.
        </p>
      ) : null}
    </div>
  );
}
