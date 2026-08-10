'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowDownCircle, ArrowUpCircle, BarChart3, BellRing, Calculator, FileSignature, FolderKanban,
  HardHat, KanbanSquare, LayoutDashboard, ReceiptText, Scale, Send, Settings, Stamp, UserCog, Users, Wallet, Wrench, type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Users, KanbanSquare, Calculator, FileSignature,
  FolderKanban, Wallet, ReceiptText, BarChart3, UserCog, Settings,
  ArrowDownCircle, ArrowUpCircle, BellRing, HardHat, Scale, Send, Stamp, Wrench,
};

export type SidebarItem = {
  label: string; href: string; icon: string; comingSoon?: boolean; child?: boolean;
};

export function SidebarNav({ items }: { items: SidebarItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Menu principal" className="flex-1 space-y-0.5 px-3 py-4">
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        // subitens do financeiro nao devem acender o item pai
        const active = item.child
          ? pathname === item.href
          : pathname === item.href || (!items.some((i) => i.child && i.href === pathname) && pathname.startsWith(`${item.href}/`));
        const recuo = item.child ? 'ml-4 text-xs' : '';

        // Módulo previsto: aparece no menu para dar visão do todo, mas não navega
        if (item.comingSoon) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              title="Módulo em desenvolvimento"
              className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600"
            >
              <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden />
              <span className="flex-1 truncate">{item.label}</span>
              <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                Em breve
              </span>
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`${recuo} flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? 'bg-brand/15 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
            }`}
          >
            <Icon className={`shrink-0 ${item.child ? 'h-3.5 w-3.5' : 'h-4.5 w-4.5'}`} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
