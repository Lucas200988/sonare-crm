import { NextResponse } from 'next/server';
import { getSessionUser } from '@/server/auth/session';
import { gerarPdfDoRdo } from '@/server/services/diario-relatorio';

// fotos embutidas + renderização podem passar do limite padrão
export const maxDuration = 60;

/** PDF do RDO — aprovado sai do acervo congelado; antes disso, ao vivo. */
export async function GET(req: Request, ctx: RouteContext<'/api/rdo/[id]/pdf'>) {
  const user = await getSessionUser();
  if (!user || !user.permissions.has('diary:read')) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const pdf = await gerarPdfDoRdo(user, id);
  if (!pdf) return NextResponse.json({ error: 'Relatório não encontrado.' }, { status: 404 });

  const baixar = new URL(req.url).searchParams.get('baixar') === '1';
  return new NextResponse(new Uint8Array(pdf.content), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${baixar ? 'attachment' : 'inline'}; filename="${encodeURIComponent(pdf.fileName)}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
