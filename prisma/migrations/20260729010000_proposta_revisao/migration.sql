-- Renegociação comercial: a proposta mantém o número e ganha "Rev. NN".
-- 0 = oferta original.
ALTER TABLE "Proposal" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
