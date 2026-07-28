/**
 * Prepara o sistema para uso real:
 *  - cria o administrador definitivo com senha forte gerada na hora;
 *  - desativa os usuários de demonstração (senha pública "Sonare@2026");
 *  - confere as variáveis obrigatórias de produção.
 *
 * Uso:
 *   npx tsx scripts/preparar-producao.mjs "Nome Completo" email@empresa.com.br
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from '@node-rs/argon2';

const [, , nome, email] = process.argv;
if (!nome || !email) {
  console.log('Uso: npx tsx scripts/preparar-producao.mjs "Nome Completo" email@empresa.com.br');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) });
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

// Senha forte, legível, sem caracteres ambíguos
function gerarSenha() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(16);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');
}

const company = await prisma.company.findFirstOrThrow();
const adminRole = await prisma.role.findFirstOrThrow({
  where: { companyId: company.id, code: 'ADMIN' },
});

const senha = gerarSenha();
const emailNorm = email.trim().toLowerCase();

const existente = await prisma.user.findUnique({ where: { email: emailNorm } });
if (existente) {
  await prisma.user.update({
    where: { id: existente.id },
    data: { passwordHash: await hash(senha, ARGON), active: true, passwordChangedAt: new Date() },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: existente.id, roleId: adminRole.id } },
    create: { userId: existente.id, roleId: adminRole.id },
    update: {},
  });
  console.log(`Administrador existente atualizado: ${emailNorm}`);
} else {
  await prisma.user.create({
    data: {
      companyId: company.id,
      name: nome.trim(),
      email: emailNorm,
      passwordHash: await hash(senha, ARGON),
      roles: { create: { roleId: adminRole.id } },
    },
  });
  console.log(`Administrador criado: ${emailNorm}`);
}

// Desativa as contas de demonstração e encerra suas sessões
const demo = await prisma.user.findMany({ where: { email: { endsWith: '@demo.sonare' } } });
for (const u of demo) {
  await prisma.user.update({ where: { id: u.id }, data: { active: false } });
  await prisma.session.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
}
console.log(`contas de demonstração desativadas: ${demo.length}`);

console.log('\n=================================================');
console.log(`  Acesso:  ${emailNorm}`);
console.log(`  Senha:   ${senha}`);
console.log('  Anote agora — ela não será exibida de novo.');
console.log('=================================================\n');

// Conferência do ambiente
const pendencias = [];
if (!process.env.APP_URL || process.env.APP_URL.includes('localhost')) {
  pendencias.push('APP_URL ainda aponta para localhost (quebra os QR codes dos documentos)');
}
if (process.env.STORAGE_DRIVER !== 'local' && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  pendencias.push('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes para o storage');
}
if (!process.env.APP_SECRET || process.env.APP_SECRET.length < 32) {
  pendencias.push('APP_SECRET curto ou ausente');
}
if (pendencias.length > 0) {
  console.log('Pendências no ambiente de produção:');
  for (const p of pendencias) console.log(`  - ${p}`);
} else {
  console.log('Variáveis de produção conferidas.');
}

await prisma.$disconnect();
