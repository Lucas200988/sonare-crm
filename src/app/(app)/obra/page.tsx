import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, HardHat } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { listarObras } from '@/server/services/diario';
import { PageHeader, EmptyState, Badge } from '@/components/ui';

export const metadata: Metadata = { title: 'Obras — SONARE CRM' };

const STATUS_DIARIO: Record<string, { label: string; color: string }> = {
  ABERTO: { label: 'Diário em andamento', color: 'blue' },
  FINALIZADO: { label: 'Diário finalizado', color: 'green' },
  APROVADO: { label: 'Diário aprovado', color: 'green' },
};

/**
 * Lista de obras — a porta de entrada do RDO no celular.
 *
 * Cada cartão leva direto para a home da obra. Quem tem uma obra só cai
 * praticamente direto no dia; a lista existe para quem roda várias.
 */
export default async function ObrasPage() {
  const user = await requirePermissionPage('diary:read');
  const obras = await listarObras(user);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Obras"
        subtitle={`${obras.length} obra(s) com diário habilitado`}
      />

      {obras.length === 0 ? (
        <EmptyState
          title="Nenhuma obra com diário"
          description="Habilite o Diário de Obras dentro do cartão do projeto (Visão geral → Diário de obras)."
        />
      ) : (
        <ul className="space-y-3">
          {obras.map((o) => {
            const diario = o.diarioDeHoje;
            const badge = diario ? STATUS_DIARIO[diario.status] : null;
            return (
              <li key={o.id}>
                <Link
                  href={`/obra/${o.id}`}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand/50"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10">
                    <HardHat className="h-5 w-5 text-brand" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">
                      {o.name}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {o.code} · {o.cliente}
                    </span>
                    <span className="mt-1 block">
                      {badge ? (
                        <Badge color={badge.color}>{badge.label}</Badge>
                      ) : (
                        <Badge color="amber">Sem diário hoje</Badge>
                      )}
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
