import { NextResponse } from 'next/server';
import { getSessionUser } from '@/server/auth/session';
import { verificarLote } from '@/server/spell/verificador';

/**
 * Verificação ortográfica usada pelo editor de texto.
 *
 * Recebe { palavras: string[] } e devolve { erradas: { palavra: sugestões } }.
 * Só as palavras erradas voltam — resposta vazia significa texto limpo.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
  }

  const palavras = (corpo as { palavras?: unknown })?.palavras;
  if (!Array.isArray(palavras) || palavras.some((p) => typeof p !== 'string')) {
    return NextResponse.json({ error: 'Envie { palavras: string[] }.' }, { status: 400 });
  }

  return NextResponse.json({ erradas: verificarLote(palavras as string[]) });
}
