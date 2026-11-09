-- M8–M10: campaigns and the campaign package deliverables.

-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('demand_generation', 'conversion', 'retention', 'loyalty', 'sales_enablement');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AssetType" ADD VALUE 'campaign_plan';
ALTER TYPE "AssetType" ADD VALUE 'content_matrix';
ALTER TYPE "AssetType" ADD VALUE 'sales_play';

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "campaignId" TEXT;

-- AlterTable
ALTER TABLE "WorkflowRun" ADD COLUMN     "campaignId" TEXT;

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CampaignType" NOT NULL,
    "objective" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "channels" TEXT[],
    "startsOn" DATE,
    "endsOn" DATE,
    "budgetEur" DECIMAL(12,2),
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_tenantId_idx" ON "Campaign"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_id_tenantId_key" ON "Campaign"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Asset_tenantId_campaignId_idx" ON "Asset"("tenantId", "campaignId");

-- CreateIndex
CREATE INDEX "WorkflowRun_tenantId_campaignId_idx" ON "WorkflowRun"("tenantId", "campaignId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_productId_tenantId_fkey" FOREIGN KEY ("productId", "tenantId") REFERENCES "Product"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_personaId_tenantId_fkey" FOREIGN KEY ("personaId", "tenantId") REFERENCES "Persona"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_campaignId_tenantId_fkey" FOREIGN KEY ("campaignId", "tenantId") REFERENCES "Campaign"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_campaignId_tenantId_fkey" FOREIGN KEY ("campaignId", "tenantId") REFERENCES "Campaign"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
