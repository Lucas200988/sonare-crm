-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'CURRENCY', 'DATE', 'SELECT', 'MULTI_SELECT', 'BOOLEAN', 'EMAIL', 'PHONE', 'URL', 'LONG_TEXT');

-- CreateEnum
CREATE TYPE "PersonType" AS ENUM ('FISICA', 'JURIDICA');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ATIVO', 'INATIVO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "StageKind" AS ENUM ('ABERTA', 'GANHA', 'PERDIDA', 'SUSPENSA');

-- CreateEnum
CREATE TYPE "PriorityLevel" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('LIGACAO', 'REUNIAO', 'VISITA_TECNICA', 'MENSAGEM', 'EMAIL', 'TAREFA', 'LEMBRETE', 'ENVIO_DOCUMENTO', 'FOLLOW_UP', 'NEGOCIACAO', 'DECISAO');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('PENDENTE', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('RASCUNHO', 'EM_REVISAO', 'APROVACAO_INTERNA', 'APROVADO', 'RECUSADO', 'EXPIRADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDENTE', 'APROVADA', 'RECUSADA');

-- CreateEnum
CREATE TYPE "ProposalType" AS ENUM ('COMERCIAL', 'TECNICA', 'UNIFICADA');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('RASCUNHO', 'ENVIADA', 'VISUALIZADA', 'ACEITA', 'RECUSADA', 'EXPIRADA');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('MINUTA', 'EM_REVISAO_INTERNA', 'AGUARDANDO_APROVACAO', 'ENVIADO_AO_CLIENTE', 'EM_NEGOCIACAO', 'AGUARDANDO_ASSINATURA', 'ASSINADO', 'VIGENTE', 'SUSPENSO', 'ENCERRADO', 'RESCINDIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "AmendmentType" AS ENUM ('VALOR', 'PRAZO', 'ESCOPO', 'FORMA_PAGAMENTO', 'RESPONSABILIDADE', 'SUSPENSAO', 'RETOMADA', 'RESCISAO');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('AGUARDANDO_INICIO', 'EM_MOBILIZACAO', 'AGUARDANDO_DOCUMENTOS', 'EM_LEVANTAMENTO', 'EM_DESENVOLVIMENTO', 'EM_REVISAO_INTERNA', 'ENVIADO_AO_CLIENTE', 'AGUARDANDO_APROVACAO', 'EM_REVISAO_DO_CLIENTE', 'EM_APROVACAO_EXTERNA', 'AGUARDANDO_CONCESSIONARIA', 'AGUARDANDO_ORGAO_PUBLICO', 'SUSPENSO', 'CONCLUIDO', 'ENCERRADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('A_FAZER', 'EM_ANDAMENTO', 'EM_REVISAO', 'BLOQUEADA', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "DeliverableStatus" AS ENUM ('PENDENTE', 'EM_ELABORACAO', 'EM_REVISAO', 'EMITIDO', 'APROVADO', 'REPROVADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('EM_ELABORACAO', 'EMITIDA', 'APROVADA', 'REPROVADA', 'SUBSTITUIDA');

-- CreateEnum
CREATE TYPE "TechRespStatus" AS ENUM ('PENDENTE', 'EMITIDA', 'BAIXADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "PendencyStatus" AS ENUM ('ABERTA', 'RECEBIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ReceivableStatus" AS ENUM ('PREVISTO', 'A_FATURAR', 'AGUARDANDO_AUTORIZACAO', 'NF_EMITIDA', 'ENVIADO_AO_CLIENTE', 'A_VENCER', 'VENCIDO', 'PARCIALMENTE_RECEBIDO', 'RECEBIDO', 'RENEGOCIADO', 'CANCELADO', 'EM_COBRANCA', 'INADIMPLENTE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('REGISTRADA', 'EMITIDA', 'ENVIADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "CollectionEventType" AS ENUM ('LEMBRETE_PRE_VENCIMENTO', 'AVISO_VENCIMENTO', 'PRIMEIRO_AVISO_ATRASO', 'SEGUNDO_AVISO_ATRASO', 'COBRANCA_FORMAL', 'RENEGOCIACAO', 'ENCAMINHAMENTO_JURIDICO');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDENTE', 'VALIDANDO', 'PRONTO_PARA_IMPORTAR', 'IMPORTANDO', 'CONCLUIDO', 'FALHOU', 'CANCELADO');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "cnpj" TEXT,
    "stateRegistration" TEXT,
    "cityRegistration" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "website" TEXT,
    "addressStreet" TEXT,
    "addressNumber" TEXT,
    "addressComplement" TEXT,
    "addressDistrict" TEXT,
    "zipCode" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'Brasil',
    "logoAttachmentId" TEXT,
    "bankInfo" JSONB,
    "crea" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Cuiaba',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "passwordChangedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "hourlyCost" DECIMAL(14,2),
    "hourlyRate" DECIMAL(14,2),
    "creaCau" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "UserPermission" (
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("userId","permissionId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomField" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fieldType" "CustomFieldType" NOT NULL,
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldValue" (
    "id" TEXT NOT NULL,
    "customFieldId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT,
    "personType" "PersonType" NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "cpf" TEXT,
    "cnpj" TEXT,
    "stateRegistration" TEXT,
    "cityRegistration" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "website" TEXT,
    "addressStreet" TEXT,
    "addressNumber" TEXT,
    "addressComplement" TEXT,
    "addressDistrict" TEXT,
    "zipCode" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'Brasil',
    "notes" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'ATIVO',
    "leadSourceId" TEXT,
    "segment" TEXT,
    "firstContactAt" TIMESTAMP(3),
    "commercialOwnerId" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "department" TEXT,
    "decisionMaker" BOOLEAN NOT NULL DEFAULT false,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isFinancial" BOOLEAN NOT NULL DEFAULT false,
    "isTechnical" BOOLEAN NOT NULL DEFAULT false,
    "isContractual" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientUnit" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitType" TEXT,
    "consumerUnit" TEXT,
    "addressStreet" TEXT,
    "addressNumber" TEXT,
    "addressDistrict" TEXT,
    "zipCode" TEXT,
    "city" TEXT,
    "state" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ClientUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadSource" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LeadSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityStage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "StageKind" NOT NULL DEFAULT 'ABERTA',
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "OpportunityStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientUnitId" TEXT,
    "primaryContactId" TEXT,
    "description" TEXT,
    "serviceCatalogId" TEXT,
    "discipline" TEXT,
    "commercialOwnerId" TEXT,
    "technicalOwnerId" TEXT,
    "leadSourceId" TEXT,
    "estimatedValue" DECIMAL(14,2),
    "probability" DECIMAL(9,4),
    "expectedCloseDate" TIMESTAMP(3),
    "estimatedDuration" TEXT,
    "priority" "PriorityLevel" NOT NULL DEFAULT 'MEDIA',
    "competitors" TEXT,
    "hiringReason" TEXT,
    "clientNeed" TEXT,
    "nextAction" TEXT,
    "nextActionDate" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "checklist" JSONB,
    "stageId" TEXT NOT NULL,
    "boardPosition" INTEGER NOT NULL DEFAULT 0,
    "lossReasonId" TEXT,
    "lossNotes" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityActivity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "clientId" TEXT,
    "activityType" "ActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "responsibleId" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" "ActivityStatus" NOT NULL DEFAULT 'PENDENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "OpportunityActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LossReason" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LossReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCatalog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "discipline" TEXT,
    "unit" TEXT,
    "defaultPrice" DECIMAL(14,2),
    "estimatedCost" DECIMAL(14,2),
    "estimatedHours" DECIMAL(9,4),
    "scopeTemplate" TEXT,
    "premisesTemplate" TEXT,
    "exclusionsTemplate" TEXT,
    "deliverables" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ServiceCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "opportunityId" TEXT,
    "clientId" TEXT NOT NULL,
    "clientUnitId" TEXT,
    "commercialOwnerId" TEXT,
    "technicalOwnerId" TEXT,
    "status" "BudgetStatus" NOT NULL DEFAULT 'RASCUNHO',
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetVersion" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "validUntil" TIMESTAMP(3),
    "serviceType" TEXT,
    "scope" TEXT,
    "premises" TEXT,
    "exclusions" TEXT,
    "referenceDocuments" TEXT,
    "executionDeadline" TEXT,
    "deliveryMethod" TEXT,
    "paymentTerms" TEXT,
    "paymentSchedule" JSONB,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "surcharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxes" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "estimatedRetentions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grossMargin" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "marginPercent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "internalNotes" TEXT,
    "clientNotes" TEXT,
    "changeReason" TEXT,
    "immutable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "BudgetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetItem" (
    "id" TEXT NOT NULL,
    "budgetVersionId" TEXT NOT NULL,
    "serviceCatalogId" TEXT,
    "description" TEXT NOT NULL,
    "discipline" TEXT,
    "stage" TEXT,
    "itemType" TEXT,
    "unit" TEXT,
    "quantity" DECIMAL(9,4) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BudgetItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetApproval" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "ruleTriggered" TEXT NOT NULL,
    "requestedById" TEXT,
    "decidedById" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDENTE',
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "budgetVersionId" TEXT NOT NULL,
    "templateId" TEXT,
    "proposalType" "ProposalType" NOT NULL DEFAULT 'UNIFICADA',
    "status" "ProposalStatus" NOT NULL DEFAULT 'RASCUNHO',
    "pdfAttachmentId" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentVia" TEXT,
    "recipients" TEXT,
    "viewedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "negotiationNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "proposalType" "ProposalType" NOT NULL DEFAULT 'UNIFICADA',
    "html" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "contractNumber" TEXT,
    "clientId" TEXT NOT NULL,
    "clientUnitId" TEXT,
    "proposalId" TEXT,
    "budgetId" TEXT,
    "subject" TEXT NOT NULL,
    "scope" TEXT,
    "totalValue" DECIMAL(14,2) NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "durationDays" INTEGER,
    "paymentTerms" TEXT,
    "paymentSchedule" JSONB,
    "adjustmentIndex" TEXT,
    "baseDate" TIMESTAMP(3),
    "penalties" TEXT,
    "guarantees" TEXT,
    "retentions" TEXT,
    "obligations" TEXT,
    "terminationTerms" TEXT,
    "jurisdiction" TEXT,
    "witnesses" JSONB,
    "status" "ContractStatus" NOT NULL DEFAULT 'MINUTA',
    "templateId" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractVersion" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "pdfAttachmentId" TEXT,
    "variables" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "ContractVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractAmendment" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "amendmentType" "AmendmentType" NOT NULL,
    "description" TEXT NOT NULL,
    "valueDelta" DECIMAL(14,2),
    "newEndDate" TIMESTAMP(3),
    "pdfAttachmentId" TEXT,
    "status" "ContractStatus" NOT NULL DEFAULT 'MINUTA',
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ContractAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractSignature" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerRole" TEXT,
    "signerEmail" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedFileId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serviceType" TEXT,
    "html" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientUnitId" TEXT,
    "contractId" TEXT,
    "budgetId" TEXT,
    "technicalLeadId" TEXT,
    "coordinatorId" TEXT,
    "disciplines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startDate" TIMESTAMP(3),
    "contractualDeadline" TIMESTAMP(3),
    "expectedEndDate" TIMESTAMP(3),
    "actualEndDate" TIMESTAMP(3),
    "contractValue" DECIMAL(14,2),
    "status" "ProjectStatus" NOT NULL DEFAULT 'AGUARDANDO_INICIO',
    "priority" "PriorityLevel" NOT NULL DEFAULT 'MEDIA',
    "progressPercent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "risks" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectStage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "StageStatus" NOT NULL DEFAULT 'PENDENTE',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "ProjectStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleInProject" TEXT,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "stageId" TEXT,
    "deliverableId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeId" TEXT,
    "collaborators" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priority" "PriorityLevel" NOT NULL DEFAULT 'MEDIA',
    "startDate" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'A_FAZER',
    "estimatedHours" DECIMAL(9,4),
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dependsOnIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "boardPosition" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskChecklistItem" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TaskChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stageId" TEXT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "discipline" TEXT,
    "description" TEXT,
    "responsibleId" TEXT,
    "dueAt" TIMESTAMP(3),
    "status" "DeliverableStatus" NOT NULL DEFAULT 'PENDENTE',
    "currentRevision" TEXT,
    "issuedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "dependsOnIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Deliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverableRevision" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "revisionCode" TEXT NOT NULL,
    "revisionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responsibleId" TEXT,
    "reason" TEXT,
    "changes" TEXT,
    "attachmentId" TEXT,
    "status" "RevisionStatus" NOT NULL DEFAULT 'EM_ELABORACAO',
    "clientComments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "DeliverableRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,
    "workDate" TIMESTAMP(3) NOT NULL,
    "hours" DECIMAL(9,4) NOT NULL,
    "description" TEXT,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "hourlyCost" DECIMAL(14,2),
    "hourlyRate" DECIMAL(14,2),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicalResponsibility" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "number" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "council" TEXT,
    "professionalId" TEXT,
    "professionalName" TEXT,
    "registration" TEXT,
    "issuedAt" TIMESTAMP(3),
    "value" DECIMAL(14,2),
    "status" "TechRespStatus" NOT NULL DEFAULT 'PENDENTE',
    "serviceDescription" TEXT,
    "attachmentId" TEXT,
    "dischargedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TechnicalResponsibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPendency" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "clientContact" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "impact" TEXT,
    "status" "PendencyStatus" NOT NULL DEFAULT 'ABERTA',
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPendency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "category" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receivable" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "contractId" TEXT,
    "projectId" TEXT,
    "clientId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL DEFAULT 1,
    "competenceDate" TIMESTAMP(3),
    "issueDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3) NOT NULL,
    "grossValue" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "surcharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "retentions" JSONB,
    "retentionsTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netValue" DECIMAL(14,2) NOT NULL,
    "status" "ReceivableStatus" NOT NULL DEFAULT 'PREVISTO',
    "paymentMethodId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Receivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "interest" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "fine" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bankFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "retentions" JSONB,
    "retentionsTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialRetention" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FinancialRetention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "series" TEXT,
    "issuerCity" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "competenceDate" TIMESTAMP(3),
    "clientId" TEXT NOT NULL,
    "contractId" TEXT,
    "projectId" TEXT,
    "grossValue" DECIMAL(14,2) NOT NULL,
    "deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "retentions" JSONB,
    "retentionsTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netValue" DECIMAL(14,2) NOT NULL,
    "serviceCode" TEXT,
    "serviceDescription" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'REGISTRADA',
    "pdfAttachmentId" TEXT,
    "xmlAttachmentId" TEXT,
    "externalLink" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceReceivable" (
    "invoiceId" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "amount" DECIMAL(14,2),

    CONSTRAINT "InvoiceReceivable_pkey" PRIMARY KEY ("invoiceId","receivableId")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "eventType" "CollectionEventType" NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT,
    "templateUsed" TEXT,
    "notes" TEXT,
    "createdById" TEXT,

    CONSTRAINT "CollectionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "fileName" TEXT,
    "mapping" JSONB,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDENTE',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "report" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportError" (
    "id" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "field" TEXT,
    "message" TEXT NOT NULL,
    "rawData" JSONB,

    CONSTRAINT "ImportError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_cnpj_key" ON "Company"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_companyId_code_key" ON "Role"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_entityType_entityId_idx" ON "AuditLog"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_companyId_key_key" ON "SystemSetting"("companyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSequence_companyId_type_year_key" ON "DocumentSequence"("companyId", "type", "year");

-- CreateIndex
CREATE INDEX "CustomField_companyId_entityType_idx" ON "CustomField"("companyId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldValue_customFieldId_entityId_key" ON "CustomFieldValue"("customFieldId", "entityId");

-- CreateIndex
CREATE INDEX "Client_companyId_status_idx" ON "Client"("companyId", "status");

-- CreateIndex
CREATE INDEX "Client_companyId_cnpj_idx" ON "Client"("companyId", "cnpj");

-- CreateIndex
CREATE INDEX "Client_companyId_cpf_idx" ON "Client"("companyId", "cpf");

-- CreateIndex
CREATE INDEX "ClientContact_clientId_idx" ON "ClientContact"("clientId");

-- CreateIndex
CREATE INDEX "ClientUnit_clientId_idx" ON "ClientUnit"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadSource_companyId_name_key" ON "LeadSource"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityStage_companyId_name_key" ON "OpportunityStage"("companyId", "name");

-- CreateIndex
CREATE INDEX "Opportunity_companyId_stageId_idx" ON "Opportunity"("companyId", "stageId");

-- CreateIndex
CREATE INDEX "Opportunity_clientId_idx" ON "Opportunity"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_companyId_code_key" ON "Opportunity"("companyId", "code");

-- CreateIndex
CREATE INDEX "OpportunityActivity_companyId_status_dueAt_idx" ON "OpportunityActivity"("companyId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "OpportunityActivity_opportunityId_idx" ON "OpportunityActivity"("opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "LossReason_companyId_name_key" ON "LossReason"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCatalog_companyId_code_key" ON "ServiceCatalog"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_currentVersionId_key" ON "Budget"("currentVersionId");

-- CreateIndex
CREATE INDEX "Budget_clientId_idx" ON "Budget"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_companyId_code_key" ON "Budget"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetVersion_budgetId_versionNumber_key" ON "BudgetVersion"("budgetId", "versionNumber");

-- CreateIndex
CREATE INDEX "BudgetItem_budgetVersionId_idx" ON "BudgetItem"("budgetVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_companyId_code_key" ON "Proposal"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalTemplate_companyId_name_key" ON "ProposalTemplate"("companyId", "name");

-- CreateIndex
CREATE INDEX "Contract_clientId_status_idx" ON "Contract"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_companyId_code_key" ON "Contract"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ContractVersion_contractId_versionNumber_key" ON "ContractVersion"("contractId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ContractAmendment_contractId_number_key" ON "ContractAmendment"("contractId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ContractTemplate_companyId_name_key" ON "ContractTemplate"("companyId", "name");

-- CreateIndex
CREATE INDEX "Project_clientId_status_idx" ON "Project"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Project_companyId_code_key" ON "Project"("companyId", "code");

-- CreateIndex
CREATE INDEX "ProjectStage_projectId_idx" ON "ProjectStage"("projectId");

-- CreateIndex
CREATE INDEX "Task_companyId_status_dueAt_idx" ON "Task"("companyId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- CreateIndex
CREATE INDEX "Deliverable_projectId_idx" ON "Deliverable"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliverableRevision_deliverableId_revisionCode_key" ON "DeliverableRevision"("deliverableId", "revisionCode");

-- CreateIndex
CREATE INDEX "TimeEntry_projectId_workDate_idx" ON "TimeEntry"("projectId", "workDate");

-- CreateIndex
CREATE INDEX "TimeEntry_userId_workDate_idx" ON "TimeEntry"("userId", "workDate");

-- CreateIndex
CREATE INDEX "TechnicalResponsibility_companyId_status_idx" ON "TechnicalResponsibility"("companyId", "status");

-- CreateIndex
CREATE INDEX "ClientPendency_projectId_status_idx" ON "ClientPendency"("projectId", "status");

-- CreateIndex
CREATE INDEX "Attachment_companyId_entityType_entityId_idx" ON "Attachment"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Comment_companyId_entityType_entityId_idx" ON "Comment"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Receivable_companyId_status_dueDate_idx" ON "Receivable"("companyId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Receivable_clientId_idx" ON "Receivable"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Receivable_companyId_code_key" ON "Receivable"("companyId", "code");

-- CreateIndex
CREATE INDEX "Receipt_receivableId_idx" ON "Receipt"("receivableId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialRetention_companyId_code_key" ON "FinancialRetention"("companyId", "code");

-- CreateIndex
CREATE INDEX "Invoice_clientId_idx" ON "Invoice"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_companyId_number_series_key" ON "Invoice"("companyId", "number", "series");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_companyId_name_key" ON "PaymentMethod"("companyId", "name");

-- CreateIndex
CREATE INDEX "CollectionEvent_receivableId_idx" ON "CollectionEvent"("receivableId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_leadSourceId_fkey" FOREIGN KEY ("leadSourceId") REFERENCES "LeadSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_commercialOwnerId_fkey" FOREIGN KEY ("commercialOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientUnit" ADD CONSTRAINT "ClientUnit_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_clientUnitId_fkey" FOREIGN KEY ("clientUnitId") REFERENCES "ClientUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "ClientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_serviceCatalogId_fkey" FOREIGN KEY ("serviceCatalogId") REFERENCES "ServiceCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_commercialOwnerId_fkey" FOREIGN KEY ("commercialOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_technicalOwnerId_fkey" FOREIGN KEY ("technicalOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_leadSourceId_fkey" FOREIGN KEY ("leadSourceId") REFERENCES "LeadSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "OpportunityStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_lossReasonId_fkey" FOREIGN KEY ("lossReasonId") REFERENCES "LossReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityActivity" ADD CONSTRAINT "OpportunityActivity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityActivity" ADD CONSTRAINT "OpportunityActivity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityActivity" ADD CONSTRAINT "OpportunityActivity_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_clientUnitId_fkey" FOREIGN KEY ("clientUnitId") REFERENCES "ClientUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_commercialOwnerId_fkey" FOREIGN KEY ("commercialOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_technicalOwnerId_fkey" FOREIGN KEY ("technicalOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "BudgetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetVersion" ADD CONSTRAINT "BudgetVersion_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetItem" ADD CONSTRAINT "BudgetItem_budgetVersionId_fkey" FOREIGN KEY ("budgetVersionId") REFERENCES "BudgetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetItem" ADD CONSTRAINT "BudgetItem_serviceCatalogId_fkey" FOREIGN KEY ("serviceCatalogId") REFERENCES "ServiceCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetApproval" ADD CONSTRAINT "BudgetApproval_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetApproval" ADD CONSTRAINT "BudgetApproval_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetApproval" ADD CONSTRAINT "BudgetApproval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_budgetVersionId_fkey" FOREIGN KEY ("budgetVersionId") REFERENCES "BudgetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProposalTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_clientUnitId_fkey" FOREIGN KEY ("clientUnitId") REFERENCES "ClientUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractVersion" ADD CONSTRAINT "ContractVersion_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAmendment" ADD CONSTRAINT "ContractAmendment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientUnitId_fkey" FOREIGN KEY ("clientUnitId") REFERENCES "ClientUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_technicalLeadId_fkey" FOREIGN KEY ("technicalLeadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStage" ADD CONSTRAINT "ProjectStage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProjectStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskChecklistItem" ADD CONSTRAINT "TaskChecklistItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProjectStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableRevision" ADD CONSTRAINT "DeliverableRevision_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicalResponsibility" ADD CONSTRAINT "TechnicalResponsibility_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicalResponsibility" ADD CONSTRAINT "TechnicalResponsibility_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPendency" ADD CONSTRAINT "ClientPendency_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "Receivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceReceivable" ADD CONSTRAINT "InvoiceReceivable_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceReceivable" ADD CONSTRAINT "InvoiceReceivable_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "Receivable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionEvent" ADD CONSTRAINT "CollectionEvent_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "Receivable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportError" ADD CONSTRAINT "ImportError_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
