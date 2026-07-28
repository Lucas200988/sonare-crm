import { NextResponse } from 'next/server';
import { getSessionUser } from '@/server/auth/session';
import { readAttachment } from '@/server/storage';

export async function GET(_req: Request, ctx: RouteContext<'/api/arquivos/[id]'>) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { id } = await ctx.params;
  const result = await readAttachment(user.companyId, id);
  if (!result) return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });

  return new NextResponse(new Uint8Array(result.content), {
    headers: {
      'Content-Type': result.attachment.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(result.attachment.fileName)}"`,
      'Content-Length': String(result.attachment.sizeBytes),
      'Cache-Control': 'private, max-age=0',
    },
  });
}
