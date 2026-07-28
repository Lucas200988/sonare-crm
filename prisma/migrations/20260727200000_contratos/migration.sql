-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "contractLegalName" TEXT,
ADD COLUMN     "legalRepresentatives" JSONB;

-- AlterTable
ALTER TABLE "ContractTemplate" DROP COLUMN "html",
ADD COLUMN     "clauses" JSONB NOT NULL,
ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'OUTRO',
ADD COLUMN     "preamble" TEXT;

-- AlterTable
ALTER TABLE "ContractVersion" ADD COLUMN     "documentHash" TEXT,
ADD COLUMN     "verificationCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ContractVersion_verificationCode_key" ON "ContractVersion"("verificationCode");
