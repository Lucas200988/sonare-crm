import { NextResponse } from 'next/server';
import { getSessionUser } from '@/server/auth/session';
import { anexarDocumento } from '@/server/services/agente-documentos';
import { anexoAceito, TAMANHO_MAXIMO_ANEXO } from '@/lib/agente-anexos';

/**
 * Entrega de arquivo ao Jarvis. Rota (e não Server Action) porque ação tem
 * teto de 1 MB de corpo; aqui vale o da plataforma. O arquivo é lido e
 * descartado — só o texto fica, preso à conversa da própria pessoa.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  let dados: FormData;
  try {
    dados = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Envio inválido ou arquivo grande demais (máx. 4 MB).' }, { status: 400 });
  }

  const arquivo = dados.get('arquivo');
  const threadId = dados.get('threadId');
  if (!(arquivo instanceof File)) return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
  if (arquivo.size > TAMANHO_MAXIMO_ANEXO) {
    return NextResponse.json({ error: 'Arquivo acima de 4 MB. Envie só a parte que interessa.' }, { status: 413 });
  }
  if (!anexoAceito(arquivo.type, arquivo.name)) {
    return NextResponse.json({ error: 'Formato não suportado. Envie PDF, Word (.docx), texto, CSV ou imagem (JPG/PNG).' }, { status: 415 });
  }

  const r = await anexarDocumento(user, {
    threadId: typeof threadId === 'string' && threadId ? threadId : null,
    arquivo,
    canal: 'CRM',
  });
  if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: 422 });
  return NextResponse.json(r);
}
