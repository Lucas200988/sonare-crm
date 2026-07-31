import 'server-only';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { parseOfx } from '@/lib/ofx';
import type { SessionUser } from '@/server/auth/session';

/**
 * Conciliação bancária por importação de extrato OFX.
 *
 * O objetivo é responder "o caixa do sistema bate com o banco?". Cada linha
 * do extrato entra uma única vez (o FITID do banco deduplica) e o sistema
 * tenta casá-la sozinho com uma baixa de recebimento ou uma conta paga; o
 * que sobra fica pendente para decisão humana — casar manualmente, criar o
 * lançamento que faltava ou ignorar (transferência interna, aplicação).
 */

/** Janela de tolerância entre a data do extrato e a data lançada no sistema. */
const TOLERANCIA_DIAS = 4;

function janela(centro: Date): { gte: Date; lte: Date } {
  const gte = new Date(centro);
  gte.setDate(gte.getDate() - TOLERANCIA_DIAS);
  const lte = new Date(centro);
  lte.setDate(lte.getDate() + TOLERANCIA_DIAS);
  return { gte, lte };
}

/**
 * Tenta casar uma transação pendente com o lançamento correspondente.
 * Só casa quando existe EXATAMENTE um candidato de mesmo valor na janela de
 * datas: com dois candidatos iguais, escolher um seria chute — fica pendente
 * para o olho humano decidir.
 */
async function casarAutomaticamente(
  user: SessionUser,
  tx: { id: string; amount: number; postedAt: Date },
): Promise<boolean> {
  if (tx.amount > 0) {
    const candidatos = await prisma.receipt.findMany({
      where: {
        companyId: user.companyId,
        reversedAt: null,
        amount: tx.amount.toFixed(2),
        receivedAt: janela(tx.postedAt),
        bankTransactions: { none: {} }, // ainda sem linha do extrato apontando
      },
      select: { id: true },
      take: 2,
    });
    if (candidatos.length !== 1) return false;
    await prisma.bankTransaction.update({
      where: { id: tx.id },
      data: {
        status: 'CONCILIADA', receiptId: candidatos[0].id,
        reconciledAt: new Date(), reconciledById: user.id,
      },
    });
    return true;
  }

  const candidatos = await prisma.payable.findMany({
    where: {
      companyId: user.companyId,
      deletedAt: null,
      status: 'PAGO',
      paidAmount: Math.abs(tx.amount).toFixed(2),
      paidAt: janela(tx.postedAt),
      bankTransactions: { none: {} },
    },
    select: { id: true },
    take: 2,
  });
  if (candidatos.length !== 1) return false;
  await prisma.bankTransaction.update({
    where: { id: tx.id },
    data: {
      status: 'CONCILIADA', payableId: candidatos[0].id,
      reconciledAt: new Date(), reconciledById: user.id,
    },
  });
  return true;
}

/** Importa o OFX: deduplica pelo FITID, grava as novas e tenta casar cada uma. */
export async function importOfx(user: SessionUser, conteudo: string) {
  const transacoes = parseOfx(conteudo);
  if (transacoes.length === 0) {
    return { error: 'Nenhuma transação encontrada. Confira se o arquivo é um OFX exportado do banco.' };
  }

  const existentes = await prisma.bankTransaction.findMany({
    where: { companyId: user.companyId, fitId: { in: transacoes.map((t) => t.fitId) } },
    select: { fitId: true },
  });
  const jaImportadas = new Set(existentes.map((e) => e.fitId));
  const novas = transacoes.filter((t) => !jaImportadas.has(t.fitId));

  let conciliadas = 0;
  for (const t of novas) {
    const criada = await prisma.bankTransaction.create({
      data: {
        companyId: user.companyId,
        fitId: t.fitId,
        postedAt: t.postedAt,
        amount: t.amount.toFixed(2),
        memo: t.memo,
        importedById: user.id,
      },
    });
    if (await casarAutomaticamente(user, { id: criada.id, amount: t.amount, postedAt: t.postedAt })) {
      conciliadas += 1;
    }
  }

  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'ofx_import',
    entityType: 'bank_transaction', entityId: null,
    after: { total: transacoes.length, novas: novas.length, conciliadas },
  });

  return {
    ok: true as const,
    total: transacoes.length,
    novas: novas.length,
    repetidas: transacoes.length - novas.length,
    conciliadas,
    pendentes: novas.length - conciliadas,
  };
}

/** Painel: pendências primeiro, e o resumo de até onde o extrato bate. */
export async function getReconciliation(user: SessionUser) {
  const [pendentes, resumo, ultimaConciliada] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: { companyId: user.companyId, status: 'PENDENTE' },
      orderBy: { postedAt: 'asc' },
      take: 100,
    }),
    prisma.bankTransaction.groupBy({
      by: ['status'],
      where: { companyId: user.companyId },
      _count: true,
    }),
    prisma.bankTransaction.findFirst({
      where: { companyId: user.companyId, status: 'CONCILIADA' },
      orderBy: { postedAt: 'desc' },
      select: { postedAt: true },
    }),
  ]);

  const conta = (s: string) => resumo.find((r) => r.status === s)?._count ?? 0;
  return {
    pendentes,
    totais: {
      pendentes: conta('PENDENTE'),
      conciliadas: conta('CONCILIADA'),
      ignoradas: conta('IGNORADA'),
    },
    conciliadoAte: ultimaConciliada?.postedAt ?? null,
  };
}

/** Candidatos para o casamento manual: mesmo sinal, valor próximo, sem par. */
export async function getMatchCandidates(user: SessionUser, transactionId: string) {
  const tx = await prisma.bankTransaction.findFirst({
    where: { id: transactionId, companyId: user.companyId, status: 'PENDENTE' },
  });
  if (!tx) return { error: 'Transação não encontrada ou já resolvida.' };

  const valor = Number(tx.amount);
  if (valor > 0) {
    const receitas = await prisma.receipt.findMany({
      where: { companyId: user.companyId, reversedAt: null, bankTransactions: { none: {} } },
      include: { receivable: { select: { code: true, description: true, client: { select: { legalName: true, tradeName: true } } } } },
      orderBy: { receivedAt: 'desc' },
      take: 30,
    });
    return {
      tipo: 'entrada' as const,
      candidatos: receitas.map((r) => ({
        id: r.id,
        rotulo: `${r.receivable.client.tradeName ?? r.receivable.client.legalName} — ${r.receivable.description}`,
        valor: r.amount.toString(),
        data: r.receivedAt,
        // mesmo valor primeiro, para o certo estar no topo
        exato: Math.abs(Number(r.amount) - valor) < 0.01,
      })).sort((a, b) => Number(b.exato) - Number(a.exato)),
    };
  }

  const despesas = await prisma.payable.findMany({
    where: { companyId: user.companyId, deletedAt: null, status: 'PAGO', bankTransactions: { none: {} } },
    orderBy: { paidAt: 'desc' },
    take: 30,
  });
  return {
    tipo: 'saida' as const,
    candidatos: despesas.map((p) => ({
      id: p.id,
      rotulo: `${p.supplier ?? p.category ?? 'Despesa'} — ${p.description}`,
      valor: (p.paidAmount ?? p.amount).toString(),
      data: p.paidAt ?? p.dueDate,
      exato: Math.abs(Number(p.paidAmount ?? p.amount) - Math.abs(valor)) < 0.01,
    })).sort((a, b) => Number(b.exato) - Number(a.exato)),
  };
}

/** Casamento manual, escolhido pelo usuário na tela. */
export async function matchTransaction(
  user: SessionUser, transactionId: string, alvo: { receiptId?: string; payableId?: string },
) {
  const tx = await prisma.bankTransaction.findFirst({
    where: { id: transactionId, companyId: user.companyId, status: 'PENDENTE' },
  });
  if (!tx) return { error: 'Transação não encontrada ou já resolvida.' };
  if (!alvo.receiptId && !alvo.payableId) return { error: 'Escolha o lançamento correspondente.' };

  await prisma.bankTransaction.update({
    where: { id: transactionId },
    data: {
      status: 'CONCILIADA',
      receiptId: alvo.receiptId ?? null,
      payableId: alvo.payableId ?? null,
      reconciledAt: new Date(),
      reconciledById: user.id,
    },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'reconcile',
    entityType: 'bank_transaction', entityId: transactionId, after: alvo,
  });
  return { ok: true as const };
}

/** Transferência interna, rendimento de aplicação: não vira lançamento. */
export async function ignoreTransaction(user: SessionUser, transactionId: string) {
  const tx = await prisma.bankTransaction.findFirst({
    where: { id: transactionId, companyId: user.companyId, status: 'PENDENTE' },
  });
  if (!tx) return { error: 'Transação não encontrada ou já resolvida.' };

  await prisma.bankTransaction.update({
    where: { id: transactionId },
    data: { status: 'IGNORADA', reconciledAt: new Date(), reconciledById: user.id },
  });
  return { ok: true as const };
}

/** Desfaz uma conciliação ou um "ignorar" feitos por engano. */
export async function unmatchTransaction(user: SessionUser, transactionId: string) {
  const tx = await prisma.bankTransaction.findFirst({
    where: { id: transactionId, companyId: user.companyId, status: { not: 'PENDENTE' } },
  });
  if (!tx) return { error: 'Transação não encontrada.' };

  await prisma.bankTransaction.update({
    where: { id: transactionId },
    data: { status: 'PENDENTE', receiptId: null, payableId: null, reconciledAt: null, reconciledById: null },
  });
  return { ok: true as const };
}
