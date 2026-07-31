import { NextResponse } from 'next/server';
import { prisma } from '@/server/db';
import { executarRotina } from '@/server/services/followup';

/**
 * Rotina diária de follow-up, chamada pelo agendador da Vercel.
 *
 * Não há sessão aqui: a proteção é o CRON_SECRET, que a Vercel envia no
 * cabeçalho Authorization. Sem o segredo configurado a rota se recusa a
 * rodar — melhor não executar do que executar aberta para a internet.
 *
 * A rotina age em nome do responsável comercial da empresa, para que os
 * e-mails saiam com o Reply-To de uma pessoa de verdade.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET não configurado.' },
      { status: 503 },
    );
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const empresas = await prisma.company.findMany({ select: { id: true } });
  const resultados: Array<Record<string, unknown>> = [];

  for (const empresa of empresas) {
    // quem "assina" os envios: um administrador ativo da empresa
    const responsavel = await prisma.user.findFirst({
      where: {
        companyId: empresa.id, active: true, deletedAt: null,
        roles: { some: { role: { code: 'ADMIN' } } },
      },
      select: { id: true, name: true, email: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!responsavel) {
      resultados.push({ empresa: empresa.id, pulou: 'sem administrador ativo' });
      continue;
    }

    const r = await executarRotina({
      id: responsavel.id,
      companyId: empresa.id,
      name: responsavel.name,
      email: responsavel.email,
      roles: ['ADMIN'],
      permissions: new Set(['proposal:write']),
    });
    resultados.push({ empresa: empresa.id, ...r });
  }

  return NextResponse.json({ executadoEm: new Date().toISOString(), resultados });
}
