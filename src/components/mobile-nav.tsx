'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { SidebarNav, type SidebarItem } from '@/components/sidebar-nav';
import { GlobalSearch } from '@/components/global-search';

/**
 * Navegação para telas pequenas.
 *
 * A barra lateral fixa é escondida abaixo de 1024px; sem isto, o celular
 * ficava sem nenhuma forma de trocar de módulo. Aqui a gaveta abre por cima
 * do conteúdo e fecha sozinha ao navegar.
 */
export function MobileNav({
  items, userName, userEmail, logout,
}: {
  items: SidebarItem[];
  userName: string;
  userEmail: string;
  logout: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const pathname = usePathname();

  // trocar de tela fecha a gaveta
  useEffect(() => { setAberto(false); }, [pathname]);

  // trava a rolagem do fundo enquanto a gaveta está aberta
  useEffect(() => {
    document.body.style.overflow = aberto ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [aberto]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setAberto(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-800 bg-slate-950 px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Abrir menu"
          aria-expanded={aberto}
          className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-horizontal-branco.png" alt="SONARE Engenharia" className="h-6 w-auto" />
      </header>

      {aberto ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setAberto(false)}
            className="absolute inset-0 bg-slate-950/60"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo-horizontal-branco.png" alt="SONARE Engenharia" className="h-7 w-auto" />
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar menu"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="px-3 pt-3">
              <GlobalSearch />
            </div>

            <div className="flex-1 overflow-y-auto">
              <SidebarNav items={items} />
            </div>

            <div className="border-t border-slate-800 p-4">
              <p className="truncate text-sm font-medium text-slate-200">{userName}</p>
              <p className="truncate text-xs text-slate-500">{userEmail}</p>
              <div className="mt-3">{logout}</div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
