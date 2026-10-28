import Link from "next/link";
import { GatesBadge, ModeBadge, StateBadge } from "@/components/app/badges";
import { EmptyState, PageHeader, Section } from "@/components/app/page-header";
import { InputBrief } from "@/components/review/input-brief";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AutoRefresh, MarkRunFailedButton, RetryRunButton } from "@/components/workflow/run-actions";
import { hasRole } from "@/domain/actor";
import { WORKFLOW_LIMITS } from "@/domain/workflow/workflow-state";
import { ASSET_TYPE_LABEL, fmtDate, fmtUsd, RUN_KIND_LABEL } from "@/lib/format";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { ACTIVE_RUN_STATUSES, tenantDb } from "@/server/db/tenant-scope";
import { or404 } from "@/server/http/page";
import { CAMPAIGN_GTM, isStale, STALE_RUN_AFTER_MS } from "@/server/workflow/orchestrator";
import { getOrchestrator } from "@/server/workflow/runtime";

export const dynamic = "force-dynamic";

const STEP_LABEL: Record<string, string> = {
  "workflow.created": "Created",
  "workflow.queued": "Queued",
  "workflow.running": "Running",
  "workflow.validation": "Validation (quality gates)",
  "workflow.pending_review": "Outputs in human review",
  "workflow.completed": "Completed (outputs await review — not approved)",
  "workflow.failed": "Failed",
};

export default async function WorkflowRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageActor();
  const details = await or404(getOrchestrator().get(actor, id));
  const tdb = tenantDb(actor, getDb());
  const raw = await tdb.workflowRuns.getById(id);
  const { run, history, outputs } = details;
  const deliverables = outputs.filter((o) => !o.internal);
  const briefOut = outputs.find((o) => o.internal);
  const brief = briefOut ? (await tdb.assets.getRecord(briefOut.assetId)).versions.find((v) => v.id === briefOut.versionId) : undefined;
  const active = ACTIVE_RUN_STATUSES.includes(run.status);
  const stale = isStale(raw, new Date());
  const usage = (run.usage ?? null) as Record<string, number> | null;
  const promptVersions = (run.promptVersions ?? {}) as Record<string, string>;
  const refs = (run.inputRefs ?? {}) as { market?: string };
  const isCampaign = run.kind === CAMPAIGN_GTM;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Workflow run <span className="font-mono text-base">{run.id}</span>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StateBadge state={run.status} /> <ModeBadge mode={run.generationMode} /> · {RUN_KIND_LABEL[run.kind] ?? run.kind} ·{" "}
            {isCampaign && raw.campaignId ? (
              <Link href={`/campaigns/${raw.campaignId}`} className="underline underline-offset-2">
                Campaign
              </Link>
            ) : (
              <>market: {refs.market ?? "—"}</>
            )}
          </span>
        }
        actions={
          <Link href="/workflows" className="text-sm underline underline-offset-2">
            All runs
          </Link>
        }
      />
      <AutoRefresh active={active && !stale} />

      {run.status === "failed" ? (
        <Alert variant="destructive">
          <AlertTitle>Run failed</AlertTitle>
          <AlertDescription>
            <p>{run.error ?? "No error recorded."}</p>
            <p className="mt-1">
              Attempt {run.attempts} of {WORKFLOW_LIMITS.maxAttempts}. Retrying is an explicit action.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {run.status === "failed" && run.attempts < WORKFLOW_LIMITS.maxAttempts && hasRole(actor, "editor") ? <RetryRunButton runId={run.id} /> : null}
        {active && hasRole(actor, "admin") ? (
          stale ? (
            <MarkRunFailedButton runId={run.id} />
          ) : (
            <p className="text-xs text-muted-foreground">
              Admins can mark this run as failed if it shows no progress for {STALE_RUN_AFTER_MS / 60_000} minutes.
            </p>
          )
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Status timeline" description="From the audit log.">
          <ol className="flex flex-col gap-2 border-l pl-4 text-sm">
            {history.map((h, i) => (
              <li key={i} className="relative">
                <span aria-hidden className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-foreground" />
                <span className="font-medium">{STEP_LABEL[h.action] ?? h.action}</span>
                <span className="ml-2 text-xs text-muted-foreground">{fmtDate(h.at)}</span>
              </li>
            ))}
          </ol>
        </Section>
        <Section title="Run details">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Model</dt>
            <dd className="font-mono text-xs">{run.modelId ?? "—"}</dd>
            <dt className="text-muted-foreground">Cost (estimate)</dt>
            <dd>{fmtUsd(run.costEstimateUsd)}</dd>
            <dt className="text-muted-foreground">Tokens in / out</dt>
            <dd className="tabular-nums">{usage ? `${usage.inputTokens ?? 0} / ${usage.outputTokens ?? 0}` : "—"}</dd>
            <dt className="text-muted-foreground">Model requests</dt>
            <dd className="tabular-nums">{usage?.llmRequests ?? "—"}</dd>
            <dt className="text-muted-foreground">Attempts</dt>
            <dd className="tabular-nums">{run.attempts}</dd>
            <dt className="text-muted-foreground">Started</dt>
            <dd>{fmtDate(run.startedAt)}</dd>
            <dt className="text-muted-foreground">Finished</dt>
            <dd>{fmtDate(run.completedAt)}</dd>
          </dl>
          <h3 className="mt-2 text-sm font-medium">Prompt versions</h3>
          <ul className="text-sm">
            {Object.entries(promptVersions).map(([pid, ver]) => (
              <li key={pid} className="font-mono text-xs">
                {pid} @ {ver}
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section
        title={`Deliverables (${deliverables.length})`}
        description={`${isCampaign ? "Campaign plan, content matrix and sales play" : "Messaging framework, competitive battlecard and regulatory GTM brief"}. Each was checked by the quality gates on generation and waits for human review — a failed check blocks approval, not review.`}
      >
        {deliverables.length === 0 ? (
          <EmptyState>{active ? "Deliverables appear here when the run reaches review." : "This run produced no deliverables."}</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Checks (v1)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliverables.map((o) => (
                <TableRow key={o.versionId}>
                  <TableCell data-label="Asset" className="whitespace-normal">
                    <Link href={`/assets/${o.assetId}`} className="line-clamp-2 font-medium underline-offset-4 hover:underline" title={o.title}>
                      {o.title}
                    </Link>
                  </TableCell>
                  <TableCell data-label="Type">{ASSET_TYPE_LABEL[o.assetType]}</TableCell>
                  <TableCell data-label="State">
                    <StateBadge state={o.assetState} />
                  </TableCell>
                  <TableCell data-label="Checks (v1)">
                    <GatesBadge passed={o.gatesPassed} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      {brief ? (
        <Section title="Input brief" description="Agent A output used as input for agents B and C. Internal — not a deliverable.">
          <InputBrief content={brief.content} gateReport={brief.gateReport} generationMode={brief.generationMode} createdAt={brief.createdAt} />
        </Section>
      ) : null}
    </>
  );
}
