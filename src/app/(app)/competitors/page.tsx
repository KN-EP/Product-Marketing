import Link from "next/link";
import { StateBadge } from "@/components/app/badges";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";

export const dynamic = "force-dynamic";

export default async function CompetitorsPage() {
  const actor = await requirePageActor();
  const competitors = await tenantDb(actor, getDb()).views.competitors();
  return (
    <>
      <PageHeader
        title="Competitors"
        description="Comparative statements in generated assets are only allowed when backed by approved competitor evidence (gate G7b)."
      />
      {competitors.length === 0 ? (
        <EmptyState>No competitors.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {competitors.map((c) => (
            <li key={c.id} className="rounded-lg border p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-medium">{c.name}</h2>
                {c.isPlaceholder ? <Badge variant="outline">placeholder</Badge> : null}
                <span className="font-mono text-xs text-muted-foreground">{c.id}</span>
              </div>
              {c.evidence.length === 0 ? (
                <p className="mt-2 text-muted-foreground">No evidence — no comparative statements possible.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {c.evidence.map((e) => (
                    <li key={e.id} id={`cev-${e.id}`} className="scroll-mt-24">
                      <div className="flex flex-wrap items-center gap-2">
                        <StateBadge state={e.state} />
                        <span>{e.assertion}</span>
                      </div>
                      <blockquote className="mt-1 border-l-2 pl-3 italic">&ldquo;{e.excerpt}&rdquo;</blockquote>
                      <p className="mt-1 pl-3 text-xs text-muted-foreground">
                        <Link href={`/knowledge/sources#src-${e.source.id}`} className="underline-offset-4 hover:underline">
                          {e.source.title}
                        </Link>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
