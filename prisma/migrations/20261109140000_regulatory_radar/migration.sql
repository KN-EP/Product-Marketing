-- M16 regulatory radar: watched regulatory items, recorded changes with their
-- computed impact (stale claims, affected assets), resolution by a reviewer,
-- and the regulatory_change_brief asset type.

-- CreateEnum
CREATE TYPE "RegulatoryChangeKind" AS ENUM ('deadline_shift', 'scope_change', 'new_guidance', 'repeal', 'other');

-- AlterEnum
ALTER TYPE "AssetType" ADD VALUE 'regulatory_change_brief';

-- CreateTable
CREATE TABLE "RegulatoryWatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "regulatoryTriggerId" TEXT,
    "currentDeadline" DATE,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatoryWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryChange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "watchId" TEXT NOT NULL,
    "kind" "RegulatoryChangeKind" NOT NULL,
    "summary" TEXT NOT NULL,
    "previousDeadline" DATE,
    "newDeadline" DATE,
    "previousContentHash" TEXT NOT NULL,
    "newContentHash" TEXT NOT NULL,
    "impact" JSONB NOT NULL,
    "recordedById" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulatoryChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegulatoryWatch_tenantId_idx" ON "RegulatoryWatch"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryWatch_id_tenantId_key" ON "RegulatoryWatch"("id", "tenantId");

-- CreateIndex
CREATE INDEX "RegulatoryChange_tenantId_resolvedAt_idx" ON "RegulatoryChange"("tenantId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryChange_id_tenantId_key" ON "RegulatoryChange"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "RegulatoryWatch" ADD CONSTRAINT "RegulatoryWatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryWatch" ADD CONSTRAINT "RegulatoryWatch_sourceId_tenantId_fkey" FOREIGN KEY ("sourceId", "tenantId") REFERENCES "Source"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryWatch" ADD CONSTRAINT "RegulatoryWatch_regulatoryTriggerId_tenantId_fkey" FOREIGN KEY ("regulatoryTriggerId", "tenantId") REFERENCES "RegulatoryTrigger"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryChange" ADD CONSTRAINT "RegulatoryChange_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryChange" ADD CONSTRAINT "RegulatoryChange_watchId_tenantId_fkey" FOREIGN KEY ("watchId", "tenantId") REFERENCES "RegulatoryWatch"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryChange" ADD CONSTRAINT "RegulatoryChange_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryChange" ADD CONSTRAINT "RegulatoryChange_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
