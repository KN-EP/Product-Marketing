-- M15 station "Launch": staged launches with computed readiness per phase,
-- human go / no-go decisions and the launch_plan asset type.

-- CreateEnum
CREATE TYPE "LaunchTier" AS ENUM ('tier_1', 'tier_2', 'tier_3');

-- CreateEnum
CREATE TYPE "LaunchPhase" AS ENUM ('early_access', 'general_availability', 'customer_launch', 'market_launch');

-- CreateEnum
CREATE TYPE "GoDecision" AS ENUM ('go', 'no_go');

-- AlterEnum
ALTER TYPE "AssetType" ADD VALUE 'launch_plan';

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "launchId" TEXT;

-- AlterTable
ALTER TABLE "WorkflowRun" ADD COLUMN     "launchId" TEXT;

-- CreateTable
CREATE TABLE "Launch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "releaseId" TEXT,
    "name" TEXT NOT NULL,
    "tier" "LaunchTier" NOT NULL,
    "summary" TEXT NOT NULL,
    "pricingModel" TEXT NOT NULL,
    "targetSegments" TEXT NOT NULL,
    "earlyAccessOn" DATE,
    "generalAvailabilityOn" DATE,
    "customerLaunchOn" DATE,
    "marketLaunchOn" DATE,
    "externalReferences" INTEGER NOT NULL DEFAULT 0,
    "internalPilot" BOOLEAN NOT NULL DEFAULT false,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Launch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaunchDecision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "launchId" TEXT NOT NULL,
    "phase" "LaunchPhase" NOT NULL,
    "decision" "GoDecision" NOT NULL,
    "comment" TEXT,
    "readiness" JSONB NOT NULL,
    "decidedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaunchDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Launch_tenantId_idx" ON "Launch"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Launch_id_tenantId_key" ON "Launch"("id", "tenantId");

-- CreateIndex
CREATE INDEX "LaunchDecision_tenantId_launchId_idx" ON "LaunchDecision"("tenantId", "launchId");

-- CreateIndex
CREATE INDEX "Asset_tenantId_launchId_idx" ON "Asset"("tenantId", "launchId");

-- CreateIndex
CREATE INDEX "WorkflowRun_tenantId_launchId_idx" ON "WorkflowRun"("tenantId", "launchId");

-- AddForeignKey
ALTER TABLE "Launch" ADD CONSTRAINT "Launch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Launch" ADD CONSTRAINT "Launch_productId_tenantId_fkey" FOREIGN KEY ("productId", "tenantId") REFERENCES "Product"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Launch" ADD CONSTRAINT "Launch_releaseId_tenantId_fkey" FOREIGN KEY ("releaseId", "tenantId") REFERENCES "Release"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaunchDecision" ADD CONSTRAINT "LaunchDecision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaunchDecision" ADD CONSTRAINT "LaunchDecision_launchId_tenantId_fkey" FOREIGN KEY ("launchId", "tenantId") REFERENCES "Launch"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaunchDecision" ADD CONSTRAINT "LaunchDecision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_launchId_tenantId_fkey" FOREIGN KEY ("launchId", "tenantId") REFERENCES "Launch"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_launchId_tenantId_fkey" FOREIGN KEY ("launchId", "tenantId") REFERENCES "Launch"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
