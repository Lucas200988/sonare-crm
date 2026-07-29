-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('DISPONIVEL', 'EM_USO', 'MANUTENCAO', 'BAIXADO');

-- CreateEnum
CREATE TYPE "EquipmentMovementKind" AS ENUM ('OBRA', 'EMPRESTIMO', 'ALUGUEL', 'MANUTENCAO');

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "category" TEXT,
    "status" "EquipmentStatus" NOT NULL DEFAULT 'DISPONIVEL',
    "purchaseDate" TIMESTAMP(3),
    "purchaseValue" DECIMAL(14,2),
    "calibrationDueAt" TIMESTAMP(3),
    "homeLocation" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentMovement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "kind" "EquipmentMovementKind" NOT NULL DEFAULT 'OBRA',
    "projectId" TEXT,
    "clientId" TEXT,
    "holderUserId" TEXT,
    "holderName" TEXT,
    "destination" TEXT,
    "checkedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedReturnAt" TIMESTAMP(3),
    "conditionOut" TEXT,
    "returnedAt" TIMESTAMP(3),
    "conditionIn" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "checkedOutById" TEXT,
    "returnedById" TEXT,

    CONSTRAINT "EquipmentMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Equipment_companyId_status_idx" ON "Equipment"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_companyId_code_key" ON "Equipment"("companyId", "code");

-- CreateIndex
CREATE INDEX "EquipmentMovement_companyId_returnedAt_idx" ON "EquipmentMovement"("companyId", "returnedAt");

-- CreateIndex
CREATE INDEX "EquipmentMovement_equipmentId_checkedOutAt_idx" ON "EquipmentMovement"("equipmentId", "checkedOutAt");

-- AddForeignKey
ALTER TABLE "EquipmentMovement" ADD CONSTRAINT "EquipmentMovement_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentMovement" ADD CONSTRAINT "EquipmentMovement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentMovement" ADD CONSTRAINT "EquipmentMovement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentMovement" ADD CONSTRAINT "EquipmentMovement_holderUserId_fkey" FOREIGN KEY ("holderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
