-- AlterEnum
ALTER TYPE "GenerationMode" ADD VALUE 'human_edit';

-- AlterTable
ALTER TABLE "AssetVersion" ADD COLUMN     "basedOnVersionId" TEXT;

-- AddForeignKey
ALTER TABLE "AssetVersion" ADD CONSTRAINT "AssetVersion_basedOnVersionId_tenantId_fkey" FOREIGN KEY ("basedOnVersionId", "tenantId") REFERENCES "AssetVersion"("id", "tenantId") ON DELETE NO ACTION ON UPDATE CASCADE;
