-- CreateEnum
CREATE TYPE "Role" AS ENUM ('viewer', 'editor', 'reviewer', 'admin');

-- CreateEnum
CREATE TYPE "DataClassification" AS ENUM ('public', 'internal', 'confidential', 'restricted');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('public_web', 'product_doc', 'regulatory_text', 'interview', 'synthetic_demo');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('active', 'changed', 'invalid');

-- CreateEnum
CREATE TYPE "ClaimState" AS ENUM ('draft', 'pending_review', 'approved', 'rejected', 'stale');

-- CreateEnum
CREATE TYPE "ClaimCategory" AS ENUM ('product_capability', 'compliance', 'security', 'comparative', 'commercial', 'regulatory');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('messaging_framework', 'competitive_battlecard', 'regulatory_gtm_brief', 'product_intelligence_brief');

-- CreateEnum
CREATE TYPE "AssetState" AS ENUM ('draft', 'pending_review', 'changes_requested', 'approved', 'archived');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('created', 'queued', 'running', 'validation', 'pending_review', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('approved', 'rejected', 'changes_requested');

-- CreateEnum
CREATE TYPE "GenerationMode" AS ENUM ('live', 'simulated');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "maxExternalModelClass" "DataClassification" NOT NULL DEFAULT 'internal',
    "externalModelsApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductFeature" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "publisher" TEXT,
    "classification" "DataClassification" NOT NULL DEFAULT 'internal',
    "status" "SourceStatus" NOT NULL DEFAULT 'active',
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "retrievedAt" TIMESTAMP(3),
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "featureId" TEXT,
    "text" TEXT NOT NULL,
    "category" "ClaimCategory" NOT NULL,
    "state" "ClaimState" NOT NULL DEFAULT 'draft',
    "reviewerId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "reviewDueAt" TIMESTAMP(3),
    "staleReason" TEXT,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimEvidence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "locator" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "goals" TEXT[],
    "concerns" TEXT[],
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerProblem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "severity" INTEGER NOT NULL DEFAULT 3,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerProblem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValueProposition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "buyerProblemId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ValueProposition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValuePropositionClaim" (
    "tenantId" TEXT NOT NULL,
    "valuePropositionId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,

    CONSTRAINT "ValuePropositionClaim_pkey" PRIMARY KEY ("valuePropositionId","claimId")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "isPlaceholder" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorEvidence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "assertion" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "locator" TEXT,
    "state" "ClaimState" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitorEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryTrigger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sourceIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatoryTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "title" TEXT NOT NULL,
    "state" "AssetState" NOT NULL DEFAULT 'draft',
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "gateReport" JSONB NOT NULL,
    "gatesPassed" BOOLEAN NOT NULL,
    "generationMode" "GenerationMode" NOT NULL,
    "workflowRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'created',
    "idempotencyKey" TEXT NOT NULL,
    "generationMode" "GenerationMode" NOT NULL,
    "modelId" TEXT,
    "promptVersions" JSONB NOT NULL,
    "inputRefs" JSONB NOT NULL,
    "usage" JSONB,
    "costEstimateUsd" DECIMAL(10,4),
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetVersionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_tenantId_userId_key" ON "Membership"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_id_tenantId_key" ON "Product"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ProductFeature_tenantId_productId_idx" ON "ProductFeature"("tenantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductFeature_id_tenantId_key" ON "ProductFeature"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Source_tenantId_status_idx" ON "Source"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Source_id_tenantId_key" ON "Source"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Claim_tenantId_state_idx" ON "Claim"("tenantId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_id_tenantId_key" ON "Claim"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ClaimEvidence_tenantId_sourceId_idx" ON "ClaimEvidence"("tenantId", "sourceId");

-- CreateIndex
CREATE INDEX "ClaimEvidence_claimId_idx" ON "ClaimEvidence"("claimId");

-- CreateIndex
CREATE INDEX "Persona_tenantId_idx" ON "Persona"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Persona_id_tenantId_key" ON "Persona"("id", "tenantId");

-- CreateIndex
CREATE INDEX "BuyerProblem_tenantId_personaId_idx" ON "BuyerProblem"("tenantId", "personaId");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerProblem_id_tenantId_key" ON "BuyerProblem"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ValueProposition_tenantId_idx" ON "ValueProposition"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ValueProposition_id_tenantId_key" ON "ValueProposition"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ValuePropositionClaim_tenantId_idx" ON "ValuePropositionClaim"("tenantId");

-- CreateIndex
CREATE INDEX "Competitor_tenantId_idx" ON "Competitor"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Competitor_id_tenantId_key" ON "Competitor"("id", "tenantId");

-- CreateIndex
CREATE INDEX "CompetitorEvidence_tenantId_competitorId_idx" ON "CompetitorEvidence"("tenantId", "competitorId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorEvidence_id_tenantId_key" ON "CompetitorEvidence"("id", "tenantId");

-- CreateIndex
CREATE INDEX "RegulatoryTrigger_tenantId_idx" ON "RegulatoryTrigger"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryTrigger_id_tenantId_key" ON "RegulatoryTrigger"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Asset_tenantId_state_idx" ON "Asset"("tenantId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_id_tenantId_key" ON "Asset"("id", "tenantId");

-- CreateIndex
CREATE INDEX "AssetVersion_tenantId_idx" ON "AssetVersion"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetVersion_assetId_versionNumber_key" ON "AssetVersion"("assetId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AssetVersion_id_tenantId_key" ON "AssetVersion"("id", "tenantId");

-- CreateIndex
CREATE INDEX "WorkflowRun_tenantId_status_idx" ON "WorkflowRun"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRun_tenantId_idempotencyKey_key" ON "WorkflowRun"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Approval_tenantId_assetVersionId_idx" ON "Approval"("tenantId", "assetVersionId");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_entityType_entityId_idx" ON "AuditEvent"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_createdAt_idx" ON "AuditEvent"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFeature" ADD CONSTRAINT "ProductFeature_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFeature" ADD CONSTRAINT "ProductFeature_productId_tenantId_fkey" FOREIGN KEY ("productId", "tenantId") REFERENCES "Product"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_productId_tenantId_fkey" FOREIGN KEY ("productId", "tenantId") REFERENCES "Product"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_featureId_tenantId_fkey" FOREIGN KEY ("featureId", "tenantId") REFERENCES "ProductFeature"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimEvidence" ADD CONSTRAINT "ClaimEvidence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimEvidence" ADD CONSTRAINT "ClaimEvidence_claimId_tenantId_fkey" FOREIGN KEY ("claimId", "tenantId") REFERENCES "Claim"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimEvidence" ADD CONSTRAINT "ClaimEvidence_sourceId_tenantId_fkey" FOREIGN KEY ("sourceId", "tenantId") REFERENCES "Source"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Persona" ADD CONSTRAINT "Persona_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerProblem" ADD CONSTRAINT "BuyerProblem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerProblem" ADD CONSTRAINT "BuyerProblem_personaId_tenantId_fkey" FOREIGN KEY ("personaId", "tenantId") REFERENCES "Persona"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValueProposition" ADD CONSTRAINT "ValueProposition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValueProposition" ADD CONSTRAINT "ValueProposition_featureId_tenantId_fkey" FOREIGN KEY ("featureId", "tenantId") REFERENCES "ProductFeature"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValueProposition" ADD CONSTRAINT "ValueProposition_buyerProblemId_tenantId_fkey" FOREIGN KEY ("buyerProblemId", "tenantId") REFERENCES "BuyerProblem"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValueProposition" ADD CONSTRAINT "ValueProposition_personaId_tenantId_fkey" FOREIGN KEY ("personaId", "tenantId") REFERENCES "Persona"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuePropositionClaim" ADD CONSTRAINT "ValuePropositionClaim_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuePropositionClaim" ADD CONSTRAINT "ValuePropositionClaim_valuePropositionId_tenantId_fkey" FOREIGN KEY ("valuePropositionId", "tenantId") REFERENCES "ValueProposition"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuePropositionClaim" ADD CONSTRAINT "ValuePropositionClaim_claimId_tenantId_fkey" FOREIGN KEY ("claimId", "tenantId") REFERENCES "Claim"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorEvidence" ADD CONSTRAINT "CompetitorEvidence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorEvidence" ADD CONSTRAINT "CompetitorEvidence_competitorId_tenantId_fkey" FOREIGN KEY ("competitorId", "tenantId") REFERENCES "Competitor"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorEvidence" ADD CONSTRAINT "CompetitorEvidence_sourceId_tenantId_fkey" FOREIGN KEY ("sourceId", "tenantId") REFERENCES "Source"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryTrigger" ADD CONSTRAINT "RegulatoryTrigger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetVersion" ADD CONSTRAINT "AssetVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetVersion" ADD CONSTRAINT "AssetVersion_assetId_tenantId_fkey" FOREIGN KEY ("assetId", "tenantId") REFERENCES "Asset"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetVersion" ADD CONSTRAINT "AssetVersion_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "WorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_assetVersionId_tenantId_fkey" FOREIGN KEY ("assetVersionId", "tenantId") REFERENCES "AssetVersion"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
