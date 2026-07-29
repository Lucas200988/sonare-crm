import type { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { requireAuth } from '@/server/auth/guards';
import { logoutAction } from '@/actions/auth';
import { NAV_ITEMS } from '@/config/navigation';
import { SidebarNav, type SidebarItem } from '@/components/sidebar-nav';
import { GlobalSearch } from '@/components/global-search';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireAuth();

  const items: SidebarItem[] = NAV_ITEMS.filter(
    (item) => item.permission === null || user.permissions.has(item.permission),
  ).map(({ label, href, icon, comingSoon, child }) => ({ label, href, icon, comingSoon, child }));

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-800 bg-slate-950 lg:flex">
        <div className="border-b border-slate-800 px-5 py-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-horizontal-branco.png"
            alt="SONARE Engenharia"
            className="h-9 w-auto"
          />
          <p className="mt-2 text-[11px] text-slate-500">Sistema de gestão</p>
        </div>
        <div className="px-3 pt-3">
          <GlobalSearch />
        </div>
        <SidebarNav items={items} />
        <div className="border-t border-slate-800 p-4">
          <p className="truncate text-sm font-medium text-slate-200">{user.name}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
          <form action={logoutAction} className="mt-3">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden /> Sair
            </button>
          </form>
        </div>
      </aside>
      <div className="flex min-h-screen w-full flex-col lg:pl-60">
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
