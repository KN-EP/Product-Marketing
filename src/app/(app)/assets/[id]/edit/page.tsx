import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { LoadPreparedCorrectionButton } from "@/components/review/asset-actions";
import { StructuredEditor, type EditableStatement } from "@/components/review/structured-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { hasRole } from "@/domain/actor";
import { currentVersion } from "@/domain/assets/asset-state";
import { collectStatements } from "@/domain/schemas/agents";
import { humanise, parsePath } from "@/lib/content-paths";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";
import { or404 } from "@/server/http/page";

export const dynamic = "force-dynamic";

function labelFor(path: string): string {
  return parsePath(path)
    .map((seg) => (typeof seg === "number" ? `#${seg + 1}` : humanise(seg)))
    .join(" › ");
}

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

  if (!hasRole(actor, "editor") || !base || rec.state === "pending_review" || rec.state === "archived") {
    return (
      <>
        <PageHeader title={`Create corrected version — ${rec.title}`} actions={back} />
        <Alert>
          <AlertTitle>Editing is not available</AlertTitle>
          <AlertDescription>
            {!hasRole(actor, "editor")
              ? "Only editors can create new versions."
              : rec.state === "pending_review"
                ? "The current version is under review. A reviewer must decide first (e.g. request changes)."
                : "This asset has no editable version."}
          </AlertDescription>
        </Alert>
      </>
    );
  }

  const statements: EditableStatement[] = collectStatements(base.content).map(({ path, s }) => ({
    path,
    label: labelFor(path),
    text: s.text,
    kind: s.kind,
    refs: [...s.claimIds.map((c) => `claim:${c}`), ...s.evidence.map((e) => `source:${e.sourceId}`), ...s.competitorEvidenceIds.map((c) => `competitor-evidence:${c}`)].join(", "),
  }));

  return (
    <>
      <PageHeader
        title={`Create corrected version — ${rec.title}`}
        description={`Based on v${base.versionNumber}. Saving creates v${rec.versions.length + 1} as a human edit; v${base.versionNumber} stays unchanged.`}
        actions={back}
      />
      {tenant.isDemo && rec.type === "competitive_battlecard" ? <LoadPreparedCorrectionButton assetId={rec.id} /> : null}
      <StructuredEditor assetId={rec.id} baseVersionNumber={base.versionNumber} content={base.content} statements={statements} />
    </>
  );
}
