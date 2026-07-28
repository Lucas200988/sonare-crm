# SONARE CRM

Sistema de gestão comercial, contratual, técnica e financeira da SONARE Engenharia.
Cobre o ciclo completo: lead → oportunidade → orçamento versionado → proposta → contrato → projeto → entregáveis/revisões → faturamento → recebimentos → encerramento.

Documentação de planejamento em [`docs/`](docs/):
- [Arquitetura](docs/ARQUITETURA.md)
- [Modelo de dados](docs/MODELO-DE-DADOS.md)
- [Plano do MVP](docs/PLANO-MVP.md)

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS 4 · Prisma 7 · PostgreSQL · Vitest

## Requisitos

- Node.js 22+
- PostgreSQL 16 (local via Docker **ou** gerenciado, ex.: Supabase)

## Instalação (desenvolvimento)

```bash
npm install
```

1. Copie `.env.example` para `.env` e preencha:
   - `DATABASE_URL` — conexão da aplicação (no Supabase, use o *Transaction pooler*);
   - `DIRECT_URL` — conexão direta (usada pelas migrações);
   - `APP_SECRET` — gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

2. Rode as migrações e o seed:

```bash
npm run db:deploy
npm run db:seed
```

3. Inicie:

```bash
npm run dev
```

Acesse http://localhost:3000.

### Usuários de demonstração (após o seed)

| E-mail | Perfil | Senha |
|---|---|---|
| admin@demo.sonare | Administrador | Sonare@2026 |
| comercial@demo.sonare | Comercial | Sonare@2026 |
| engenharia@demo.sonare | Engenharia | Sonare@2026 |
| financeiro@demo.sonare | Financeiro | Sonare@2026 |
| diretoria@demo.sonare | Diretoria | Sonare@2026 |

> Credenciais apenas de demonstração. Troque as senhas em produção.

## Instalação via Docker (produção/homologação)

```bash
docker compose up -d --build
```

Sobe PostgreSQL 16 + aplicação em `http://localhost:3000` (health check em `/api/health`).
Defina `POSTGRES_PASSWORD` e `APP_SECRET` no `.env` antes de subir.
Após o primeiro start, rode as migrações dentro do container:

```bash
docker compose exec app npx prisma migrate deploy
```

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e execução de produção |
| `npm run typecheck` | Verificação de tipos |
| `npm test` | Testes (Vitest) |
| `npm run db:migrate` | Cria/aplica migrações (dev) |
| `npm run db:deploy` | Aplica migrações (produção) |
| `npm run db:seed` | Popula configurações, catálogo e modelos (acrescente `-- --demo` para dados de exemplo) |
| `npm run db:studio` | Prisma Studio |

## Estrutura de pastas

```
src/
├── app/            # rotas (App Router): (auth)/login, (app)/módulos, api/
├── actions/        # Server Actions finas (validação + delegação)
├── server/
│   ├── services/   # regras de negócio
│   ├── auth/       # sessão, senha, RBAC, rate limit
│   ├── audit/      # trilha de auditoria
│   └── db.ts       # Prisma client (adapter pg)
├── components/     # UI compartilhada
├── config/         # permissões, navegação
└── lib/            # dinheiro (Decimal), datas pt-BR
prisma/             # schema, migrações, seed
docs/               # arquitetura e planos
```

## Assistente de escopo (IA)

O editor de orçamento tem um **assistente de escopo** que preenche escopo, premissas,
exclusões, prazo e itens sugeridos de duas formas:

1. **Modelos padrão** — biblioteca derivada dos modelos oficiais de proposta da SONARE
   (projeto elétrico, fotovoltaico, subestação, SPDA, PSCIP, laudos). Funciona sem
   configuração e é editável em Configurações → Catálogo de serviços.
2. **Geração por IA** — a partir de um briefing curto (ex.: "projeto elétrico de
   edificação térrea de 450 m² com padrão trifásico"). Requer conectar uma API em
   **Configurações → Inteligência artificial** (OpenAI ou Anthropic). A chave é
   criptografada (AES-256-GCM com o `APP_SECRET`) antes de ser gravada e nunca é
   exibida de volta.

O conteúdo gerado é sempre uma sugestão — revise tecnicamente antes de enviar ao cliente.

## Correção ortográfica

Duas camadas, nos campos de texto que vão para a proposta:

1. **Corretor do navegador** — sublinhado vermelho enquanto se digita. O documento declara
   `lang="pt-BR"`, então o navegador usa o dicionário português. Se aparecer tudo sublinhado,
   falta instalar o idioma no navegador (Chrome: Configurações → Idiomas → adicionar
   *Português (Brasil)* e ativar a verificação ortográfica).
2. **Botão “Revisar texto”** — usa a mesma API de IA configurada e corrige ortografia,
   acentuação, pontuação e concordância **sem reescrever o conteúdo**: não altera números,
   prazos, códigos de normas (ABNT NBR, NR, IEC) nem a formatação em tópicos. Há um botão
   *Desfazer* para voltar ao texto anterior.

## Zerar os dados para uso real

Depois de testar, para limpar tudo que foi criado em testes:

```bash
npx tsx scripts/zerar-dados.mjs --confirmar
```

Apaga clientes, oportunidades, orçamentos, propostas, contratos, os PDFs em disco
e a numeração dos documentos. **Preserva** empresa e configurações, catálogo de
serviços com os modelos de escopo, modelos de contrato, etapas do pipeline e usuários.

## Desempenho

O tempo de resposta é dominado pela latência até o banco. Para medir:

```bash
npx tsx scripts/diagnostico-performance.mjs
```

O script mostra a latência TCP, o custo de uma consulta trivial e o de cada tela. Se o
`SELECT 1` estiver acima de ~50 ms, o banco está longe geograficamente — considere um
projeto Supabase na região `sa-east-1` (São Paulo).

## Decisões e pressupostos

Ver [docs/ARQUITETURA.md §12](docs/ARQUITETURA.md). Destaques:
- Valores monetários sempre `Decimal` (nunca float); arredondamento half-even.
- Retenções tributárias **zeradas por padrão** — configure em Configurações e valide com o contador.
- Emissão real de NFS-e desativada até haver credenciais/certificado (arquitetura de adaptadores pronta).
- Exclusões são lógicas (`deletedAt`); documentos financeiros não são excluídos fisicamente.
- Auditoria registra usuário, ação, antes/depois e IP nas mutações relevantes.
