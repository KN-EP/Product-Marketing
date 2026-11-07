-- M13a + M13b: product and conversion assets and the sales toolkit.
-- New asset types only; all of them use the existing Asset / AssetVersion
-- tables (schemaVersion "enablement_asset.v1") and the campaign_asset run kind.
-- No table, column or data changes.

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AssetType" ADD VALUE 'product_page';
ALTER TYPE "AssetType" ADD VALUE 'solution_brief';
ALTER TYPE "AssetType" ADD VALUE 'whitepaper_outline';
ALTER TYPE "AssetType" ADD VALUE 'thought_leadership';
ALTER TYPE "AssetType" ADD VALUE 'regulatory_explainer';
ALTER TYPE "AssetType" ADD VALUE 'case_study';
ALTER TYPE "AssetType" ADD VALUE 'ad_copy';
ALTER TYPE "AssetType" ADD VALUE 'webinar_outline';
ALTER TYPE "AssetType" ADD VALUE 'video_script';
ALTER TYPE "AssetType" ADD VALUE 'industry_narrative';
ALTER TYPE "AssetType" ADD VALUE 'pitch_deck_outline';
ALTER TYPE "AssetType" ADD VALUE 'demo_story';
ALTER TYPE "AssetType" ADD VALUE 'one_pager';
ALTER TYPE "AssetType" ADD VALUE 'discovery_guide';
ALTER TYPE "AssetType" ADD VALUE 'persona_playbook';
ALTER TYPE "AssetType" ADD VALUE 'roi_argument';
ALTER TYPE "AssetType" ADD VALUE 'sales_training';
