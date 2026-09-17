import { NextResponse } from 'next/server';
import { prisma } from '@/server/db';
import { enviarBriefings, type PeriodoBriefing } from '@/server/services/agente-proativo';

/**
 * Ciclos proativos do Jarvis (Morning e Closing Manager), pela Vercel.
 *
 * Mesma proteção do cron de follow-up: CRON_SECRET no Authorization.
 * O período vem na query (?periodo=manha|fechamento) — dois agendamentos
 * no vercel.json, uma rota só.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET não configurado.' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const periodoParam = new URL(request.url).searchParams.get('periodo');
  const periodo: PeriodoBriefing = periodoParam === 'fechamento' ? 'fechamento' : 'manha';

  const empresas = await prisma.company.findMany({ select: { id: true } });
  const resultados: Array<Record<string, unknown>> = [];
  for (const empresa of empresas) {
    const r = await enviarBriefings(empresa.id, periodo).catch((e) => ({
      erro: e instanceof Error ? e.message.slice(0, 200) : 'falha',
    }));
    resultados.push({ empresa: empresa.id, ...r });
  }

  return NextResponse.json({ periodo, executadoEm: new Date().toISOString(), resultados });
}
