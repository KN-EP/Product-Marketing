import Link from "next/link";
import { notFound } from "next/navigation";
import { GatesBadge, ModeBadge, StateBadge } from "@/components/app/badges";
import { PageHeader, Section } from "@/components/app/page-header";
import { ExportMarkdownButton, SubmitForReviewButton } from "@/components/review/asset-actions";
import { AssetContent } from "@/components/review/asset-content";
import { DecisionForm } from "@/components/review/decision-form";
import { EvidencePanel } from "@/components/review/evidence-panel";
import { GateReportView } from "@/components/review/gate-report";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canReview, hasRole } from "@/domain/actor";
import { currentVersion, generationLabel, latestApprovedVersion } from "@/domain/assets/asset-state";
import { runQualityGates } from "@/domain/quality-gates/gates";
import { collectStatements } from "@/domain/schemas/agents";
import { ASSET_TYPE_LABEL, fmtDate } from "@/lib/format";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";
import { or404 } from "@/server/http/page";

export const dynamic = "force-dynamic";

/**
 * Review screen. The route param identifies the asset; the tenant comes from
 * the session. ?v=<versionId> shows an older version (read-only).
 */
export default async function AssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ v?: string | string[] }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const actor = await requirePageActor();
  const tdb = tenantDb(actor, getDb());
  const rec = await or404(tdb.assets.getRecord(id));
  const [{ snapshot }, names, runs] = await Promise.all([
    tdb.knowledge.snapshot(),
    tdb.memberNames([...new Set(rec.approvals.map((a) => a.reviewerId))]),
    tdb.views.versionRuns(id),
  ]);

  const current = currentVersion(rec) ?? rec.versions.at(-1);
  const requested = typeof sp.v === "string" ? sp.v : undefined;
  const viewed = requested ? rec.versions.find((v) => v.id === requested) : current;
  if (requested && !viewed) notFound();
  const approved = latestApprovedVersion(rec);
  const isCurrent = !!viewed && viewed.id === current?.id;

  // Live re-check of the current version against today's knowledge base — the
  // same check decide() runs, so the UI shows what would block approval.
  const live = current ? runQualityGates(rec.type, current.content, snapshot) : null;
  const liveCritical = live?.findings.filter((f) => f.severity === "critical") ?? [];
  const approveBlockedReasons = live && !live.passed
    ? [`${liveCritical.length} critical finding(s) in the gate re-check against the current knowledge base.`, ...liveCritical.slice(0, 3).map((f) => f.message)]
    : [];

  const statementPaths = new Set(viewed ? collectStatements(viewed.content).map((x) => x.path) : []);
  const showDecision = rec.state === "pending_review" && isCurrent && canReview(actor);
  const showSubmit = (rec.state === "draft" || rec.state === "changes_requested") && isCurrent && hasRole(actor, "editor");
  const showEdit = hasRole(actor, "editor") && rec.state !== "archived" && rec.state !== "pending_review";

  return (
    <>
      <PageHeader
        title={rec.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {ASSET_TYPE_LABEL[rec.type]} · <StateBadge state={rec.state} /> · {rec.versions.length} version(s)
          </span>
        }
        actions={
          <>
            {showEdit ? (
              <Link href={`/assets/${rec.id}/edit`} className={buttonVariants({ variant: "outline" })}>
                Create corrected version
              </Link>
            ) : null}
            {approved ? (
              <ExportMarkdownButton assetId={rec.id} versionNumber={approved.version.versionNumber} fileStem={rec.type.replace(/_/g, "-")} />
            ) : null}
          </>
        }
      />

      {rec.state === "approved" && approved ? (
        <Alert>
          <AlertTitle>Approved: v{approved.version.versionNumber}</AlertTitle>
          <AlertDescription>
            Approved by {names.get(approved.approval.reviewerId) ?? "a former member"} on {fmtDate(approved.approval.createdAt)}.
          </AlertDescription>
        </Alert>
      ) : null}
      {viewed && !isCurrent ? (
        <Alert>
          <AlertTitle>Viewing v{viewed.versionNumber} (not the current version)</AlertTitle>
          <AlertDescription>
            Decisions apply only to the current version.{" "}
            <Link href={`/assets/${rec.id}`} className="underline underline-offset-2">
              Show current version
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      {viewed ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <Section
              id="content"
              title={`Content — v${viewed.versionNumber}`}
              description={`${generationLabel(rec, viewed)} · created ${fmtDate(viewed.createdAt)} · schema ${viewed.schemaVersion}`}
            >
              <AssetContent content={viewed.content} findings={viewed.gateReport.findings} />
            </Section>
            <Section id="evidence" title="Source evidence" description="The stored excerpt behind every reference in this version.">
              <EvidencePanel content={viewed.content} kb={snapshot} />
            </Section>
          </div>

          <div className="flex flex-col gap-6">
            {showDecision && current ? (
              <Section id="decision" title="Review decision">
                <DecisionForm
                  assetId={rec.id}
                  versionId={current.id}
                  versionNumber={current.versionNumber}
                  requiresExpertReview={!!live?.requiresExpertReview}
                  approveBlockedReasons={approveBlockedReasons}
                />
              </Section>
            ) : null}
            {showSubmit ? (
              <Section id="submit" title="Ready for review?" description="Gates run again when a reviewer decides.">
                <SubmitForReviewButton assetId={rec.id} />
              </Section>
            ) : null}
            {rec.state === "pending_review" && !canReview(actor) ? (
              <p className="text-sm text-muted-foreground">Awaiting a reviewer. Only reviewers and admins can decide.</p>
            ) : null}

            <Section id="gates" title="Gate report" description={`Stored with v${viewed.versionNumber} at generation time.`}>
              <GateReportView report={viewed.gateReport} statementPaths={statementPaths} />
              {isCurrent && live && live.passed !== viewed.gatesPassed ? (
                <p className="text-sm font-medium text-destructive">
                  Re-check against the current knowledge base: {live.passed ? "now passes" : "now fails"} — the knowledge base changed since generation.
                </p>
              ) : null}
            </Section>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">This asset has no versions yet.</p>
      )}

      <Section id="history" title="Version history">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Origin</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Checks</TableHead>
              <TableHead>Decisions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...rec.versions].reverse().map((v) => {
              const decisions = rec.approvals.filter((a) => a.assetVersionId === v.id);
              const runId = runs.get(v.id);
              return (
                <TableRow key={v.id} aria-current={v.id === viewed?.id ? "true" : undefined}>
                  <TableCell>
                    <Link href={`/assets/${rec.id}?v=${v.id}`} className="font-medium underline-offset-4 hover:underline">
                      v{v.versionNumber}
                    </Link>
                    {v.id === current?.id ? <span className="ml-2 text-xs text-muted-foreground">current</span> : null}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <ModeBadge mode={v.generationMode} label={generationLabel(rec, v)} />
                    {runId ? (
                      <Link href={`/workflows/${runId}`} className="ml-2 text-xs underline underline-offset-2">
                        run
                      </Link>
                    ) : null}
                  </TableCell>
                  <TableCell>{fmtDate(v.createdAt)}</TableCell>
                  <TableCell>
                    <GatesBadge passed={v.gatesPassed} />
                  </TableCell>
                  <TableCell className="whitespace-normal text-xs">
                    {decisions.length === 0
                      ? "—"
                      : decisions.map((d, i) => (
                          <p key={i}>
                            <span className="font-medium">{d.decision.replace("_", " ")}</span> by {names.get(d.reviewerId) ?? "former member"},{" "}
                            {fmtDate(d.createdAt)}
                            {d.comment ? <span className="block text-muted-foreground">&ldquo;{d.comment}&rdquo;</span> : null}
                          </p>
                        ))}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Section>
    </>
  );
}
