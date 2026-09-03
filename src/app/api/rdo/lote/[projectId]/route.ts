import { NextResponse } from 'next/server';
import { getSessionUser } from '@/server/auth/session';
import { gerarPdfDoPeriodo } from '@/server/services/diario-relatorio';

// um mês de RDOs com fotos leva tempo para montar
export const maxDuration = 60;

/** PDF único com os RDOs do período — ?de=YYYY-MM-DD&ate=YYYY-MM-DD. */
export async function GET(req: Request, ctx: RouteContext<'/api/rdo/lote/[projectId]'>) {
  const user = await getSessionUser();
  if (!user || !user.permissions.has('diary:read')) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { projectId } = await ctx.params;
  const url = new URL(req.url);
  const de = url.searchParams.get('de') ?? '';
  const ate = url.searchParams.get('ate') ?? '';

  const r = await gerarPdfDoPeriodo(user, projectId, de, ate);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });

  return new NextResponse(new Uint8Array(r.content), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(r.fileName)}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
