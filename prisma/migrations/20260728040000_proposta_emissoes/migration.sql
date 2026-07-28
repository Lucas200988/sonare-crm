-- Contagem de emissões do PDF da proposta (o número da proposta não muda ao reemitir)
ALTER TABLE "Proposal" ADD COLUMN "emissionCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Proposal" ADD COLUMN "lastEmittedAt" TIMESTAMP(3);
