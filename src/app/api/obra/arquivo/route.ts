import { NextResponse } from 'next/server';
import { getSessionUser } from '@/server/auth/session';
import { salvarArquivo } from '@/server/services/diario-arquivos';

/**
 * Envio de vídeo/anexo pela rota — o caminho do driver local (desenvolvimento).
 *
 * Em produção o arquivo sobe direto ao bucket por URL assinada: vídeo de
 * canteiro não cabe no limite de 4,5 MB por requisição da Vercel.
 */
export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || !user.permissions.has('diary:write')) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const form = await req.formData();
  const arquivo = form.get('file');
  const diaryId = String(form.get('diaryId') ?? '');
  const kind = String(form.get('kind') ?? '');
  if (!(arquivo instanceof File) || !diaryId || (kind !== 'VIDEO' && kind !== 'ANEXO')) {
    return NextResponse.json({ error: 'Envio incompleto.' }, { status: 400 });
  }

  const conteudo = Buffer.from(await arquivo.arrayBuffer());
  const r = await salvarArquivo(user, diaryId, conteudo, {
    fileName: arquivo.name || (kind === 'VIDEO' ? 'video.mp4' : 'anexo'),
    mimeType: arquivo.type || 'application/octet-stream',
    kind,
    description: String(form.get('description') ?? '') || null,
  });
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ fileId: r.fileId });
}
