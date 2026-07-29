import 'server-only';
import { prisma } from '@/server/db';
import type { Prisma } from '@/generated/prisma/client';

export type DocumentType = 'OPP' | 'ORC' | 'PROP' | 'CTR' | 'PRJ' | 'PARC' | 'EQP';

/** Onde cada tipo de código é gravado — usado para detectar número já ocupado. */
const TABELA: Record<DocumentType, 'opportunity' | 'budget' | 'proposal' | 'contract' | 'project' | 'receivable' | 'equipment'> = {
  OPP: 'opportunity',
  ORC: 'budget',
  PROP: 'proposal',
  CTR: 'contract',
  PRJ: 'project',
  PARC: 'receivable',
  EQP: 'equipment',
};

function formatar(type: DocumentType, year: number, numero: number): string {
  return `${type}-${year}-${String(numero).padStart(3, '0')}`;
}

/**
 * Gera o próximo código sequencial por tipo/ano de forma transacional:
 * OPP-2026-001, ORC-2026-001, PROP-2026-001, CTR-2026-001, PRJ-2026-001…
 *
 * O contador pode ficar atrás dos códigos já gravados — por restauração de
 * backup ou limpeza de registros, já que documento excluído continua ocupando
 * o número. Por isso, se o código sair repetido, avança até achar um livre em
 * vez de estourar a criação inteira.
 */
export async function nextCode(
  companyId: string,
  type: DocumentType,
  tx?: Prisma.TransactionClient,
): Promise<string> {
  const year = new Date().getFullYear();

  async function run(db: Prisma.TransactionClient): Promise<string> {
    const seq = await db.documentSequence.upsert({
      where: { companyId_type_year: { companyId, type, year } },
      create: { companyId, type, year, nextValue: 2 },
      update: { nextValue: { increment: 1 } },
    });
    // upsert-create devolve nextValue já incrementado p/ próxima chamada
    let numero = seq.nextValue - 1;
    let code = formatar(type, year, numero);

    // Confere se o código já existe; no limite tenta algumas vezes
    const modelo = db[TABELA[type]] as unknown as {
      findFirst(args: unknown): Promise<{ id: string } | null>;
    };

    for (let tentativa = 0; tentativa < 50; tentativa++) {
      const existente = await modelo.findFirst({
        where: { companyId, code },
        select: { id: true },
      });
      if (!existente) break;
      numero += 1;
      code = formatar(type, year, numero);
    }

    // Deixa o contador à frente do número efetivamente usado
    if (numero !== seq.nextValue - 1) {
      await db.documentSequence.update({
        where: { id: seq.id },
        data: { nextValue: numero + 1 },
      });
    }

    return code;
  }

  if (tx) return run(tx);
  return prisma.$transaction((t) => run(t));
}
