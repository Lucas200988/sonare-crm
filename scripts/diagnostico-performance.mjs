// Diagnóstico de desempenho: mede latência de rede e custo das consultas.
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { connect } from 'node:net';
import { performance } from 'node:perf_hooks';

function tcpLatency(host, port) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const socket = connect({ host, port, timeout: 5000 });
    socket.on('connect', () => { const ms = performance.now() - t0; socket.destroy(); resolve(ms); });
    socket.on('error', () => resolve(null));
    socket.on('timeout', () => { socket.destroy(); resolve(null); });
  });
}

const url = new URL(process.env.DATABASE_URL);
console.log(`Host do banco: ${url.hostname}:${url.port}\n`);

console.log('--- Latência TCP (handshake de conexão) ---');
for (let i = 0; i < 5; i++) {
  const ms = await tcpLatency(url.hostname, Number(url.port));
  console.log(`  tentativa ${i + 1}: ${ms === null ? 'falhou' : `${ms.toFixed(0)} ms`}`);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  log: [{ emit: 'event', level: 'query' }],
});

let queryCount = 0;
let queryTotalMs = 0;
prisma.$on('query', (e) => { queryCount++; queryTotalMs += e.duration; });

async function medir(nome, fn) {
  queryCount = 0; queryTotalMs = 0;
  const t0 = performance.now();
  await fn();
  const total = performance.now() - t0;
  console.log(`  ${nome.padEnd(42)} ${total.toFixed(0).padStart(6)} ms | ${String(queryCount).padStart(3)} queries | ${queryTotalMs.toFixed(0).padStart(5)} ms no banco`);
}

console.log('\n--- Consulta mínima (ida e volta pura) ---');
await medir('SELECT 1 (primeira, abre conexão)', () => prisma.$queryRaw`SELECT 1`);
await medir('SELECT 1 (conexão já aberta)', () => prisma.$queryRaw`SELECT 1`);
await medir('SELECT 1 (terceira)', () => prisma.$queryRaw`SELECT 1`);

const company = await prisma.company.findFirstOrThrow();
const companyId = company.id;

console.log('\n--- Consultas equivalentes às páginas do sistema ---');

await medir('Dashboard (6 contagens em paralelo)', async () => {
  await Promise.all([
    prisma.budget.count({ where: { companyId, deletedAt: null, status: { in: ['RASCUNHO', 'EM_REVISAO'] } } }),
    prisma.opportunity.count({ where: { companyId, deletedAt: null, closedAt: null } }),
    prisma.proposal.count({ where: { companyId, deletedAt: null, status: { in: ['ENVIADA', 'VISUALIZADA'] } } }),
    prisma.project.count({ where: { companyId, deletedAt: null } }),
    prisma.project.count({ where: { companyId, deletedAt: null, status: 'CONCLUIDO' } }),
    prisma.project.count({ where: { companyId, deletedAt: null, status: 'SUSPENSO' } }),
  ]);
});

await medir('Lista de clientes (count + findMany)', async () => {
  await prisma.$transaction([
    prisma.client.count({ where: { companyId, deletedAt: null } }),
    prisma.client.findMany({ where: { companyId, deletedAt: null }, take: 20, include: { leadSource: true, commercialOwner: true, _count: { select: { opportunities: true, contracts: true, projects: true } } } }),
  ]);
});

await medir('Kanban do CRM (etapas + oportunidades)', async () => {
  await Promise.all([
    prisma.opportunityStage.findMany({ where: { companyId, active: true } }),
    prisma.opportunity.findMany({
      where: { companyId, deletedAt: null },
      include: { client: true, commercialOwner: true, serviceCatalog: true, activities: { take: 1 } },
    }),
  ]);
});

await medir('Detalhe do orçamento (5 consultas da página)', async () => {
  const budget = await prisma.budget.findFirst({
    where: { companyId, deletedAt: null },
    include: {
      client: true, clientUnit: true, opportunity: true,
      commercialOwner: true, technicalOwner: true,
      currentVersion: { include: { items: true, proposals: true } },
      versions: true, approvals: { include: { requestedBy: true, decidedBy: true } },
    },
  });
  await prisma.serviceCatalog.findMany({ where: { companyId, active: true, deletedAt: null } });
  await prisma.systemSetting.findMany({ where: { companyId, key: { startsWith: 'ai.' } } });
  return budget;
});

await medir('5 consultas SEQUENCIAIS (efeito cascata)', async () => {
  for (let i = 0; i < 5; i++) await prisma.company.findFirst({ where: { id: companyId } });
});

await medir('5 consultas EM PARALELO (mesma carga)', async () => {
  await Promise.all(Array.from({ length: 5 }, () => prisma.company.findFirst({ where: { id: companyId } })));
});

console.log('\n--- Volume de dados (a lentidão não vem daqui) ---');
const [clients, opps, budgets, audit] = await Promise.all([
  prisma.client.count(), prisma.opportunity.count(),
  prisma.budget.count(), prisma.auditLog.count(),
]);
console.log(`  clientes: ${clients} | oportunidades: ${opps} | orçamentos: ${budgets} | registros de auditoria: ${audit}`);

await prisma.$disconnect();
