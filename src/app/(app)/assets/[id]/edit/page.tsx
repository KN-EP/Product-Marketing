import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { StructuredEditor } from "@/components/review/structured-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { hasRole } from "@/domain/actor";
import { currentVersion } from "@/domain/assets/asset-state";
import { requirePageActor } from "@/server/auth/actor";
import { isInternalAssetType } from "@/server/assets/deliverables";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";
import { or404 } from "@/server/http/page";
import { preparedCorrectionFor } from "@/server/review/service";

export const dynamic = "force-dynamic";

export default async function EditAssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageActor();
  const tdb = tenantDb(actor, getDb());
  const rec = await or404(tdb.assets.getRecord(id));
  const tenant = await tdb.tenant.get();
  const base = currentVersion(rec);

  const back = (
    <Link href={`/assets/${rec.id}`} className="text-sm underline underline-offset-2">
      Back to review
    </Link>
  );

  const reason = isInternalAssetType(rec.type)
    ? "The input brief is internal and cannot be edited."
    : !hasRole(actor, "editor")
      ? "Only editors can create new versions."
      : rec.state === "pending_review"
        ? "The current version is under review. A reviewer must decide first (e.g. request changes)."
        : !base || rec.state === "archived"
          ? "This asset has no editable version."
          : null;

  if (reason || !base) {
    return (
      <>
        <PageHeader title={<span className="line-clamp-2">Create corrected version — {rec.title}</span>} actions={back} />
        <Alert>
          <AlertTitle>Editing is not available</AlertTitle>
          <AlertDescription>{reason}</AlertDescription>
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={<span className="line-clamp-2" title={rec.title}>Create corrected version — {rec.title}</span>}
        description={`Based on v${base.versionNumber}. Saving creates v${rec.versions.length + 1} as a human edit; v${base.versionNumber} stays unchanged.`}
        actions={back}
      />
      <StructuredEditor
        assetId={rec.id}
        baseVersionNumber={base.versionNumber}
        content={base.content}
        preparedCorrection={preparedCorrectionFor(tenant, rec.type)}
      />
    </>
  );
}
