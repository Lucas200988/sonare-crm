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

## Fase 4 — WhatsApp (pendente)

`conversar()` já recebe `canal` (CRM | WHATSAPP | CRON | EMAIL); um adapter
de canal chama a mesma função.

## Testes

`conversa.test.ts` (loop com provider mockado: execução, teto de ciclos,
resposta direta, métricas, erro) e `manager-tools.test.ts` (allowlist,
RBAC de oferta e de execução, Zod, falha sem vazamento). A suíte nunca
chama a OpenAI real.
