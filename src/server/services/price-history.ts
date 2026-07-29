import 'server-only';
import { prisma } from '@/server/db';
import type { SessionUser } from '@/server/auth/session';
import { mediana } from '@/lib/estatistica';

/**
 * Preço praticado nos orçamentos anteriores do mesmo serviço.
 *
 * O preço de tabela envelhece e nem sempre reflete o que foi realmente
 * cobrado. Aqui olhamos o histórico para sugerir um valor com base na
 * prática, deixando claro de quantos orçamentos ele saiu.
 */

export type SugestaoPreco = {
  serviceCatalogId: string;
  /** Mediana dos preços praticados — resiste a um valor fora da curva. */
  sugerido: string;
  ultimo: string;
  menor: string;
  maior: string;
  /** Quantos orçamentos entraram na conta. */
  amostras: number;
};

/**
 * Histórico de preços por serviço do catálogo.
 *
 * Considera apenas versões congeladas — as que viraram proposta de verdade.
 * Rascunho em edição não é preço praticado.
 */
export async function getPriceSuggestions(user: SessionUser): Promise<SugestaoPreco[]> {
  const itens = await prisma.budgetItem.findMany({
    where: {
      serviceCatalogId: { not: null },
      unitPrice: { gt: 0 },
      budgetVersion: {
        immutable: true,
        budget: { companyId: user.companyId, deletedAt: null },
      },
    },
    select: {
      serviceCatalogId: true,
      unitPrice: true,
      budgetVersion: { select: { createdAt: true } },
    },
    orderBy: { budgetVersion: { createdAt: 'desc' } },
    // o histórico recente é o que importa; evita varrer a base inteira
    take: 500,
  });

  const porServico = new Map<string, number[]>();
  for (const item of itens) {
    const id = item.serviceCatalogId!;
    if (!porServico.has(id)) porServico.set(id, []);
    porServico.get(id)!.push(Number(item.unitPrice));
  }

  return [...porServico.entries()].map(([serviceCatalogId, precos]) => ({
    serviceCatalogId,
    // a lista veio em ordem decrescente de data: o primeiro é o mais recente
    ultimo: precos[0].toFixed(2),
    sugerido: mediana(precos).toFixed(2),
    menor: Math.min(...precos).toFixed(2),
    maior: Math.max(...precos).toFixed(2),
    amostras: precos.length,
  }));
}
