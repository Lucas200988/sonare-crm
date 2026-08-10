'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HardHat, MapPin } from 'lucide-react';
import { configurarObraAction } from '@/actions/diario';
import { inputCls, Field, FormError, SubmitButton } from '@/components/ui';

export type ObraConfig = {
  enabled: boolean;
  siteAddress: string | null;
  siteLat: number | null;
  siteLng: number | null;
  siteRadiusM: number | null;
};

/**
 * Liga o Diário de Obras no projeto.
 *
 * Nem todo projeto é obra — laudo e consultoria não têm canteiro. A decisão
 * fica no cartão, junto com a geofence que classifica os registros de campo.
 */
export function ObraPanel({ projectId, config, canWrite }: {
  projectId: string;
  config: ObraConfig;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const acao = configurarObraAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(
    async (prev: Awaited<ReturnType<typeof acao>>, fd: FormData) => {
      const r = await acao(prev, fd);
      if (!r.error) { setEditando(false); router.refresh(); }
      return r;
    },
    {},
  );

  if (!config.enabled && !canWrite) return null;

  return (
    <div className={`rounded-lg border p-3 ${
      config.enabled ? 'border-slate-200 bg-white' : 'border-dashed border-slate-300 bg-slate-50'
    }`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HardHat className={`h-4 w-4 ${config.enabled ? 'text-brand' : 'text-slate-400'}`} aria-hidden />
          <div>
            <p className="text-sm font-semibold text-slate-900">Diário de obras (RDO)</p>
            <p className="text-xs text-slate-500">
              {config.enabled
                ? config.siteLat !== null
                  ? `Habilitado · geofence de ${config.siteRadiusM ?? 500} m cadastrada`
                  : 'Habilitado · sem geofence (registros ficarão sem classificação de local)'
                : 'Este projeto não tem diário de obras.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {config.enabled ? (
            <Link
              href={`/obra/${projectId}`}
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
            >
              Abrir a obra
            </Link>
          ) : null}
          {canWrite ? (
            <button
              type="button"
              onClick={() => setEditando((v) => !v)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {config.enabled ? 'Configurar' : 'Habilitar diário'}
            </button>
          ) : null}
        </div>
      </div>

      {editando ? (
        <form action={formAction} className="mt-3 space-y-2 border-t border-slate-200 pt-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox" name="enabled" defaultChecked={config.enabled}
              className="rounded border-slate-300"
            />
            Este projeto é uma obra com diário (RDO)
          </label>

          <Field label="Endereço da obra" htmlFor="o-end">
            <input
              id="o-end" name="siteAddress" defaultValue={config.siteAddress ?? ''}
              placeholder="Av. …, nº — Cuiabá/MT" className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-3 gap-2">
            <Field label="Latitude" htmlFor="o-lat">
              <input
                id="o-lat" name="siteLat" defaultValue={config.siteLat ?? ''}
                inputMode="decimal" placeholder="-15.5989" className={inputCls}
              />
            </Field>
            <Field label="Longitude" htmlFor="o-lng">
              <input
                id="o-lng" name="siteLng" defaultValue={config.siteLng ?? ''}
                inputMode="decimal" placeholder="-56.0949" className={inputCls}
              />
            </Field>
            <Field label="Raio (m)" htmlFor="o-raio">
              <input
                id="o-raio" name="siteRadiusM" defaultValue={config.siteRadiusM ?? ''}
                inputMode="numeric" placeholder="500" className={inputCls}
              />
            </Field>
          </div>
          <p className="flex items-start gap-1 text-[11px] text-slate-500">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            As coordenadas classificam os registros de campo (dentro/fora da obra) —
            nunca bloqueiam. Copie do Google Maps: clique com o botão direito no local.
          </p>

          <FormError message={state.error} />
          <div className="flex gap-2">
            <SubmitButton pending={pending}>Salvar</SubmitButton>
            <button
              type="button" onClick={() => setEditando(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
