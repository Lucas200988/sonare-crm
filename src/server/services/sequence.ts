import 'server-only';
import { prisma } from '@/server/db';
import type { Prisma } from '@/generated/prisma/client';

/**
 * Gera o próximo código sequencial por tipo/ano de forma transacional:
 * OPP-2026-001, ORC-2026-001, PROP-2026-001, CTR-2026-001, PRJ-2026-001, PARC-2026-001...
 * Formato editável futuramente via SystemSetting `numbering.format`.
 */
export async function nextCode(
  companyId: string,
  type: 'OPP' | 'ORC' | 'PROP' | 'CTR' | 'PRJ' | 'PARC',
  tx?: Prisma.TransactionClient,
): Promise<string> {
  const year = new Date().getFullYear();

  async function run(db: Prisma.TransactionClient): Promise<string> {
    const seq = await db.documentSequence.upsert({
      where: { companyId_type_year: { companyId, type, year } },
      create: { companyId, type, year, nextValue: 2 },
      update: { nextValue: { increment: 1 } },
    });
    // upsert-create devolve nextValue já incrementado p/ próxima chamada; o número usado é:
    const number = seq.nextValue - 1;
    return `${type}-${year}-${String(number).padStart(3, '0')}`;
  }

  if (tx) return run(tx);
  return prisma.$transaction((t) => run(t));
}
