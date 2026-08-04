-- Toda abertura do link público da proposta passa a contar, não só a primeira.
ALTER TABLE "Proposal" ADD COLUMN "lastViewedAt" TIMESTAMP(3);
ALTER TABLE "Proposal" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;

-- Quem já tinha sido aberto começa com a data e a contagem que se sabe.
UPDATE "Proposal" SET "lastViewedAt" = "viewedAt", "viewCount" = 1 WHERE "viewedAt" IS NOT NULL;
