# SONARE CRM — Modelo de Dados

Convenções globais: PK `id` (UUID v7), `companyId`, `createdAt`, `updatedAt`, `createdById`, `updatedById`, `deletedAt` (exclusão lógica) em todas as entidades de negócio. Dinheiro = `Decimal(14,2)`; percentuais/qtd = `Decimal(9,4)`.

## Núcleo / segurança

- **Company** — dados da SONARE (razão social, CNPJ, IM, endereço, logo, dados bancários, Pix, CREA, fuso, moeda). 1 registro na fase 1.
- **User** — nome, e-mail, hash de senha (Argon2id), status, campos MFA reservados, `lastLoginAt`.
- **Role** / **Permission** / **RolePermission** / **UserRole** — RBAC. Permissões no formato `recurso:ação`.
- **Session** — token hasheado, expiração, IP, user agent, revogação.
- **PasswordResetToken** — token de uso único.
- **AuditLog** — userId, ação, entidade, entityId, diff JSON (antes/depois), IP, timestamp.
- **SystemSetting** — chave/valor JSON tipado (numeração, tributos, margem mínima, desconto máximo, expiração de sessão...).
- **DocumentSequence** — tipo + ano + próximo número (numeração transacional).
- **CustomField** / **CustomFieldValue** — campos personalizados por entidade (tipo, opções, obrigatoriedade) e valores (JSON).

## Clientes

- **Client** — tipo PF/PJ, razão social, fantasia, CPF/CNPJ, IE, IM, contatos gerais, endereço completo, status (ATIVO/INATIVO/BLOQUEADO), origem, segmento, data 1º contato, responsável comercial (→User), observações, tags (string[]).
- **ClientContact** — N por cliente: nome, cargo, e-mail, telefones, departamento, poder de decisão, flags (principal/financeiro/técnico/contratual).
- **ClientUnit** — obras/fazendas/usinas/filiais: nome, tipo, endereço, UC, observações. Oportunidades, orçamentos, contratos e projetos podem referenciá-la.
- **LeadSource** — cadastro configurável de origens.

## CRM

- **OpportunityStage** — etapas configuráveis do Kanban (nome, ordem, cor, tipo: ABERTA/GANHA/PERDIDA/SUSPENSA).
- **Opportunity** — código `OPP-AAAA-NNN`, título, cliente, unidade, contato principal, descrição, tipo de serviço (→ServiceCatalog), responsáveis comercial/técnico, origem, valor estimado, probabilidade, datas previstas, prioridade, concorrentes, necessidade, próxima ação + data, tags, etapa atual, posição no Kanban, motivo de perda (→LossReason).
- **OpportunityActivity** — tipo (ligação, reunião, visita, e-mail, tarefa, follow-up...), responsável, data, status, observação, vínculo com cliente e/ou oportunidade.
- **LossReason** — cadastro configurável.
- **ServiceCatalog** — biblioteca de serviços: código, nome, categoria, disciplina, unidade, valor padrão, custo estimado, horas previstas, modelos de escopo/premissas/exclusões, entregáveis associados (JSON), ativo.

## Orçamentos e propostas

- **Budget** — código `ORC-AAAA-NNN`, oportunidade, cliente, unidade, responsáveis, status (RASCUNHO/EM_REVISAO/APROVACAO_INTERNA/APROVADO/RECUSADO/EXPIRADO), ponteiro `currentVersionId`.
- **BudgetVersion** — nº da versão, validade, escopo, premissas, exclusões, docs de referência, prazo, forma de entrega/pagamento, subtotal, desconto, acréscimo, impostos, retenções estimadas, custo total, margem (valor e %), total; justificativa da versão; snapshot imutável após envio/aprovação.
- **BudgetItem** — por versão: serviço (→ServiceCatalog opcional), descrição, disciplina, etapa, unidade, quantidade, valor unitário, custo unitário, desconto, total; ordenação.
- **BudgetApproval** — regra disparada (desconto>X, margem<Y, valor>Z), solicitante, aprovador, status, comentário.
- **Proposal** — número `PROP-AAAA-NNN`, versão do orçamento, template usado, tipo (comercial/técnica/unificada), PDF gerado (→Attachment), data/meio de envio, destinatários, data de aceite/recusa, motivo.
- **ProposalTemplate** — nome, tipo, HTML com variáveis, ativo.

## Contratos

- **Contract** — código `CTR-AAAA-NNN`, cliente, unidade, proposta/orçamento de origem, objeto, escopo herdado, valor, datas início/término, prazo, forma de pagamento (JSON estruturado de parcelas), índice de reajuste, data-base, multas, garantias, retenções, foro, status (MINUTA→...→ENCERRADO, §6.3), responsáveis, testemunhas (JSON).
- **ContractVersion** — versões da minuta (PDF + variáveis resolvidas).
- **ContractAmendment** — aditivos: tipo (valor/prazo/escopo/...), descrição, deltas, PDF, status.
- **ContractSignature** — assinantes, datas, arquivo assinado, status.
- **ContractTemplate** — modelos com variáveis `{{...}}` por tipo de serviço.

## Projetos

- **Project** — código `PRJ-AAAA-NNN`, nome, cliente, unidade, contrato, orçamento, responsável técnico, coordenador, disciplina(s), datas (início, prazo contratual, prevista, real), valor, status (§7.2), prioridade, % concluído, riscos, observações.
- **ProjectStage** — etapas configuráveis com ordem, status, datas.
- **ProjectMember** — equipe (usuário + papel no projeto).
- **Task** — título, descrição, projeto, etapa, entregável, responsável, colaboradores, prioridade, datas, status, horas previstas/realizadas, dependências, posição (Kanban/lista).
- **TaskChecklistItem** — itens de checklist.
- **Deliverable** — código, nome, disciplina, responsável, prazo, status, revisão atual, datas de emissão/aprovação, dependências.
- **DeliverableRevision** — R00/R01/.../AS_BUILT/FINAL: número, data, responsável, motivo, descrição das alterações, arquivo (→Attachment), status, comentários do cliente. Revisão emitida é imutável.
- **TimeEntry** — usuário, projeto, tarefa, data, horas, descrição, faturável, custo/valor hora, status de aprovação.
- **TechnicalResponsibility** — ART/RRT: número, tipo, conselho, profissional, CREA/CAU, emissão, valor, status, arquivo, baixa.
- **ClientPendency** — pendências do cliente: documento/decisão, responsável no cliente, solicitação, prazo, impacto, status, recebimento.

## Documentos

- **Attachment** — entidade polimórfica (`entityType` + `entityId`): nome, categoria, mime, tamanho, hash SHA-256, chave no storage, versão, autor. Exclusão lógica.
- **Comment** — comentários polimórficos (cliente, oportunidade, projeto, tarefa, entregável...).

## Financeiro

- **Receivable** (parcela) — código, contrato, projeto, cliente, descrição, nº parcela, competência, emissão, vencimento, valor bruto, desconto, acréscimo, retenções (JSON detalhado por tributo), valor líquido, status (§9.3), forma de pagamento, saldo (calculado), observações.
- **Receipt** (recebimento) — parcela, data, valor recebido, juros, multa, desconto, taxa bancária, retenções efetivas, comprovante (→Attachment), estorno.
- **FinancialRetention** — configuração de tributos (ISS, INSS, IRRF, PIS, COFINS, CSLL, outros): percentual, ativo. Zerados por padrão.
- **Invoice** — NFS-e: número, série, município emissor, emissão, competência, cliente, contrato, projeto, parcelas vinculadas (N:N via **InvoiceReceivable**), valor bruto, deduções, retenções, líquido, código/descrição do serviço, status, PDF/XML, link, cancelamento.
- **PaymentMethod** — formas de pagamento configuráveis.
- **CollectionEvent** — fluxo de cobrança: parcela, tipo (lembrete/aviso/1º atraso/.../jurídico), data, meio, modelo usado, observação.

## Notificações / importação

- **Notification** — usuário, tipo, título, corpo, link, lida, origem (regra de alerta).
- **ImportJob** / **ImportError** — importações Trello/CSV: origem, mapeamento (JSON), status, totais, erros linha a linha.

## Relações-chave (regras §22)

```
Opportunity 1─N Budget 1─N BudgetVersion (1 marcada como atual) 1─N BudgetItem
BudgetVersion 1─N Proposal → (aprovada) → Contract 1─N Project
Contract 1─N ContractAmendment, 1─N Receivable
Receivable N─N Invoice (via InvoiceReceivable), 1─N Receipt (parciais; saldo calculado)
Project 1─N ProjectStage, 1─N Task, 1─N Deliverable 1─N DeliverableRevision (imutáveis)
```
