'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3, Calculator, FileSignature, FolderKanban, KanbanSquare,
  LayoutDashboard, ReceiptText, Settings, UserCog, Users, Wallet, type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Users, KanbanSquare, Calculator, FileSignature,
  FolderKanban, Wallet, ReceiptText, BarChart3, UserCog, Settings,
};

export type SidebarItem = { label: string; href: string; icon: string; comingSoon?: boolean };

export function SidebarNav({ items }: { items: SidebarItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Menu principal" className="flex-1 space-y-0.5 px-3 py-4">
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

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
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? 'bg-brand/15 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
            }`}
          >
            <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
