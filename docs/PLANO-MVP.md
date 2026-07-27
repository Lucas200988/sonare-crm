# SONARE CRM — Plano de Implementação do MVP

## Objetivo do MVP (§28)

Fluxo completo funcionando ponta a ponta, sem integrações externas:
cliente → oportunidade (Kanban) → orçamento com itens e versões → proposta PDF → aprovação → contrato PDF → assinatura registrada → projeto com etapas/entregáveis → parcelas → nota fiscal registrada → recebimentos (parciais e totais) → dashboard → histórico do cliente.

## Fases

### Fase 1 — Fundação
- Scaffold Next.js 15 + TS strict + Tailwind 4 + shadcn/ui, tema visual SONARE.
- Docker Compose (app + PostgreSQL), `.env.example`, health check.
- Schema Prisma completo (todas as entidades do modelo de dados) + migração inicial + seed.
- Autenticação por sessão (login, logout, recuperação de senha), Argon2id, rate limit.
- RBAC: papéis, permissões, guards `requireAuth`/`requirePermission`.
- Auditoria (`audit.log` transacional) e exclusão lógica.
- Layout: menu lateral, header, breadcrumbs, tema, estados vazios/carregamento.
- Configurações da empresa + numeração + tributos (zerados) + regras de aprovação.
- **Teste:** login com os 4 perfis do seed; permissões bloqueando telas; auditoria registrando.

### Fase 2 — CRM
- CRUD Clientes (PF/PJ) + contatos + unidades/obras + tags.
- Cadastros configuráveis: origens, motivos de perda, etapas do pipeline, catálogo de serviços.
- Oportunidades: CRUD, código automático, checklist, anexos.
- Kanban drag-and-drop com valor por etapa e filtros.
- Atividades comerciais + follow-ups + linha do tempo do cliente.
- **Teste:** criar cliente → oportunidade → mover no Kanban → registrar atividades.

### Fase 3 — Orçamentos e propostas
- Orçamento com itens (composição por serviço/etapa/hora), cálculos Decimal (subtotal, desconto, impostos, retenções estimadas, custo, margem).
- Versionamento imutável (V01, V02...) com diff de valores/escopo e justificativa.
- Regras de aprovação interna configuráveis (desconto, margem, valor).
- Geração de proposta em PDF (template com logomarca, escopo, premissas, exclusões, investimento, aceite).
- Registro de envio, aceite e recusa.
- **Teste:** fluxos 3–7 dos testes prioritários (§24); testes unitários de cálculo.

### Fase 4 — Contratos
- Conversão proposta→contrato herdando todos os dados (sem redigitação).
- Modelos com variáveis `{{...}}`, geração de PDF da minuta, status do ciclo (§6.3).
- Registro de assinatura (upload do assinado, assinantes, datas, testemunhas).
- Aditivos vinculados com novo PDF.
- **Teste:** aprovar orçamento → gerar contrato → assinar → status vigente.

### Fase 5 — Projetos
- Conversão contrato→projeto; etapas configuráveis; equipe.
- Tarefas (lista + Kanban + calendário), checklist, dependências.
- Entregáveis com revisões formais imutáveis (R00→...→FINAL).
- Apontamento de horas; ART/RRT; pendências do cliente.
- **Teste:** criar projeto do contrato, etapas, entregável com revisão, apontar horas.

### Fase 6 — Financeiro
- Geração automática de parcelas a partir da forma de pagamento do contrato.
- Registro de NFS-e externa (com PDF/XML) vinculada a parcelas.
- Recebimentos totais e parciais (juros/multa/desconto/taxas/retenções), saldo automático.
- Contas a receber, aging, fluxo de cobrança com modelos de mensagem.
- **Teste:** fluxos 10–14 (§24); testes unitários de saldo e retenções.

### Fase 7 — Dashboards e relatórios
- Dashboards geral, comercial, projetos e financeiro (Recharts).
- Relatórios exportáveis (CSV/Excel/PDF) com filtros.
- Pesquisa global.
- Notificações internas (alertas de prazo, vencimento, follow-up).

### Fase 8 — Integrações e importação (pós-MVP)
- Importador Trello/CSV com mapeamento, prévia e relatório.
- Adaptadores: NFS-e real, e-mail SMTP, assinatura eletrônica, WhatsApp, bancos.
- Portal do cliente.

## Critério de conclusão

O MVP está pronto quando todos os itens da seção 29 do requisito passarem, com os 14 fluxos prioritários cobertos por testes e o README permitindo instalação por outro desenvolvedor via Docker.

## Ordem de execução nesta implementação

As fases 1–7 serão implementadas em sequência neste repositório, com testes ao final de cada fase. A fase 8 depende de credenciais externas e fica documentada como pendência.
