import 'server-only';
import { prisma } from '@/server/db';
import { custoEstimadoUsd } from '@/lib/ia-custo';
import type { SessionUser } from '@/server/auth/session';

/**
 * Consumo de IA da empresa — restrito à permissão ai:metrics, que é
 * concedida por usuário (hoje, só o Lucas) e não pertence a papel nenhum.
 */
export async function resumoDeConsumoIa(user: SessionUser) {
  if (!user.permissions.has('ai:metrics')) {
    return { error: 'Sem permissão para ver o consumo de IA.' };
  }

  const agora = new Date();
  const inicioDoMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const trintaDias = new Date(agora.getTime() - 30 * 86_400_000);

  const [doMes, chamadasRecentes, usuarios] = await Promise.all([
    prisma.aiCall.findMany({
      where: { companyId: user.companyId, createdAt: { gte: inicioDoMes } },
      select: {
        userId: true, useCase: true, model: true, status: true,
        tokensInput: true, tokensOutput: true, latencyMs: true,
      },
    }),
    prisma.aiCall.findMany({
      where: { companyId: user.companyId, createdAt: { gte: trintaDias } },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: {
        createdAt: true, useCase: true, model: true, status: true,
        tokensInput: true, tokensOutput: true, latencyMs: true, userId: true,
      },
    }),
    prisma.user.findMany({
      where: { companyId: user.companyId },
      select: { id: true, name: true },
    }),
  ]);

  const nome = (id: string | null) => usuarios.find((u) => u.id === id)?.name ?? '—';
  const custo = (m: string, ti: number, to: number) => custoEstimadoUsd(m, ti, to);

  type Grupo = { chamadas: number; tokens: number; custoUsd: number | null };
  const agrupar = (chave: (c: (typeof doMes)[number]) => string) => {
    const grupos = new Map<string, Grupo>();
    for (const c of doMes) {
      const k = chave(c);
      const g = grupos.get(k) ?? { chamadas: 0, tokens: 0, custoUsd: 0 };
      g.chamadas += 1;
      g.tokens += c.tokensInput + c.tokensOutput;
      const cu = custo(c.model, c.tokensInput, c.tokensOutput);
      // um único modelo sem preço torna o total honestamente "sem estimativa"
      g.custoUsd = g.custoUsd === null || cu === null ? null : g.custoUsd + cu;
      grupos.set(k, g);
    }
    return [...grupos.entries()]
      .map(([k, g]) => ({ chave: k, ...g }))
      .sort((a, b) => b.tokens - a.tokens);
  };

  const totalTokens = doMes.reduce((a, c) => a + c.tokensInput + c.tokensOutput, 0);
  const custosDoMes = doMes.map((c) => custo(c.model, c.tokensInput, c.tokensOutput));
  const custoTotal = custosDoMes.some((c) => c === null)
    ? null
    : custosDoMes.reduce((a: number, c) => a + (c ?? 0), 0);

  return {
    mes: {
      chamadas: doMes.length,
      erros: doMes.filter((c) => c.status !== 'ok').length,
      tokens: totalTokens,
      custoUsd: custoTotal,
      porCasoDeUso: agrupar((c) => c.useCase),
      porUsuario: agrupar((c) => nome(c.userId)),
      porModelo: agrupar((c) => c.model),
    },
    ultimasChamadas: chamadasRecentes.map((c) => ({
      em: c.createdAt.toISOString(),
      usuario: nome(c.userId),
      casoDeUso: c.useCase,
      modelo: c.model,
      status: c.status,
      tokens: c.tokensInput + c.tokensOutput,
      latenciaMs: c.latencyMs,
      custoUsd: custo(c.model, c.tokensInput, c.tokensOutput),
    })),
  };
}
