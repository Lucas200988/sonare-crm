import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'npx tsx prisma/seed.ts',
  },
  // Migrações usam a conexão direta (sem pooler); o app usa o adapter pg em src/server/db.ts
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
