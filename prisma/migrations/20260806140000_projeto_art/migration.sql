-- Decisão do gestor sobre a necessidade de ART/RRT em cada projeto.
-- O número da ART continua no módulo próprio; aqui mora só a decisão.
CREATE TYPE "ArtStatus" AS ENUM ('NAO_INFORMADO', 'NECESSARIA', 'DISPENSADA');

ALTER TABLE "Project" ADD COLUMN "artStatus" "ArtStatus" NOT NULL DEFAULT 'NAO_INFORMADO';
ALTER TABLE "Project" ADD COLUMN "artNotes" TEXT;

-- Projeto que já tem ART registrada não precisa da pergunta: a decisão está
-- tomada na prática, e obrigar o gestor a reconfirmar seria burocracia.
UPDATE "Project" p SET "artStatus" = 'NECESSARIA'
WHERE EXISTS (
  SELECT 1 FROM "TechnicalResponsibility" t
  WHERE t."projectId" = p."id" AND t."deletedAt" IS NULL
);
