-- Qual etapa do pipeline merece comemoração na tela.
ALTER TABLE "OpportunityStage" ADD COLUMN "celebrate" BOOLEAN NOT NULL DEFAULT false;

-- A vitória comercial é o "sim" do cliente. Onde ele acontece muda de quadro
-- para quadro: marca-se "Aprovado" quando existe e, na falta dele, a etapa de
-- ganho — que era o comportamento anterior.
UPDATE "OpportunityStage" SET "celebrate" = true
WHERE "name" = 'Aprovado';

UPDATE "OpportunityStage" s SET "celebrate" = true
WHERE s."kind" = 'GANHA'
  AND NOT EXISTS (
    SELECT 1 FROM "OpportunityStage" o
    WHERE o."companyId" = s."companyId" AND o."celebrate" = true
  );
