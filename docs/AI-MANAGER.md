# SONARE AI Manager (Jarvis)

Gerente operacional de IA dentro do CRM. **Fase 1 — Analista (atual):**
conversa em linguagem natural sobre a operação, consultando dados reais por
ferramentas de leitura, sempre com o RBAC do usuário logado.

## Arquitetura

```
Usuário (chat no CRM)
   └─ perguntarAoJarvisAction          src/actions/agente.ts
       └─ conversar()                  src/server/services/agente.ts
           ├─ promptDoManager()        src/server/ai/manager-prompt.ts
           ├─ conversarComFerramentas()src/server/ai/client.ts   ← AI Core
           │    └─ ferramentasDoUsuario()  src/server/ai/manager-tools.ts
           │         └─ serviços existentes (RBAC + regras de negócio)
           └─ AgentThread/AgentMessage (persistência da conversa)
```

Princípios inegociáveis:

- **O modelo nunca toca o Prisma.** Fluxo: LLM → tool (allowlist + Zod) →
  serviço → RBAC → banco. Nome de ferramenta fora do catálogo não executa.
- **Regra de negócio mora nos serviços/`src/lib`**, nunca em prompt. O
  agente consulta `prazos_concessionaria`; não calcula prazos.
- **Identidade = usuário da sessão.** O Jarvis vê o que a pessoa vê. A
  identidade autônoma própria (Fase 3) usará o mesmo caminho com um
  `SessionUser` do agente, auditado como tal — nunca mascarado como humano.
- **Dados do CRM são dados, não instruções** (defesa de prompt injection no
  prompt de sistema). Falha de ferramenta vira erro amigável, sem stack.
- Ausência de registro **não** é ausência de trabalho — o prompt proíbe a
  inferência e a ferramenta de atividade devolve a ressalva junto.

## AI Core (`src/server/ai/client.ts`)

Único ponto do sistema que fala com o provedor: configuração
(`SystemSetting` `ai.*`, chave criptografada), compatibilidade com modelos
de raciocínio (gpt-5*/o*), retry de parâmetro recusado, timeouts, loop de
tool calling (teto de 6 ciclos e ~50 s; a última volta sai sem ferramentas
para forçar resposta) e **métrica em `AiCall`** (tokens, latência, status,
por empresa/usuário/caso de uso). O assistente de escopo e a revisão usam o
mesmo núcleo (`completarTexto`).

## Memória (modelos criados, uso pleno nas próximas fases)

- `AgentThread`/`AgentMessage` — a conversa (o que foi dito). O histórico
  reenviado ao modelo é limitado (20 falas, sem resultados de tool antigos).
- `AgentMemory` — conhecimento operacional que sobrevive à conversa
  (férias, compromissos, bloqueios, instruções de gestão), com `type`,
  sujeito, validade e `source` (CRM_FACT | USER_DECLARATION | AI_INFERENCE |
  AGENT_DECISION). As ferramentas de atividade/projeto já a consultam.
- `AuditLog` continua sendo o que aconteceu no sistema — outra coisa.

## Como adicionar uma ferramenta

Em `manager-tools.ts`: nome, descrição (é o que o modelo lê para decidir),
`permissao` (RBAC de oferta), schema Zod **strict** + JSON Schema com
`additionalProperties: false`, e `executar` chamando um serviço existente.
Contexto agregado (poucas consultas largas — o banco tem ~145 ms de
latência) mora em `src/server/services/agente-contexto.ts`.

## Fase 2 — Executor (entregue)

Ferramentas de escrita (criar tarefa, registrar observação, enviar
follow-up da fila) NUNCA executam: registram uma proposta em `AgentAction`
(validade 30 min) e o chat mostra o cartão com **dupla confirmação**
(Confirmar arma → "Sim, executar" executa). A execução é determinística
(`agente-acoes.ts`), sem o LLM no caminho, auditada como "confirmada pelo
usuário". Exceção deliberada: `registrar_informacao_operacional` grava
direto em `AgentMemory` (é o caderno do agente sobre o que a pessoa
DECLAROU — fonte USER_DECLARATION, autor registrado, validade).

## Fase 3 — Gerente autônomo (morning/closing entregues)

- Identidade própria: usuário-sistema **SONARE AI Manager**
  (`jarvis@sonareengenharia.com.br`, inativo para login). Ciclos autônomos
  assinam `AuditLog` e notificações como o agente — nunca como uma pessoa.
- **Morning (08h) e Closing (17h30), dias úteis** — cron
  `/api/cron/jarvis?periodo=` (CRON_SECRET). Os DADOS de cada briefing são
  coletados com o `SessionUser` do DESTINATÁRIO (RBAC vale em mensagem
  proativa); a redação usa a IA com **fallback determinístico** — o
  briefing sai mesmo com o provedor fora. Opt-in por usuário na tela de
  Usuários (`User.jarvisBriefing`).
- Compromissos/disponibilidades vigentes em `AgentMemory` entram no
  briefing. **Pendente da Fase 3**: Continuous Manager (cobranças
  individuais ao longo do dia — o de maior risco de spam, de propósito por
  último).

## Fase 4 — WhatsApp (entregue)

Canal sobre a **Meta WhatsApp Cloud API**, sem nenhuma lógica de IA própria:

```
WhatsApp → /api/webhooks/whatsapp (assinatura X-Hub-Signature-256)
         → agente-whatsapp.ts (adapter: identifica a pessoa pelo número)
         → conversar() — o MESMO do chat do CRM (ferramentas, RBAC, memória)
```

- Identificação pelo campo **WhatsApp pessoal** do usuário (Usuários →
  Dados profissionais); número desconhecido é ignorado em silêncio.
- Dupla confirmação por **palavra-chave decidida em código, nunca pelo
  modelo**: a proposta pede CONFIRMAR (arma, status ARMADA) → SIM executa →
  CANCELAR desiste. Mesma AgentAction, mesma validade de 30 min.
- Thread contínua por pessoa (channel WHATSAPP); o webhook responde 200 na
  hora e processa via `after()` — a Meta não reentrega.
- Env: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`,
  `WHATSAPP_APP_SECRET`. Limitação conhecida: mensagens INICIADAS pelo
  agente fora da janela de 24 h exigem template aprovado pela Meta — por
  isso os briefings proativos seguem por sino + e-mail; o WhatsApp é
  conversacional (responder dentro da janela é livre).
- **Twilio (plano B, mesmo adapter)**: webhook `/api/webhooks/twilio-whatsapp`
  (form-urlencoded, `X-Twilio-Signature` HMAC-SHA1 sobre a URL pública +
  parâmetros; `src/lib/twilio.ts`). Env: `TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (ex.: `whatsapp:+14155238886`
  no sandbox). Com credenciais Twilio presentes, ela tem prioridade sobre a
  Meta. Sandbox: cada celular precisa mandar `join <código>` ao número da
  Twilio antes de conversar.
- **Orçamento pelo WhatsApp**: o mesmo fluxo do chat. O rascunho vem em
  texto com o rodapé "diga: gera a proposta"; a confirmação é por
  palavra-chave (CONFIRMAR → SIM); ao executar, o **PDF vai como documento**
  pelo link público da proposta (`/verificar/<código>/pdf`, o mesmo do
  e-mail ao cliente — sem login, código aleatório).

## Testes

`conversa.test.ts` (loop com provider mockado: execução, teto de ciclos,
resposta direta, métricas, erro) e `manager-tools.test.ts` (allowlist,
RBAC de oferta e de execução, Zod, falha sem vazamento). A suíte nunca
chama a OpenAI real.

## Agente comercial — orçamentos e propostas por conversa

O Jarvis elabora orçamentos e propostas em linguagem natural usando o
módulo de orçamento como fonte de verdade. **O LLM nunca é a fonte dos
preços**: IA interpreta, pesquisa, compara e redige; o CRM decide
(catálogo, histórico, regras, cálculo, PDF).

```
pedido → buscar_cliente → catalogo_de_servicos (preço ATUAL + histórico praticado)
       → historico_do_cliente → propostas_semelhantes (base de conhecimento)
       → parametros_comerciais → criar_rascunho_de_orcamento (AgentQuoteDraft)
       → alterar_rascunho_de_orcamento (operações determinísticas)
       → propor_gerar_proposta → [dupla confirmação]
       → createBudget → saveCurrentVersion → submitBudget → generateProposal
       → PDF oficial na conversa (/api/arquivos/<id>)
```

- **Rascunho** (`src/lib/orcamento-rascunho.ts`): schema Zod (a "intenção
  de orçamento"), operações de edição por conversa (`definir_preco`,
  `remover_item`, `aumentar_percentual`, `definir_total`,
  `desconto_percentual`…), totais pelo `budget-calc`, guardrails pelas
  mesmas regras do módulo (`approvalTriggers`) e classificação de
  faltantes (obrigatório / recomendável / opcional). Um rascunho ativo por
  conversa; conversa e cartão manipulam o mesmo objeto.
- **Geração** (`orcamento-ia.ts` → `gerarPropostaDoRascunho`): só pela
  confirmação (AgentAction `gerar_proposta`). Passa por `submitBudget` — se
  as regras mandarem para aprovação interna, o orçamento fica criado
  aguardando e a proposta sai depois da aprovação, pelo módulo.
  `Budget.aiDraftId` marca o orçamento gerado por IA; o rascunho guarda
  modelo, fontes, referências e alterações (nunca chain-of-thought).
- **Base de conhecimento comercial** (`conhecimento-comercial.ts`,
  `QuoteKnowledge` + pgvector): uma linha por orçamento, campos
  estruturados + texto + embedding (`text-embedding-3-small`). Indexação
  automática ao salvar, submeter, aprovar, gerar proposta, registrar
  desfecho e converter em contrato (hash evita reprocessar). Botão
  "Reindexar" em Configurações → IA → Orçamentos.
- **Ranking híbrido** (`src/lib/ranking-comercial.ts`):
  `0,40 semântica + 0,30 estrutural (serviço, disciplina, segmento, região,
  porte, mesmo cliente) + 0,15 recência (decai em 3 anos) + 0,15 desfecho
  (convertida > aceita > sem desfecho > recusada)`. Sem embedding, a
  semântica vira similaridade de termos e o peso migra para o estrutural.
  Todo resultado sai com data e desfecho: **referência histórica, não
  preço atual**.
- **Parâmetros**: desconto máximo, margem mínima, valor limite e validade
  (já existiam) + prazo e forma de pagamento padrão (Configurações →
  Comercial). Configuração do agente em Configurações → IA → Orçamentos
  (`ai.quote.*`). Confirmação antes de gerar é sempre exigida; envio ao
  cliente pela IA não existe.
- **Explicabilidade**: `ver_rascunho_de_orcamento` devolve as referências
  (códigos, valores, datas, preço de tabela) — a resposta a "por que esse
  preço?".
- **Preparado, não implementado**: ingestão de documentos (TR/edital) —
  o extrator de texto do assistente de escopo já existe
  (`ai/extrair-documento.ts`) e pode alimentar `criar_rascunho`.
