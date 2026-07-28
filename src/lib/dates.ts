import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';

export const DEFAULT_TZ = process.env.APP_TIMEZONE ?? 'America/Cuiaba';

/** dd/mm/aaaa no fuso da empresa. */
export function formatDateBR(date: Date | string | null | undefined, tz: string = DEFAULT_TZ): string {
  if (!date) return '—';
  return formatInTimeZone(new Date(date), tz, 'dd/MM/yyyy');
}

/** dd/mm/aaaa HH:mm no fuso da empresa. */
export function formatDateTimeBR(date: Date | string | null | undefined, tz: string = DEFAULT_TZ): string {
  if (!date) return '—';
  return formatInTimeZone(new Date(date), tz, 'dd/MM/yyyy HH:mm');
}

/** Data por extenso: 27 de julho de 2026. */
export function formatDateLongBR(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return format(new Date(date), "d 'de' MMMM 'de' yyyy", { locale: ptBR });
}

/** Interpreta "dd/mm/aaaa" ou ISO como Date (meia-noite local). Retorna null se inválida. */
export function parseDateBR(value: string | null | undefined): Date | null {
  if (!value) return null;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  const d = br ? new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1])) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
