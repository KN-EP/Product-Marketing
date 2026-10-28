-- M11: KPI tree per campaign, measurements, CSV imports, performance review asset type.

-- CreateEnum
CREATE TYPE "KpiUnit" AS ENUM ('count', 'percent', 'currency_eur', 'ratio');

-- CreateEnum
CREATE TYPE "KpiDirection" AS ENUM ('higher_is_better', 'lower_is_better');

-- CreateEnum
CREATE TYPE "KpiAggregation" AS ENUM ('sum', 'latest', 'average');

-- AlterEnum
ALTER TYPE "AssetType" ADD VALUE 'performance_review';

-- CreateTable
CREATE TABLE "Kpi" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "funnelStage" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "dataSource" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "unit" "KpiUnit" NOT NULL DEFAULT 'count',
    "direction" "KpiDirection" NOT NULL DEFAULT 'higher_is_better',
    "aggregation" "KpiAggregation" NOT NULL DEFAULT 'sum',
    "target" DECIMAL(18,4),
    "baseline" DECIMAL(18,4),
    "sourceVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiMeasurement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "importId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiImport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "acceptedRows" INTEGER NOT NULL,
    "rejectedRows" JSONB NOT NULL,
    "importedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Kpi_tenantId_campaignId_idx" ON "Kpi"("tenantId", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "Kpi_id_tenantId_key" ON "Kpi"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Kpi_campaignId_name_key" ON "Kpi"("campaignId", "name");

-- CreateIndex
CREATE INDEX "KpiMeasurement_tenantId_kpiId_idx" ON "KpiMeasurement"("tenantId", "kpiId");

-- CreateIndex
CREATE INDEX "KpiMeasurement_importId_idx" ON "KpiMeasurement"("importId");

-- CreateIndex
CREATE UNIQUE INDEX "KpiMeasurement_kpiId_periodStart_key" ON "KpiMeasurement"("kpiId", "periodStart");

-- CreateIndex
CREATE INDEX "KpiImport_tenantId_campaignId_idx" ON "KpiImport"("tenantId", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "KpiImport_id_tenantId_key" ON "KpiImport"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "Kpi" ADD CONSTRAINT "Kpi_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kpi" ADD CONSTRAINT "Kpi_campaignId_tenantId_fkey" FOREIGN KEY ("campaignId", "tenantId") REFERENCES "Campaign"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiMeasurement" ADD CONSTRAINT "KpiMeasurement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiMeasurement" ADD CONSTRAINT "KpiMeasurement_kpiId_tenantId_fkey" FOREIGN KEY ("kpiId", "tenantId") REFERENCES "Kpi"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiMeasurement" ADD CONSTRAINT "KpiMeasurement_importId_tenantId_fkey" FOREIGN KEY ("importId", "tenantId") REFERENCES "KpiImport"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiImport" ADD CONSTRAINT "KpiImport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiImport" ADD CONSTRAINT "KpiImport_campaignId_tenantId_fkey" FOREIGN KEY ("campaignId", "tenantId") REFERENCES "Campaign"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
