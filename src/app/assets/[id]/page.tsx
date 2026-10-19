import Link from "next/link";
import { SyntheticBanner } from "@/components/synthetic-banner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";
import { or404 } from "@/server/http/page";

export const dynamic = "force-dynamic";

/** Read-only. The route param identifies the record; the tenant comes from the session. */
export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageActor();
  const asset = await or404(tenantDb(actor, getDb()).assets.getById(id));
  const current = asset.versions.find((v) => v.id === asset.currentVersionId) ?? asset.versions[0];

  return (
    <>
      <SyntheticBanner />
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
        <Link href="/dashboard" className="text-sm underline">
          ← Dashboard
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>{asset.title}</CardTitle>
            <CardDescription>
              {asset.type} · state: {asset.state} · {asset.versions.length} version(s)
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {current ? (
              <>
                <p className="text-sm">
                  Version {current.versionNumber} · {current.generationMode} · gates{" "}
                  {current.gatesPassed ? "passed" : "failed"}
                </p>
                <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-4 text-xs">
                  {JSON.stringify(current.content, null, 2)}
                </pre>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No versions yet.</p>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
