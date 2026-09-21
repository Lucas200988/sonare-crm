-- Jarvis comercial: rascunhos de orçamento por conversa e base de
-- conhecimento com busca semântica (pgvector, disponível no Supabase).
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "Budget" ADD COLUMN "aiDraftId" TEXT;

-- CreateTable
CREATE TABLE "AgentQuoteDraft" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EM_ELABORACAO',
    "dados" JSONB NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "modelo" TEXT,
    "fontes" JSONB,
    "alteracoes" JSONB,
    "budgetId" TEXT,
    "proposalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentQuoteDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteKnowledge" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "budgetVersionId" TEXT NOT NULL,
    "proposalId" TEXT,
    "budgetCode" TEXT NOT NULL,
    "proposalCode" TEXT,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "segment" TEXT,
    "city" TEXT,
    "state" TEXT,
    "serviceType" TEXT,
    "disciplines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "area" DOUBLE PRECISION,
    "itemsSummary" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "budgetStatus" TEXT NOT NULL,
    "proposalStatus" TEXT,
    "aprovada" BOOLEAN NOT NULL DEFAULT false,
    "recusada" BOOLEAN NOT NULL DEFAULT false,
    "convertida" BOOLEAN NOT NULL DEFAULT false,
    "issuedAt" TIMESTAMP(3),
    "contentHash" TEXT NOT NULL,
    "embedding" vector(1536),
    "embeddedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentQuoteDraft_companyId_threadId_status_idx" ON "AgentQuoteDraft"("companyId", "threadId", "status");
CREATE INDEX "AgentQuoteDraft_companyId_userId_updatedAt_idx" ON "AgentQuoteDraft"("companyId", "userId", "updatedAt");
CREATE UNIQUE INDEX "QuoteKnowledge_budgetId_key" ON "QuoteKnowledge"("budgetId");
CREATE INDEX "QuoteKnowledge_companyId_serviceType_idx" ON "QuoteKnowledge"("companyId", "serviceType");
CREATE INDEX "QuoteKnowledge_companyId_clientId_idx" ON "QuoteKnowledge"("companyId", "clientId");
CREATE INDEX "QuoteKnowledge_companyId_issuedAt_idx" ON "QuoteKnowledge"("companyId", "issuedAt");
-- base pequena hoje: busca vetorial exata; índice HNSW quando passar de alguns milhares
