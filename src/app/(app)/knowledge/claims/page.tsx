import Link from "next/link";
import { StateBadge, SyntheticTag } from "@/components/app/badges";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";

export const dynamic = "force-dynamic";

export default async function ClaimsPage() {
  const actor = await requirePageActor();
  const claims = await tenantDb(actor, getDb()).views.claims();
  return (
    <>
      <PageHeader
        title="Claims"
        description="Product statements with structured evidence: each links to a stored source and the exact excerpt. Only approved claims can support facts in generated assets."
      />
      {claims.length === 0 ? (
        <EmptyState>No claims.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {claims.map((c) => (
            <li key={c.id} id={`clm-${c.id}`} className="scroll-mt-24 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StateBadge state={c.state} />
                <Badge variant="outline">{c.category.replace(/_/g, " ")}</Badge>
                {c.isSynthetic ? <SyntheticTag /> : null}
                <span className="font-mono text-xs text-muted-foreground">{c.id}</span>
              </div>
              <p className="mt-2 font-medium">{c.text}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Product:{" "}
                <Link href={`/products/${c.product.id}`} className="underline-offset-4 hover:underline">
                  {c.product.name}
                </Link>
                {c.approvedAt ? ` · approved ${fmtDate(c.approvedAt)}` : ""}
                {c.staleReason ? ` · stale: ${c.staleReason}` : ""}
              </p>
              <h3 className="mt-3 text-sm font-medium">Evidence</h3>
              {c.evidence.length === 0 ? (
                <p className="mt-1 text-sm text-destructive">No evidence — this claim cannot be approved.</p>
              ) : (
                <ul className="mt-1 flex flex-col gap-2">
                  {c.evidence.map((e) => (
                    <li key={e.id} className="text-sm">
                      <blockquote className="border-l-2 pl-3 italic">&ldquo;{e.excerpt}&rdquo;</blockquote>
                      <p className="mt-1 pl-3 text-xs text-muted-foreground">
                        <Link href={`/knowledge/sources#src-${e.source.id}`} className="underline-offset-4 hover:underline">
                          {e.source.title}
                        </Link>
                        {e.locator ? ` · ${e.locator}` : ""} · source {e.source.status}
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
