import Link from "next/link";
import { GatesBadge, ModeBadge, StateBadge, SyntheticTag } from "@/components/app/badges";
import { EmptyState, PageHeader, Section } from "@/components/app/page-header";
import { StartRunButton } from "@/components/campaign/generate-button";
import { RecordChangeForm } from "@/components/radar/change-form";
import { ResolveChangeForm } from "@/components/radar/resolve-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DEMO_PREPARED_CHANGE } from "@/demo/regulatory-fixtures";
import { canReview, hasRole } from "@/domain/actor";
import { CHANGE_KIND_LABEL, IMPACT_REASON_LABEL, type Impact, type RegulatoryChangeKind } from "@/domain/regulatory/radar";
import { fmtDate, fmtDay } from "@/lib/format";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";

export const dynamic = "force-dynamic";

/**
 * M16 regulatory radar: watched regulatory items, recorded changes with their
 * computed impact (stale claims, affected assets), change briefs and the
 * reviewer resolution. Nothing is fetched automatically: a person records the
 * verified new wording.
 */
export default async function RadarPage() {
  const actor = await requirePageActor();
  const tdb = tenantDb(actor, getDb());
  const [watches, briefs, tenant] = await Promise.all([tdb.views.radar(), tdb.views.changeBriefs(), tdb.tenant.get()]);
  const canEdit = hasRole(actor, "editor");
  const reviewer = canReview(actor);
  const open = watches.flatMap((w) => w.changes).filter((c) => !c.resolvedAt).length;
  const prepared = tenant.isDemo && watches.some((w) => w.id === DEMO_PREPARED_CHANGE.watchId) ? DEMO_PREPARED_CHANGE : null;

  return (
    <>
      <PageHeader
        title="Regulatory radar"
        description="Watched regulatory items and their current wording. When the wording or a deadline changes, record it: claims that cite it become stale, affected assets are flagged with the reason, approvals that rest on the old text can no longer be exported, and launch readiness blocks until the alert is resolved."
      />
      <Alert variant={open ? "destructive" : "default"}>
        <AlertTitle>{open ? `${open} open alert(s)` : "No open alert"}</AlertTitle>
        <AlertDescription>
          An alert is resolved by a reviewer once every claim it made stale has been re-verified against the new text or retired. Messaging that argued with the old
          deadline is listed below — re-review it before it leaves the system.
        </AlertDescription>
      </Alert>

      <Section id="watches" title="Watched items" description="Current wording = the stored source the gates check excerpts against.">
        {watches.length === 0 ? (
          <EmptyState>Nothing watched yet.</EmptyState>
        ) : (
          watches.map((w) => (
            <div key={w.id} className="flex flex-col gap-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{w.name}</span> {w.isSynthetic ? <SyntheticTag /> : null}
                <span className="text-sm text-muted-foreground">
                  {w.jurisdiction} · {w.topic} · current deadline: {w.currentDeadline ? fmtDay(w.currentDeadline) : "none"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Source: {w.source.title} (v{w.source.version}
                {w.source.retrievedAt ? `, updated ${fmtDate(w.source.retrievedAt)}` : ""})
              </p>

              {w.changes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No change recorded.</p>
              ) : (
                <ol className="flex flex-col gap-3">
                  {w.changes.map((c) => {
                    const impact = c.impact as unknown as Impact;
                    const myBriefs = briefs.filter((b) => b.changeId === c.id);
                    return (
                      <li key={c.id} id={`change-${c.id}`} className="rounded-md border p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={c.resolvedAt ? "secondary" : "destructive"}>{c.resolvedAt ? "resolved" : "open"}</Badge>
                          <span className="font-medium">{CHANGE_KIND_LABEL[c.kind as RegulatoryChangeKind]}</span>
                          <span className="text-muted-foreground">
                            {fmtDate(c.createdAt)} · {c.recordedBy.name}
                          </span>
                        </div>
                        <p className="mt-1">{c.summary}</p>
                        {c.previousDeadline || c.newDeadline ? (
                          <p className="mt-1 text-muted-foreground">
                            Deadline: {c.previousDeadline ? fmtDay(c.previousDeadline) : "none"} → {c.newDeadline ? fmtDay(c.newDeadline) : "none"}
                          </p>
                        ) : null}
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <div>
                            <p className="font-medium">Stale claims ({impact.staleClaimIds.length})</p>
                            {impact.staleClaimIds.length ? (
                              <ul className="list-disc pl-5">
                                {impact.staleClaimIds.map((id) => (
                                  <li key={id}>
                                    <Link href="/knowledge/claims" className="font-mono text-xs underline underline-offset-2">
                                      {id}
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-muted-foreground">None.</p>
                            )}
                          </div>
                          <div>
                            <p className="font-medium">Affected assets ({impact.affectedAssets.length})</p>
                            {impact.affectedAssets.length ? (
                              <ul className="flex flex-col gap-1">
                                {impact.affectedAssets.map((a) => (
                                  <li key={a.assetId}>
                                    <Link href={`/assets/${a.assetId}`} className="underline underline-offset-2">
                                      {a.title}
                                    </Link>{" "}
                                    <StateBadge state={a.state} />
                                    <span className="block text-xs text-muted-foreground">{a.reasons.map((r) => IMPACT_REASON_LABEL[r]).join("; ")}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-muted-foreground">None.</p>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-col gap-2">
                          {myBriefs.map((b) => (
                            <span key={b.id} className="flex flex-wrap items-center gap-2">
                              <Link href={`/assets/${b.id}`} className="underline underline-offset-2">
                                {b.title}
                              </Link>
                              <StateBadge state={b.state} />
                              {b.versions[0] ? (
                                <>
                                  <ModeBadge mode={b.versions[0].generationMode} /> <GatesBadge passed={b.versions[0].gatesPassed} />
                                </>
                              ) : null}
                            </span>
                          ))}
                          {canEdit ? (
                            <StartRunButton
                              input={{ kind: "regulatory_impact", changeId: c.id }}
                              variant="outline"
                              label={myBriefs.length ? "Generate new change brief" : "Generate change brief (messaging implications)"}
                            />
                          ) : null}
                          {c.resolvedAt ? (
                            <p className="text-muted-foreground">
                              Resolved {fmtDate(c.resolvedAt)} by {c.resolvedBy?.name ?? "—"}: {c.resolutionNote}
                            </p>
                          ) : reviewer ? (
                            <ResolveChangeForm changeId={c.id} />
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          ))
        )}
      </Section>

      <Section id="record" title="Record a change" description="Paste the verified new wording. Nothing is fetched automatically; an allow-listed fetcher is on the roadmap.">
        {!canEdit ? (
          <EmptyState>Only editors can record changes.</EmptyState>
        ) : watches.length ? (
          <RecordChangeForm watches={watches.map((w) => ({ id: w.id, name: w.name, content: w.source.content }))} prepared={prepared} />
        ) : (
          <EmptyState>Nothing watched yet.</EmptyState>
        )}
      </Section>
    </>
  );
}
