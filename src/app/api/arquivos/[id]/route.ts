import { NextResponse } from 'next/server';
import { getSessionUser } from '@/server/auth/session';
import { readAttachment } from '@/server/storage';
import { repairProposalPdf } from '@/server/services/proposals';

export async function GET(_req: Request, ctx: RouteContext<'/api/arquivos/[id]'>) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { id } = await ctx.params;
  let result = await readAttachment(user.companyId, id);

  // Arquivo ausente no storage: se for proposta, regenera a partir da versão
  // congelada em vez de devolver 404 — o conteúdo é o mesmo.
  if (!result) {
    const novo = await repairProposalPdf(user, id);
    if (novo) result = await readAttachment(user.companyId, novo);
  }
  if (!result) {
    return NextResponse.json(
      { error: 'Arquivo não encontrado no armazenamento. Reemita o documento.' },
      { status: 404 },
    );
  }

  return new NextResponse(new Uint8Array(result.content), {
    headers: {
      'Content-Type': result.attachment.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(result.attachment.fileName)}"`,
      'Content-Length': String(result.attachment.sizeBytes),
      'Cache-Control': 'private, max-age=0',
    },
  });
}
