import { StateBadge, SyntheticTag } from "@/components/app/badges";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const actor = await requirePageActor();
  const sources = await tenantDb(actor, getDb()).views.sources();
  return (
    <>
      <PageHeader
        title="Sources"
        description="Stored source texts. Cited excerpts are checked against this exact text (gate G4). Classification decides whether a source may be sent to an external model."
      />
      {sources.length === 0 ? (
        <EmptyState>No sources.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {sources.map((s) => (
            <li key={s.id} id={`src-${s.id}`} className="scroll-mt-24 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-medium">{s.title}</h2>
                <StateBadge state={s.status} />
                <Badge variant="outline">{s.classification}</Badge>
                <Badge variant="outline">{s.kind.replace(/_/g, " ")}</Badge>
                {s.isSynthetic ? <SyntheticTag /> : null}
              </div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <dt>ID</dt>
                <dd className="font-mono">{s.id}</dd>
                <dt>URL</dt>
                <dd>{s.url ?? "none (synthetic or internal source — no URL is ever fabricated)"}</dd>
                <dt>Retrieved</dt>
                <dd>{fmtDate(s.retrievedAt)}</dd>
                <dt>Used by</dt>
                <dd>{s._count.claimEvidence} claim evidence item(s)</dd>
              </dl>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Stored text
                </summary>
                <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-3">{s.content}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
