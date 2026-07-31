-- CreateEnum
CREATE TYPE "FollowUpKind" AS ENUM ('SEM_RETORNO', 'VISUALIZADA_SEM_DECISAO', 'VALIDADE_PROXIMA', 'EXPIRADA');

-- CreateEnum
CREATE TYPE "FollowUpChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'INTERNO');

-- CreateTable
CREATE TABLE "FollowUpEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "kind" "FollowUpKind" NOT NULL,
    "channel" "FollowUpChannel" NOT NULL,
    "recipient" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "FollowUpEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FollowUpEvent_companyId_proposalId_idx" ON "FollowUpEvent"("companyId", "proposalId");

-- CreateIndex
CREATE INDEX "FollowUpEvent_proposalId_kind_idx" ON "FollowUpEvent"("proposalId", "kind");

-- AddForeignKey
ALTER TABLE "FollowUpEvent" ADD CONSTRAINT "FollowUpEvent_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
