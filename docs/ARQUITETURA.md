# SONARE CRM — Documento de Arquitetura

> Sistema de gestão comercial, contratual, técnica e financeira para a SONARE Engenharia.
> Versão 1.0 — 2026-07-27

## 1. Resumo da solução

Aplicação web monolítica modular construída sobre **Next.js (App Router) + TypeScript + Prisma + PostgreSQL**, cobrindo o ciclo completo de um serviço de engenharia: lead → oportunidade → orçamento (versionado) → proposta PDF → contrato → projeto → entregáveis/revisões → faturamento → recebimentos → encerramento.

A escolha do monólito Next.js (opção preferencial do requisito) reduz custo de manutenção: um único deploy, um único repositório, tipagem compartilhada entre camadas, e separação de responsabilidades garantida por camadas internas (não por microsserviços).

## 2. Stack técnica

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Framework | Next.js 15 (App Router) | SSR + API unificados, opção preferencial do requisito |
| Linguagem | TypeScript (strict) | Tipagem ponta a ponta |
| UI | Tailwind CSS 4 + shadcn/ui (Radix) | Componentes acessíveis, visual profissional, sem aparência genérica via tema próprio |
| Formulários | React Hook Form + Zod | Validação isomórfica (mesmo schema no client e server) |
| Dados no client | TanStack Query 5 | Cache, revalidação, estados de carregamento |
| Tabelas | TanStack Table 8 | Filtros, ordenação, paginação |
| Kanban | @dnd-kit | Arrastar e soltar acessível, mantido ativamente |
| Gráficos | Recharts | Dashboards |
| ORM | Prisma 6 | Migrações, tipagem, `Decimal` nativo |
| Banco | PostgreSQL 16 | Requisito |
| Autenticação | Sessão própria (cookie httpOnly + tabela Session) com Argon2id | Controle total, preparada para MFA |
| PDF | Puppeteer (HTML → PDF) com templates React | Propostas/contratos com layout rico e variáveis dinâmicas |
| Arquivos | Adaptador de storage: disco local (dev) / S3-compatível (prod), URLs assinadas | Requisito §8 |
| Validação monetária | `Prisma.Decimal` + decimal.js | Nunca float para dinheiro (requisito §5.4/§22.19) |
| Infra | Docker + Docker Compose | Requisito §20 |
| Testes | Vitest (unit/integration) + Playwright (e2e) | Requisito §24 |
| Logs | pino (JSON estruturado) | Requisito §18 |

## 3. Arquitetura em camadas

```
src/
├── app/                    # Rotas Next.js (App Router)
│   ├── (auth)/             # login, recuperação de senha
│   ├── (app)/              # área autenticada (layout com menu lateral)
│   │   ├── dashboard/
│   │   ├── clientes/
│   │   ├── crm/            # pipeline kanban + oportunidades
│   │   ├── orcamentos/
│   │   ├── contratos/
│   │   ├── projetos/
│   │   ├── financeiro/
│   │   ├── notas-fiscais/
│   │   ├── relatorios/
│   │   └── configuracoes/
│   └── api/                # rotas REST (uploads, webhooks, health)
├── server/
│   ├── services/           # REGRAS DE NEGÓCIO (uma pasta por módulo)
│   ├── repositories/       # acesso a dados via Prisma (quando a consulta é complexa)
│   ├── auth/               # sessão, senha, RBAC, guards
│   ├── audit/              # trilha de auditoria
│   ├── pdf/                # geração de documentos
│   ├── storage/            # adaptador local/S3
│   ├── fiscal/             # adaptador NFS-e (mock na fase 1)
│   └── integrations/       # camada desacoplada p/ futuras integrações
├── actions/                # Server Actions finas: validam (Zod) → chamam service
├── lib/                    # utilitários (dinheiro, datas pt-BR, formatação)
├── components/             # UI compartilhada
└── config/                 # constantes editáveis, permissões, navegação
```

**Regra de ouro:** Server Actions e rotas de API nunca contêm regra de negócio — apenas autenticação/validação e delegação a `server/services/*`. Services nunca importam nada de React/Next. Isso mantém o código testável sem subir o framework.

### Fluxo de uma mutação

```
UI (form RHF+Zod) → Server Action → requireAuth() + requirePermission()
  → Zod parse → service.método() → prisma (transação) → audit.log() → revalidatePath
```

## 4. Autenticação e autorização

- **Sessão:** cookie `httpOnly` + `SameSite=Lax` + tabela `Session` (token hasheado, expiração deslizante configurável, revogação individual). Proteção CSRF pela combinação SameSite + verificação de origem nas actions.
- **Senhas:** Argon2id, política configurável (tamanho mínimo, expiração), recuperação por token de uso único com validade curta.
- **RBAC:** papéis (`ADMIN`, `COMERCIAL`, `ENGENHARIA`, `FINANCEIRO`, `DIRETORIA`, `EXTERNO`, `CLIENTE`) + permissões granulares (`recurso:ação`, ex.: `budget:approve`, `invoice:create`). Papéis agregam permissões; usuários podem receber permissões extras. Checagem central em `requirePermission()` — usada por toda action/rota.
- **Rate limiting:** contador em memória/na tabela para login e rotas sensíveis.
- **MFA:** estrutura da tabela de usuário já prevê campos (`mfaEnabled`, `mfaSecret`) — implementação futura.

## 5. Auditoria

Serviço `audit.log()` chamado dentro da mesma transação das mutações relevantes, gravando: usuário, ação, entidade, id do registro, diff (valor anterior/posterior em JSON), IP e timestamp. Exclusões são **lógicas** (`deletedAt`) em todas as entidades de negócio; exclusão física restrita a administrador e igualmente auditada. Documentos financeiros nunca são excluídos fisicamente por usuários comuns (§22.18).

## 6. Dinheiro, datas e localização

- Valores monetários: `Decimal(14,2)` no banco; cálculo com `decimal.js` (arredondamento half-even configurável); formatação `R$ 1.234,56` via `Intl.NumberFormat('pt-BR')`.
- Percentuais/quantidades: `Decimal(9,4)`.
- Datas: armazenadas em UTC, exibidas no fuso configurável (`America/Cuiaba` por padrão, editável em Configurações).
- Idioma: pt-BR em toda a UI.

## 7. Geração de PDF

Templates HTML/React renderizados server-side e convertidos com Puppeteer (Chromium no container Docker). Modelos configuráveis com variáveis `{{campo}}` resolvidas por um interpolador seguro (whitelist de variáveis, escape de HTML). Documentos gerados são gravados no storage e vinculados como `Attachment` — nunca sobrescritos (nova versão = novo arquivo).

## 8. Storage de arquivos

Interface `StorageAdapter { put, get, getSignedUrl, delete }` com duas implementações: `LocalDiskAdapter` (dev, pasta `storage/` com URLs assinadas por HMAC + expiração) e `S3Adapter` (produção, compatível com S3/MinIO). Upload com validação de tipo/tamanho, hash SHA-256 registrado para integridade.

## 9. NFS-e (arquitetura de adaptadores)

Interface `FiscalProvider { emitirNotaFiscal, consultarNotaFiscal, cancelarNotaFiscal, baixarPdf, baixarXml, consultarStatus }`. Fase 1 usa `RegistroManualProvider` (nota emitida externamente e registrada) + `MockProvider` para testes. A emissão real só será ativada com certificado, credenciais e validação do contador — nunca presumimos tributação sem configuração (§9.5/§10.2).

## 10. Numeração de documentos

Sequências por tipo e ano, geradas em transação com lock (`SELECT ... FOR UPDATE` na tabela `DocumentSequence`): `ORC-2026-001`, `PROP-2026-001`, `CTR-2026-001`, `PRJ-2026-001`. Versões de orçamento: sufixo `-V01`, `-V02`. Formatos editáveis em Configurações.

## 11. Multiempresa

Todas as entidades carregam `companyId`. A fase 1 opera com uma única `Company` (SONARE), mas consultas já filtram por empresa via helper central, preparando SaaS futuro sem migração dolorosa.

## 12. Decisões técnicas e pressupostos registrados

| # | Pressuposto / decisão | Onde é editável |
|---|---|---|
| 1 | Monólito Next.js (opção preferencial do requisito), não NestJS | — |
| 2 | Fuso inicial `America/Cuiaba` | Configurações → Empresa |
| 3 | Percentuais de retenção **zerados por padrão**; usuário configura e confirma | Configurações → Tributos |
| 4 | Margem mínima 20% e desconto máximo 10% como valores iniciais das regras de aprovação | Configurações → Regras de aprovação |
| 5 | Etapas de pipeline, status e motivos de perda criados via seed, editáveis | Configurações → CRM |
| 6 | Numeração `TIPO-AAAA-NNN` | Configurações → Numeração |
| 7 | Assinatura de contrato: upload do assinado + registro manual (adapter p/ e-signature futuro) | — |
| 8 | Portal do cliente: estrutura de dados pronta (papel `CLIENTE`, flags de visibilidade), UI em fase futura | — |
| 9 | E-mail transacional: interface `Mailer` com driver `console` em dev; SMTP configurável | Variáveis de ambiente |
| 10 | Storage dev = disco local; produção = S3-compatível | Variáveis de ambiente |

## 13. Riscos técnicos identificados

1. **Escopo muito amplo** → mitigado por fases; MVP fecha o fluxo ponta a ponta antes de qualquer integração.
2. **Cálculo financeiro** (retenções, parciais, saldo) → testes unitários dedicados às regras de dinheiro desde a fase 1.
3. **Puppeteer no Docker** → imagem com Chromium headless já validada no Compose.
4. **Importação Trello** → dados reais costumam ser sujos; tela de mapeamento + prévia + relatório de erros (fase posterior ao MVP).
5. **Integrações externas** (NFS-e, bancos, WhatsApp) dependem de credenciais → adaptadores mock até haver dados reais.
