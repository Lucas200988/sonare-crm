/**
 * Zera os dados operacionais para começar a usar o sistema em produção.
 *
 * APAGA: propostas, contratos (versões, assinaturas, aditivos), orçamentos,
 * oportunidades, atividades, clientes (contatos e unidades), anexos e os PDFs
 * em disco, além da trilha de auditoria dessas entidades e das numerações.
 *
 * PRESERVA: empresa e configurações, catálogo de serviços e modelos de escopo,
 * modelos de contrato, etapas do pipeline, origens, motivos de perda, formas de
 * pagamento, retenções e usuários.
 *
 * Uso: npx tsx scripts/zerar-dados.mjs --confirmar
 */
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { rm } from 'node:fs/promises';
import path from 'node:path';

if (!process.argv.includes('--confirmar')) {
  console.log('Ação destrutiva. Reexecute com --confirmar para prosseguir.');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) });

// 1. Remove os arquivos em disco antes de perder a referência
const anexos = await prisma.attachment.findMany({ select: { storageKey: true } });
const base = path.resolve(process.env.STORAGE_LOCAL_PATH ?? './storage');
for (const a of anexos) {
  await rm(path.join(base, a.storageKey), { force: true }).catch(() => {});
}
console.log(`arquivos removidos do disco: ${anexos.length}`);

// 2. Apaga na ordem das dependências
const etapas = [
  ['aditivos', () => prisma.contractAmendment.deleteMany({})],
  ['assinaturas', () => prisma.contractSignature.deleteMany({})],
  ['versões de contrato', () => prisma.contractVersion.deleteMany({})],
  ['propostas', () => prisma.proposal.deleteMany({})],
  ['contratos', () => prisma.contract.deleteMany({})],
  ['itens de orçamento', () => prisma.budgetItem.deleteMany({})],
  ['aprovações', () => prisma.budgetApproval.deleteMany({})],
];
for (const [nome, fn] of etapas) {
  const r = await fn();
  console.log(`${nome}: ${r.count}`);
}

// orçamento aponta para a versão corrente: soltar antes de apagar as versões
await prisma.budget.updateMany({ data: { currentVersionId: null } });
console.log(`versões de orçamento: ${(await prisma.budgetVersion.deleteMany({})).count}`);
console.log(`orçamentos: ${(await prisma.budget.deleteMany({})).count}`);
console.log(`atividades: ${(await prisma.opportunityActivity.deleteMany({})).count}`);
console.log(`oportunidades: ${(await prisma.opportunity.deleteMany({})).count}`);
console.log(`contatos: ${(await prisma.clientContact.deleteMany({})).count}`);
console.log(`unidades: ${(await prisma.clientUnit.deleteMany({})).count}`);
console.log(`clientes: ${(await prisma.client.deleteMany({})).count}`);
console.log(`anexos: ${(await prisma.attachment.deleteMany({})).count}`);
console.log(`comentários: ${(await prisma.comment.deleteMany({})).count}`);
console.log(`notificações: ${(await prisma.notification.deleteMany({})).count}`);

// 3. Auditoria das entidades apagadas (mantém login e configurações)
const auditoria = await prisma.auditLog.deleteMany({
  where: {
    entityType: {
      in: [
        'client', 'client_contact', 'client_unit', 'opportunity', 'activity',
        'budget', 'budget_scope', 'proposal', 'contract', 'contract_version',
        'contract_signature', 'contract_amendment',
      ],
    },
  },
});
console.log(`registros de auditoria: ${auditoria.count}`);

// 4. Numeração volta a 001
console.log(`sequências zeradas: ${(await prisma.documentSequence.deleteMany({})).count}`);

console.log('\nSistema pronto para uso em produção.');
await prisma.$disconnect();
