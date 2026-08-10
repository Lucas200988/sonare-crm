import { NextResponse } from 'next/server';
import { getSessionUser } from '@/server/auth/session';
import { salvarFoto, type MetaFoto } from '@/server/services/diario-fotos';

/**
 * Envio de foto pela rota — o caminho do driver local (desenvolvimento).
 *
 * Em produção o original sobe direto ao bucket por URL assinada e esta rota
 * não é usada: o limite de 4,5 MB por requisição da Vercel não comporta
 * foto de celular.
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
  if (!(arquivo instanceof File) || !diaryId) {
    return NextResponse.json({ error: 'Envio incompleto.' }, { status: 400 });
  }
  if (!arquivo.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Envie uma imagem.' }, { status: 400 });
  }

  const num = (k: string): number | null => {
    const v = String(form.get(k) ?? '').trim();
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const capturadaEm = num('capturedAt');
  const origem = String(form.get('source') ?? 'APP_CAMERA');

  const meta: MetaFoto = {
    fileName: arquivo.name || 'foto.jpg',
    mimeType: arquivo.type,
    capturedAtDevice: capturadaEm ? new Date(capturadaEm) : null,
    lat: num('lat'),
    lng: num('lng'),
    accuracy: num('accuracy'),
    source: origem === 'GALLERY_IMPORT' ? 'GALLERY_IMPORT' : 'APP_CAMERA',
    deviceInfo: req.headers.get('user-agent')?.slice(0, 300) ?? null,
  };

  const conteudo = Buffer.from(await arquivo.arrayBuffer());
  const r = await salvarFoto(user, diaryId, conteudo, meta);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ photoId: r.photoId, codigo: r.codigo, seq: r.seq });
}
