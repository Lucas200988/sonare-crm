-- AlterTable
ALTER TABLE "ConstructionDiary" ADD COLUMN     "documentHash" TEXT,
ADD COLUMN     "verificationCode" TEXT;

-- AlterTable
ALTER TABLE "DiaryWorkforce" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'PROPRIA';

-- CreateTable
CREATE TABLE "DiarySignature" (
    "id" TEXT NOT NULL,
    "diaryId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registration" TEXT,
    "signedById" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiarySignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiaryFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "diaryId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "description" TEXT,
    "attachmentId" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deleteReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiaryFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiarySignature_diaryId_role_key" ON "DiarySignature"("diaryId", "role");

-- CreateIndex
CREATE INDEX "DiaryFile_diaryId_kind_idx" ON "DiaryFile"("diaryId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ConstructionDiary_verificationCode_key" ON "ConstructionDiary"("verificationCode");

-- AddForeignKey
ALTER TABLE "DiarySignature" ADD CONSTRAINT "DiarySignature_diaryId_fkey" FOREIGN KEY ("diaryId") REFERENCES "ConstructionDiary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryFile" ADD CONSTRAINT "DiaryFile_diaryId_fkey" FOREIGN KEY ("diaryId") REFERENCES "ConstructionDiary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
