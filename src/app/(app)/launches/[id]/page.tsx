import Link from "next/link";
import { GatesBadge, ModeBadge, StateBadge, SyntheticTag } from "@/components/app/badges";
import { EmptyState, PageHeader, Section } from "@/components/app/page-header";
import { StartRunButton } from "@/components/campaign/generate-button";
import { LaunchDecisionForm } from "@/components/launch/decision-form";
import { LaunchProofForm } from "@/components/launch/proof-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canReview, hasRole } from "@/domain/actor";
import { PHASE_LABEL, TIER_LABEL } from "@/domain/launches/launch";
import { ASSET_TYPE_LABEL, fmtDate, fmtDay } from "@/lib/format";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";
import { or404 } from "@/server/http/page";
import { launchReadiness } from "@/server/launches/service";

export const dynamic = "force-dynamic";

const STATUS_TEXT = { go: "ready", go_with_risks: "ready with risks", no_go: "not ready" } as const;
const CHECK_TEXT = { pass: "✓ pass", fail: "✗ fail", na: "— n/a" } as const;

/** M15: launch briefing, computed readiness per phase, go / no-go decisions, plans and runs. Tenant from the session. */
export default async function LaunchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageActor();
  const tdb = tenantDb(actor, getDb());
  const l = await or404(tdb.views.launch(id));
  const { readiness } = await launchReadiness(tdb, l.id);
  const canEdit = hasRole(actor, "editor");
  const reviewer = canReview(actor);

  const briefing: [string, React.ReactNode][] = [
    [
      "Product",
      <Link key="p" href={`/products/${l.product.id}`} className="underline underline-offset-2">
        {l.product.name}
      </Link>,
    ],
    ["Tier", TIER_LABEL[l.tier]],
    [
      "Release",
      l.release ? (
        <Link key="r" href={`/releases/${l.release.id}`} className="underline underline-offset-2">
          {l.release.name} · {l.release.version}
        </Link>
      ) : (
        "None"
      ),
    ],
    ["Summary", l.summary],
    ["Pricing model", l.pricingModel],
    ["Target segments", l.targetSegments],
    ["Proof", `${l.internalPilot ? "Internal pilot documented (customer zero); " : ""}${l.externalReferences} external reference(s)`],
  ];
  const checkIds = readiness.phases[0]!.checks.map((c) => c.id);

  return (
    <>
      <PageHeader
        title={
          <span className="line-clamp-2" title={l.name}>
            {l.name}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            {TIER_LABEL[l.tier]} · {l.product.name} {l.isSynthetic ? <SyntheticTag /> : null}
          </span>
        }
        actions={canEdit ? <StartRunButton input={{ kind: "launch_planning", launchId: l.id }} label={l.assets.length ? "Generate new launch plan" : "Generate launch plan"} /> : null}
      />

      <Alert>
        <AlertTitle>Readiness is computed, the decision is human</AlertTitle>
        <AlertDescription>
          Each phase is checked against approved deliverables, claims and proof. A reviewer records go / no-go per phase; “go” is refused while a required check
          fails, and needs an acknowledgement when recommended checks are open. Each decision stores the readiness it was based on.
        </AlertDescription>
      </Alert>

      <Section id="readiness" title="Readiness per phase" description="Computed now from the knowledge base and the approvals — not generated.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Check</TableHead>
              {readiness.phases.map((p) => (
                <TableHead key={p.phase}>
                  {PHASE_LABEL[p.phase]}
                  <span className="block text-xs font-normal text-muted-foreground">{p.plannedOn ?? "not planned"}</span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell data-label="Check" className="font-medium">
                Status
              </TableCell>
              {readiness.phases.map((p) => (
                <TableCell key={p.phase} data-label={PHASE_LABEL[p.phase]}>
                  <Badge variant={p.status === "go" ? "default" : p.status === "no_go" ? "destructive" : "secondary"}>{STATUS_TEXT[p.status]}</Badge>
                </TableCell>
              ))}
            </TableRow>
            {checkIds.map((cid) => {
              const first = readiness.phases[0]!.checks.find((c) => c.id === cid)!;
              return (
                <TableRow key={cid}>
                  <TableCell data-label="Check" className="whitespace-normal">
                    {first.label}
                    <span className="block text-xs text-muted-foreground">{first.detail}</span>
                  </TableCell>
                  {readiness.phases.map((p) => {
                    const c = p.checks.find((x) => x.id === cid)!;
                    return (
                      <TableCell key={p.phase} data-label={PHASE_LABEL[p.phase]} className={c.status === "fail" && c.required ? "text-destructive" : ""}>
                        {CHECK_TEXT[c.status]}
                        {c.status !== "na" ? <span className="block text-xs text-muted-foreground">{c.required ? "required" : "recommended"}</span> : null}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Section>

      <Section id="decisions" title="Go / no-go decisions" description="Newest first. Reviewers only.">
        {l.decisions.length === 0 ? (
          <EmptyState>No decision yet.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {l.decisions.map((d) => (
              <li key={d.id} className="rounded-lg border p-3">
                <span className="font-medium">{PHASE_LABEL[d.phase]}</span>: {d.decision === "go" ? "Go" : "No-go"} — {d.decidedBy.name}, {fmtDate(d.createdAt)}
                <span className="block text-xs text-muted-foreground">Readiness at decision time: {STATUS_TEXT[(d.readiness as { status: keyof typeof STATUS_TEXT }).status] ?? "—"}</span>
                {d.comment ? <span className="mt-1 block">{d.comment}</span> : null}
              </li>
            ))}
          </ul>
        )}
        {reviewer ? (
          <div className="mt-4 rounded-lg border p-4">
            <LaunchDecisionForm launchId={l.id} phases={readiness.phases.filter((p) => p.plannedOn).map((p) => ({ phase: p.phase, status: p.status }))} />
          </div>
        ) : null}
      </Section>

      <Section id="briefing" title="Launch briefing" description={`Created ${fmtDate(l.createdAt)}. Human input — passed to the agent as data, never as evidence.`}>
        <dl className="grid gap-x-6 gap-y-3 rounded-lg border p-4 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]">
          {briefing.map(([k, val]) => (
            <div key={k} className="contents">
              <dt className="font-medium text-muted-foreground">{k}</dt>
              <dd className="min-w-0 break-words">{val}</dd>
            </div>
          ))}
          {readiness.phases.map((p) => (
            <div key={p.phase} className="contents">
              <dt className="font-medium text-muted-foreground">{PHASE_LABEL[p.phase]}</dt>
              <dd>{p.plannedOn ? fmtDay(p.plannedOn) : "Not planned"}</dd>
            </div>
          ))}
        </dl>
        {canEdit ? (
          <div className="mt-4">
            <LaunchProofForm launchId={l.id} externalReferences={l.externalReferences} internalPilot={l.internalPilot} />
          </div>
        ) : null}
      </Section>

      <Section id="plans" title="Launch plans" description="Phases, proof plan, enablement plan, success signals. Open a plan to review it.">
        {l.assets.length === 0 ? (
          <EmptyState>No launch plan yet.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {l.assets.map((a) => {
              const v = a.versions[0];
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`/assets/${a.id}`} className="font-medium underline-offset-4 hover:underline">
                    {a.title}
                  </Link>
                  <span className="text-muted-foreground">{ASSET_TYPE_LABEL[a.type]}</span>
                  <StateBadge state={a.state} />
                  {v ? (
                    <>
                      v{v.versionNumber} <ModeBadge mode={v.generationMode} /> <GatesBadge passed={v.gatesPassed} />
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section id="runs" title="Runs">
        {l.workflowRuns.length === 0 ? (
          <EmptyState>No runs yet.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {l.workflowRuns.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/workflows/${w.id}`} className="font-mono text-xs underline-offset-4 hover:underline">
                  {w.id}
                </Link>
                <StateBadge state={w.status} /> <ModeBadge mode={w.generationMode} /> {fmtDate(w.createdAt)}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
