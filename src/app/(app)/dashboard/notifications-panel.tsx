'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, CheckCheck, Inbox } from 'lucide-react';
import {
  markAllNotificationsReadAction, markNotificationReadAction,
} from '@/actions/notifications';

export type AvisoItem = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string; // ISO
};

/** "há 5 min", "há 3 h", "ontem", "12/08" — o suficiente para situar. */
function tempoRelativo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ontem';
  if (d < 7) return `há ${d} dias`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/**
 * Avisos pessoais no topo do dashboard — o que chegou para você desde a
 * última visita: tarefas atribuídas, entregas da equipe, projetos novos.
 *
 * Abrir o aviso já o marca como lido: o clique é a prova de que foi visto,
 * sem exigir um segundo gesto.
 */
export function NotificationsPanel({ avisos }: { avisos: AvisoItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (avisos.length === 0) return null;

  function lerETirar(id: string) {
    startTransition(async () => {
      await markNotificationReadAction(id);
      router.refresh();
    });
  }

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Inbox className="h-4 w-4 text-brand" aria-hidden />
          Avisos para você
          <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
            {avisos.length}
          </span>
        </h2>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => {
            await markAllNotificationsReadAction();
            router.refresh();
          })}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 disabled:opacity-50"
        >
          <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Marcar todos como lidos
        </button>
      </div>

      <ul className="space-y-2">
        {avisos.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5"
          >
            {a.link ? (
              <Link
                href={a.link}
                onClick={() => lerETirar(a.id)}
                className="min-w-0 flex-1"
              >
                <span className="block truncate text-sm font-medium text-slate-900">{a.title}</span>
                {a.body ? <span className="block truncate text-xs text-slate-600">{a.body}</span> : null}
                <span className="text-[11px] text-slate-400">{tempoRelativo(a.createdAt)}</span>
              </Link>
            ) : (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{a.title}</span>
                {a.body ? <span className="block truncate text-xs text-slate-600">{a.body}</span> : null}
                <span className="text-[11px] text-slate-400">{tempoRelativo(a.createdAt)}</span>
              </span>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => lerETirar(a.id)}
              title="Marcar como lido"
              aria-label={`Marcar "${a.title}" como lido`}
              className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-50"
            >
              <Check className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
