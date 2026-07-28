-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "documentHash" TEXT,
ADD COLUMN     "signedElectronicallyAt" TIMESTAMP(3),
ADD COLUMN     "signerName" TEXT,
ADD COLUMN     "signerRegistration" TEXT,
ADD COLUMN     "verificationCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_verificationCode_key" ON "Proposal"("verificationCode");
