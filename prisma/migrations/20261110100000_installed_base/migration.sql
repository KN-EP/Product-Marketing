-- M18 installed base: installed units (CSV import), service → sales hand-overs with
-- a response deadline, cost-per-part comparisons computed in code, and the tenant's
-- industry profile (selects the win/loss reason codes).

-- CreateEnum
CREATE TYPE "IndustryProfile" AS ENUM ('software', 'machinery');

-- CreateEnum
CREATE TYPE "HandoverOffer" AS ENUM ('service_contract', 'spare_parts', 'retrofit', 'upgrade', 'replacement');

-- CreateEnum
CREATE TYPE "HandoverStatus" AS ENUM ('open', 'contacted', 'offered', 'won', 'lost', 'no_decision');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "industryProfile" "IndustryProfile" NOT NULL DEFAULT 'software';

-- CreateTable
CREATE TABLE "InstalledUnit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unitRef" TEXT NOT NULL,
    "accountLabel" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "application" TEXT NOT NULL,
    "installedOn" DATE NOT NULL,
    "serviceContract" BOOLEAN NOT NULL DEFAULT false,
    "sparePartOrders12m" INTEGER NOT NULL DEFAULT 0,
    "materialChangePlanned" BOOLEAN NOT NULL DEFAULT false,
    "regulatedApplication" BOOLEAN NOT NULL DEFAULT false,
    "lastServiceOn" DATE,
    "importId" TEXT,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstalledUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstalledBaseImport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "acceptedRows" INTEGER NOT NULL,
    "rejectedRows" JSONB NOT NULL,
    "importedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstalledBaseImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceHandover" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "offer" "HandoverOffer" NOT NULL,
    "finding" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueOn" DATE NOT NULL,
    "status" "HandoverStatus" NOT NULL DEFAULT 'open',
    "contactedAt" TIMESTAMP(3),
    "offeredAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostComparison" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unitId" TEXT,
    "title" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostComparison_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstalledUnit_id_tenantId_key" ON "InstalledUnit"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "InstalledUnit_tenantId_productId_unitRef_key" ON "InstalledUnit"("tenantId", "productId", "unitRef");

-- CreateIndex
CREATE INDEX "InstalledUnit_tenantId_productId_idx" ON "InstalledUnit"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "InstalledBaseImport_tenantId_createdAt_idx" ON "InstalledBaseImport"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceHandover_id_tenantId_key" ON "ServiceHandover"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ServiceHandover_tenantId_status_idx" ON "ServiceHandover"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CostComparison_id_tenantId_key" ON "CostComparison"("id", "tenantId");

-- CreateIndex
CREATE INDEX "CostComparison_tenantId_productId_idx" ON "CostComparison"("tenantId", "productId");

-- AddForeignKey
ALTER TABLE "InstalledUnit" ADD CONSTRAINT "InstalledUnit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstalledUnit" ADD CONSTRAINT "InstalledUnit_productId_tenantId_fkey" FOREIGN KEY ("productId", "tenantId") REFERENCES "Product"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstalledBaseImport" ADD CONSTRAINT "InstalledBaseImport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstalledBaseImport" ADD CONSTRAINT "InstalledBaseImport_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceHandover" ADD CONSTRAINT "ServiceHandover_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceHandover" ADD CONSTRAINT "ServiceHandover_unitId_tenantId_fkey" FOREIGN KEY ("unitId", "tenantId") REFERENCES "InstalledUnit"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceHandover" ADD CONSTRAINT "ServiceHandover_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostComparison" ADD CONSTRAINT "CostComparison_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostComparison" ADD CONSTRAINT "CostComparison_productId_tenantId_fkey" FOREIGN KEY ("productId", "tenantId") REFERENCES "Product"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostComparison" ADD CONSTRAINT "CostComparison_unitId_tenantId_fkey" FOREIGN KEY ("unitId", "tenantId") REFERENCES "InstalledUnit"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostComparison" ADD CONSTRAINT "CostComparison_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
