-- Fase 2 do RDO: fotografias com hash, original preservado e derivadas.
CREATE TYPE "PhotoSource" AS ENUM ('APP_CAMERA', 'GALLERY_IMPORT', 'FILE_UPLOAD');

CREATE TABLE "SitePhoto" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "diaryId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "originalAttachmentId" TEXT NOT NULL,
    "viewAttachmentId" TEXT,
    "thumbAttachmentId" TEXT,
    "capturedAtDevice" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "captureSource" "PhotoSource" NOT NULL DEFAULT 'APP_CAMERA',
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sha256" TEXT NOT NULL,
    "exif" JSONB,
    "deviceInfo" TEXT,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deleteReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SitePhoto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SitePhoto_diaryId_seq_key" ON "SitePhoto"("diaryId", "seq");
CREATE INDEX "SitePhoto_projectId_deletedAt_idx" ON "SitePhoto"("projectId", "deletedAt");

ALTER TABLE "SitePhoto" ADD CONSTRAINT "SitePhoto_diaryId_fkey"
  FOREIGN KEY ("diaryId") REFERENCES "ConstructionDiary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
