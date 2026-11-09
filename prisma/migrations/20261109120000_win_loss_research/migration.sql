-- M14 station "Win/loss & research": win/loss interviews with consent
-- tracking (notes only as a confidential interview source, only with granted
-- consent) and the win_loss_synthesis asset type.

-- CreateEnum
CREATE TYPE "DealOutcome" AS ENUM ('won', 'lost', 'churned', 'no_decision');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('requested', 'granted', 'declined', 'withdrawn');

-- AlterEnum
ALTER TYPE "AssetType" ADD VALUE 'win_loss_synthesis';

-- CreateTable
CREATE TABLE "WinLossInterview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "accountLabel" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "outcome" "DealOutcome" NOT NULL,
    "decidedOn" DATE,
    "competitorId" TEXT,
    "reasons" TEXT[],
    "primaryReason" TEXT NOT NULL,
    "interviewedOn" DATE,
    "consentStatus" "ConsentStatus" NOT NULL DEFAULT 'requested',
    "consentRecordedAt" TIMESTAMP(3),
    "sourceId" TEXT,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WinLossInterview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WinLossInterview_tenantId_productId_idx" ON "WinLossInterview"("tenantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "WinLossInterview_id_tenantId_key" ON "WinLossInterview"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "WinLossInterview" ADD CONSTRAINT "WinLossInterview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinLossInterview" ADD CONSTRAINT "WinLossInterview_productId_tenantId_fkey" FOREIGN KEY ("productId", "tenantId") REFERENCES "Product"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinLossInterview" ADD CONSTRAINT "WinLossInterview_competitorId_tenantId_fkey" FOREIGN KEY ("competitorId", "tenantId") REFERENCES "Competitor"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinLossInterview" ADD CONSTRAINT "WinLossInterview_sourceId_tenantId_fkey" FOREIGN KEY ("sourceId", "tenantId") REFERENCES "Source"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
