-- Etapa que dispara a criação do projeto. Varia entre empresas: algumas
-- começam a trabalhar na aprovação, outras só com o contrato assinado.
ALTER TABLE "OpportunityStage" ADD COLUMN "createsProject" BOOLEAN NOT NULL DEFAULT false;

-- Padrão: a etapa de ganho, quando o trabalho começa sem margem de dúvida.
UPDATE "OpportunityStage" SET "createsProject" = true WHERE "kind" = 'GANHA';
