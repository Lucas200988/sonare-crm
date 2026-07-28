import { NextResponse } from 'next/server';
import { getSessionUser } from '@/server/auth/session';
import { previewProposal } from '@/server/services/proposals';

/**
 * Pré-visualização da proposta: devolve o PDF sem criar registro,
 * sem congelar a versão e sem consumir numeração.
 */
export async function GET(_req: Request, ctx: RouteContext<'/api/orcamentos/[id]/previa'>) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!user.permissions.has('budget:read')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const { id } = await ctx.params;
  const result = await previewProposal(user, id);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return new NextResponse(new Uint8Array(result.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${result.fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
