import 'server-only';
import { headers } from 'next/headers';
import { prisma } from '@/server/db';
import type { Prisma } from '@/generated/prisma/client';

type AuditInput = {
  companyId: string;
  userId?: string | null;
  action: string; // create | update | delete | login | login_failed | approve | sign | receive | ...
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  /** Cliente de transação: quando informado, o log participa da mesma transação da mutação. */
  tx?: Prisma.TransactionClient;
};

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  // Serializa Decimals/Dates de forma estável
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function auditLog(input: AuditInput): Promise<void> {
  let ip: string | null = null;
  try {
    const h = await headers();
    ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  } catch {
    // fora de contexto de request (seed, jobs) — sem IP
  }

  const db = input.tx ?? prisma;
  await db.auditLog.create({
    data: {
      companyId: input.companyId,
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: toJson(input.before),
      after: toJson(input.after),
      ip,
    },
  });
}
