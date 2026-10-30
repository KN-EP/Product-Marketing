-- M12 "strategy first": communication vs. sales channels, use case map,
-- GTM strategy brief, releases and release communication plans.

-- CreateEnum
CREATE TYPE "ReleaseType" AS ENUM ('major_release', 'feature_update', 'maintenance_update', 'security_update', 'deprecation');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AssetType" ADD VALUE 'use_case_map';
ALTER TYPE "AssetType" ADD VALUE 'gtm_strategy_brief';
ALTER TYPE "AssetType" ADD VALUE 'release_communication_plan';

-- AlterTable: "channels" becomes "communicationChannels"; sales channels are kept apart.
ALTER TABLE "Campaign" RENAME COLUMN "channels" TO "communicationChannels";
ALTER TABLE "Campaign" ADD COLUMN     "salesChannels" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Data: the former mixed list held two sales channels as free text — move them.
UPDATE "Campaign" SET
  "salesChannels" = ARRAY(
    SELECT DISTINCT CASE lower(c) WHEN 'sales outreach' THEN 'direct_sales' ELSE 'customer_success' END
    FROM unnest("communicationChannels") AS c
    WHERE lower(c) IN ('sales outreach', 'customer success')
  ),
  "communicationChannels" = ARRAY(
    SELECT c FROM unnest("communicationChannels") WITH ORDINALITY AS t(c, n)
    WHERE lower(c) NOT IN ('sales outreach', 'customer success')
    ORDER BY n
  );

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "releaseId" TEXT;

-- AlterTable
ALTER TABLE "WorkflowRun" ADD COLUMN     "releaseId" TEXT;

-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "type" "ReleaseType" NOT NULL,
    "plannedOn" DATE,
    "summary" TEXT NOT NULL,
    "changes" TEXT[],
    "audiences" TEXT[],
    "communicationChannels" TEXT[],
    "salesChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Release_tenantId_plannedOn_idx" ON "Release"("tenantId", "plannedOn");

-- CreateIndex
CREATE UNIQUE INDEX "Release_id_tenantId_key" ON "Release"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Asset_tenantId_releaseId_idx" ON "Asset"("tenantId", "releaseId");

-- CreateIndex
CREATE INDEX "WorkflowRun_tenantId_releaseId_idx" ON "WorkflowRun"("tenantId", "releaseId");

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_productId_tenantId_fkey" FOREIGN KEY ("productId", "tenantId") REFERENCES "Product"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_releaseId_tenantId_fkey" FOREIGN KEY ("releaseId", "tenantId") REFERENCES "Release"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_releaseId_tenantId_fkey" FOREIGN KEY ("releaseId", "tenantId") REFERENCES "Release"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
