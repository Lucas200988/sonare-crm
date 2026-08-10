-- Diário de Obras (RDO) — Fase 1: diário, registros do dia, equipe e
-- equipamentos. O projeto marca se é obra (diaryEnabled) e ganha geofence.

ALTER TABLE "Project" ADD COLUMN "diaryEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN "siteAddress" TEXT;
ALTER TABLE "Project" ADD COLUMN "siteLat" DOUBLE PRECISION;
ALTER TABLE "Project" ADD COLUMN "siteLng" DOUBLE PRECISION;
ALTER TABLE "Project" ADD COLUMN "siteRadiusM" INTEGER;

CREATE TYPE "DiaryStatus" AS ENUM ('ABERTO', 'FINALIZADO', 'APROVADO');
CREATE TYPE "DiaryEntryKind" AS ENUM (
  'ATIVIDADE', 'OCORRENCIA', 'IMPEDIMENTO', 'ORIENTACAO',
  'VISITANTE', 'MATERIAL', 'OBSERVACAO'
);

CREATE TABLE "ConstructionDiary" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "diaryDate" TEXT NOT NULL,
    "status" "DiaryStatus" NOT NULL DEFAULT 'ABERTO',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "openLat" DOUBLE PRECISION,
    "openLng" DOUBLE PRECISION,
    "openAccuracy" DOUBLE PRECISION,
    "geofence" TEXT,
    "geofenceDistM" INTEGER,
    "weather" JSONB,
    "weatherBlocked" BOOLEAN NOT NULL DEFAULT false,
    "weatherNotes" TEXT,
    "narrative" TEXT,
    "notes" TEXT,
    "ignoredWarnings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "ConstructionDiary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiaryEntry" (
    "id" TEXT NOT NULL,
    "diaryId" TEXT NOT NULL,
    "kind" "DiaryEntryKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "happenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,
    "status" TEXT,
    "responsible" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "DiaryEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiaryWorkforce" (
    "id" TEXT NOT NULL,
    "diaryId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "company" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "startTime" TEXT,
    "endTime" TEXT,
    "notes" TEXT,
    CONSTRAINT "DiaryWorkforce_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiaryEquipment" (
    "id" TEXT NOT NULL,
    "diaryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "identification" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "hours" DECIMAL(9,4),
    "company" TEXT,
    "notes" TEXT,
    CONSTRAINT "DiaryEquipment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConstructionDiary_projectId_diaryDate_key" ON "ConstructionDiary"("projectId", "diaryDate");
CREATE UNIQUE INDEX "ConstructionDiary_companyId_code_key" ON "ConstructionDiary"("companyId", "code");
CREATE INDEX "ConstructionDiary_companyId_status_idx" ON "ConstructionDiary"("companyId", "status");
CREATE INDEX "DiaryEntry_diaryId_kind_idx" ON "DiaryEntry"("diaryId", "kind");
CREATE INDEX "DiaryWorkforce_diaryId_idx" ON "DiaryWorkforce"("diaryId");
CREATE INDEX "DiaryEquipment_diaryId_idx" ON "DiaryEquipment"("diaryId");

ALTER TABLE "ConstructionDiary" ADD CONSTRAINT "ConstructionDiary_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_diaryId_fkey"
  FOREIGN KEY ("diaryId") REFERENCES "ConstructionDiary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiaryWorkforce" ADD CONSTRAINT "DiaryWorkforce_diaryId_fkey"
  FOREIGN KEY ("diaryId") REFERENCES "ConstructionDiary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiaryEquipment" ADD CONSTRAINT "DiaryEquipment_diaryId_fkey"
  FOREIGN KEY ("diaryId") REFERENCES "ConstructionDiary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Permissões do módulo. Ninguém perde nada: leitura acompanha quem lê
-- projetos; escrita, quem escreve; aprovação, quem já aprova apontamentos.
INSERT INTO "Permission" ("id", "code", "description") VALUES
  (gen_random_uuid()::text, 'diary:read', 'Consultar diários de obra'),
  (gen_random_uuid()::text, 'diary:write', 'Preencher e finalizar diários de obra'),
  (gen_random_uuid()::text, 'diary:approve', 'Aprovar diários de obra')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT rp."roleId", nova."id"
FROM "RolePermission" rp
JOIN "Permission" base ON base."id" = rp."permissionId" AND base."code" = 'project:read'
CROSS JOIN "Permission" nova
WHERE nova."code" = 'diary:read'
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT rp."roleId", nova."id"
FROM "RolePermission" rp
JOIN "Permission" base ON base."id" = rp."permissionId" AND base."code" = 'project:write'
CROSS JOIN "Permission" nova
WHERE nova."code" = 'diary:write'
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT rp."roleId", nova."id"
FROM "RolePermission" rp
JOIN "Permission" base ON base."id" = rp."permissionId" AND base."code" = 'timeentry:approve'
CROSS JOIN "Permission" nova
WHERE nova."code" = 'diary:approve'
ON CONFLICT DO NOTHING;
