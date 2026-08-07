-- Processo de aprovação em órgão externo (concessionária), com os prazos que
-- correm contra o órgão a partir de cada protocolo.
CREATE TYPE "ExternalApprovalKind" AS ENUM ('CONCESSIONARIA');
CREATE TYPE "ExternalApprovalStatus" AS ENUM ('EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO');
CREATE TYPE "ApprovalStepStatus" AS ENUM ('PENDENTE', 'AGUARDANDO_CONCESSIONARIA', 'CONCLUIDO', 'DISPENSADO');

CREATE TABLE "ExternalApproval" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ExternalApprovalKind" NOT NULL DEFAULT 'CONCESSIONARIA',
    "orgao" TEXT NOT NULL,
    "status" "ExternalApprovalStatus" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ExternalApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalApprovalStep" (
    "id" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ApprovalStepStatus" NOT NULL DEFAULT 'PENDENTE',
    "protocol" TEXT,
    "protocolAt" TIMESTAMP(3),
    "deadlineDays" INTEGER,
    "respondedAt" TIMESTAMP(3),
    "chargedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalApprovalStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExternalApproval_companyId_status_idx" ON "ExternalApproval"("companyId", "status");
CREATE INDEX "ExternalApprovalStep_approvalId_sortOrder_idx" ON "ExternalApprovalStep"("approvalId", "sortOrder");

ALTER TABLE "ExternalApproval" ADD CONSTRAINT "ExternalApproval_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalApprovalStep" ADD CONSTRAINT "ExternalApprovalStep_approvalId_fkey"
  FOREIGN KEY ("approvalId") REFERENCES "ExternalApproval"("id") ON DELETE CASCADE ON UPDATE CASCADE;
