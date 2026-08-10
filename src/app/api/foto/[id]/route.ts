import { NextResponse } from 'next/server';
import { getSessionUser } from '@/server/auth/session';
import { getFotoVisivel } from '@/server/services/diario-fotos';
import { readAttachment } from '@/server/storage';

/**
 * Serve as imagens das fotos de obra, com autenticação e recorte de acesso.
 *
 * O bucket é privado de propósito — evidência técnica não fica em URL
 * pública. `?v=thumb|view|original` escolhe a versão; a original só sai
 * para quem pedir explicitamente (auditoria, perícia).
 */
export async function GET(req: Request, ctx: RouteContext<'/api/foto/[id]'>) {
  const user = await getSessionUser();
  if (!user || !user.permissions.has('diary:read')) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const foto = await getFotoVisivel(user, id);
  if (!foto) return NextResponse.json({ error: 'Não encontrada.' }, { status: 404 });

  const versao = new URL(req.url).searchParams.get('v') ?? 'view';
  const attachmentId = versao === 'thumb'
    ? foto.thumbAttachmentId
    : versao === 'original'
      ? foto.originalAttachmentId
      : foto.viewAttachmentId ?? foto.originalAttachmentId;
  if (!attachmentId) return NextResponse.json({ error: 'Versão indisponível.' }, { status: 404 });

  const arquivo = await readAttachment(user.companyId, attachmentId);
  if (!arquivo) return NextResponse.json({ error: 'Arquivo indisponível.' }, { status: 404 });

  return new NextResponse(new Uint8Array(arquivo.content), {
    headers: {
      'Content-Type': arquivo.attachment.mimeType,
      // imutável: a foto nunca muda — versões novas têm outro id
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Disposition': `inline; filename="${arquivo.attachment.fileName}"`,
    },
  });
}
