-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('ENVIADO', 'ENTREGUE', 'ABERTO', 'CLIQUE', 'REJEITADO', 'SPAM', 'ATRASADO');

-- CreateTable
CREATE TABLE "EmailDelivery" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "para" TEXT NOT NULL,
    "assunto" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'ENVIADO',
    "entityType" TEXT,
    "entityId" TEXT,
    "detalhe" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailDelivery_providerId_key" ON "EmailDelivery"("providerId");

-- CreateIndex
CREATE INDEX "EmailDelivery_companyId_entityType_entityId_idx" ON "EmailDelivery"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "EmailDelivery_companyId_status_idx" ON "EmailDelivery"("companyId", "status");
