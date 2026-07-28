-- Contas a pagar
CREATE TYPE "PayableStatus" AS ENUM ('A_PAGAR', 'PAGO', 'CANCELADO');

CREATE TABLE "Payable" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "supplier" TEXT,
    "category" TEXT,
    "projectId" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paidAmount" DECIMAL(14,2),
    "status" "PayableStatus" NOT NULL DEFAULT 'A_PAGAR',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Payable_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Payable_companyId_status_dueDate_idx" ON "Payable"("companyId", "status", "dueDate");

ALTER TABLE "Payable" ADD CONSTRAINT "Payable_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
