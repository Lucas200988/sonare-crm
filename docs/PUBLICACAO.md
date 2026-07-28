# Publicação do SONARE CRM

Guia para colocar o sistema no ar. O caminho descrito usa **Vercel** (criadora do
Next.js) com o banco e o armazenamento no **Supabase** que já usamos.

## Por que publicar deixa o sistema rápido

Hoje o servidor roda no computador local (Cuiabá) e o banco fica na Virgínia:
cada consulta custa ~145 ms, e uma tela que faz 15 consultas leva ~1,4 s.

Publicado, o servidor passa a rodar na nuvem, **ao lado do banco**: a mesma
consulta cai para ~2 ms. Não é preciso migrar o banco de região.

---

## 1. Preparar o Supabase Storage

Os PDFs de propostas e contratos **não podem** ficar no disco do servidor: em
hospedagem na nuvem o disco é apagado a cada atualização e os documentos
emitidos se perderiam.

1. No painel do Supabase, abra **Storage → New bucket**
2. Nome: `documentos`
3. Deixe **Public bucket DESMARCADO** (os arquivos são servidos pelo sistema,
   que confere a sessão antes de entregar)
4. Em **Project Settings → API**, copie:
   - **Project URL** → `SUPABASE_URL`
   - Chave **`service_role`** → `SUPABASE_SERVICE_ROLE_KEY`

> A chave `service_role` dá acesso total ao projeto. Ela só é usada no servidor
> e nunca chega ao navegador. Não a compartilhe nem a coloque no código.

## 2. Enviar o código para o GitHub

```bash
git init
git add .
git commit -m "SONARE CRM"
```

Crie um repositório **privado** no GitHub e siga as instruções de `git remote add`.

O arquivo `.env` **não vai** para o repositório (está no `.gitignore`) — os
segredos são cadastrados direto na Vercel.

## 3. Publicar na Vercel

1. Acesse vercel.com, entre com a conta do GitHub e clique em **Add New → Project**
2. Selecione o repositório; a Vercel reconhece o Next.js sozinho
3. Em **Environment Variables**, cadastre:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | connection string do *Transaction pooler* (porta 6543) |
| `DIRECT_URL` | connection string do *Session pooler* (porta 5432) |
| `APP_SECRET` | gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `APP_URL` | endereço final, ex.: `https://crm.sonareengenharia.com.br` |
| `STORAGE_DRIVER` | `supabase` |
| `SUPABASE_URL` | Project URL do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | chave `service_role` |
| `SUPABASE_STORAGE_BUCKET` | `documentos` |
| `OPENAI_API_KEY` | opcional — a chave também pode ser cadastrada em Configurações |

4. Clique em **Deploy**

> **Região:** no plano gratuito o servidor fica em Washington (`iad1`), mesma
> região do banco — o que resolve a lentidão. No plano Pro é possível mover para
> São Paulo (`gru1`), reduzindo também o tempo de resposta para quem acessa do
> Brasil. Se mudar o servidor para São Paulo, considere recriar o banco em
> `sa-east-1` para que continuem juntos.

## 4. Domínio próprio

Em **Settings → Domains**, adicione `crm.sonareengenharia.com.br` e crie no seu
provedor de DNS o registro CNAME indicado pela Vercel. O certificado HTTPS é
emitido automaticamente. Depois, atualize `APP_URL` para esse endereço.

## 5. Primeiro acesso

Rode uma única vez, com o `.env` apontando para o banco de produção:

```bash
npx tsx scripts/preparar-producao.mjs "Lucas Silva Costa" lucas@sonareengenharia.com.br
```

O script cria seu usuário administrador com **senha forte gerada na hora**
(anote, ela não é exibida de novo), desativa as contas de demonstração e aponta
qualquer variável de ambiente pendente.

Depois entre no sistema e cadastre a equipe em **Usuários**.

## 6. Conferir se está tudo certo

Acesse `https://SEU-DOMINIO/api/health`. A resposta deve ser:

```json
{
  "status": "ok",
  "database": { "status": "ok", "latencyMs": 3 },
  "storage": { "driver": "supabase", "bucket": "documentos" },
  "appUrl": "https://crm.sonareengenharia.com.br"
}
```

`status: degraded` indica o problema no próprio corpo da resposta — storage
local em produção ou `APP_URL` apontando para localhost (que quebraria os QR
codes de conferência dos documentos).

---

## O que muda sem republicar

Isto fica no banco e pode ser alterado pela tela, valendo na hora:

- Dados da empresa, endereço, CNPJ, CREA e assinatura das propostas
- **Regras de aprovação** (desconto máximo, margem mínima, valor limite)
- **Validade padrão** da proposta
- **Textos das seções 6 e 7** da proposta (informações gerais e diferenciais)
- Catálogo de serviços, preços base e modelos de escopo
- Etapas do pipeline, origens de lead, motivos de perda, formas de pagamento
- Retenções tributárias
- Chave e modelo da IA
- Usuários, perfis de acesso e permissões extras

Exige alteração de código e nova publicação:

- Layout dos PDFs (cores, ordem das seções)
- Cláusulas dos modelos de contrato *(editor pela tela ainda não implementado)*
- Logo da empresa (arquivo em `public/brand/`)
- Criação de novos perfis de acesso *(os 7 existentes são editáveis só por código)*
- Novos campos e telas

## Atualizações

Cada `git push` publica automaticamente. Quando houver mudança no banco:

```bash
npx prisma migrate deploy
```

## Backup

O Supabase mantém backup diário automático. Para um backup manual:
**Database → Backups → Download**.
