import Link from "next/link";
import { GatesBadge, ModeBadge, StateBadge } from "@/components/app/badges";
import { EmptyState, PageHeader, Section } from "@/components/app/page-header";
import { StartCampaignRunButton } from "@/components/campaign/generate-button";
import { CreateKpiTreeButton, CsvImport, KpiTreeEditor } from "@/components/kpi/kpi-editor";
import { KpiResultsTable } from "@/components/kpi/results-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasRole } from "@/domain/actor";
import { computeKpiResults, PACE_THRESHOLDS } from "@/domain/kpis/analysis";
import { fmtDate, fmtDay } from "@/lib/format";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";
import { or404 } from "@/server/http/page";

export const dynamic = "force-dynamic";

/**
 * KPI analysis of a campaign (M11): KPI tree from the approved plan, human
 * targets, CSV imports, the deterministic target/actual table and the
 * performance reviews (agent G, human review). Tenant from the session.
 */
export default async function CampaignPerformancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageActor();
  const tdb = tenantDb(actor, getDb());
  const c = await or404(tdb.views.campaignPerformance(id));
  const kpis = await tdb.kpis.listForCampaign(c.id);
  const canEdit = hasRole(actor, "editor");
  const asOf = new Date().toISOString().slice(0, 10);
  const window = { startsOn: c.startsOn ? fmtDay(c.startsOn) : null, endsOn: c.endsOn ? fmtDay(c.endsOn) : null };
  const results = computeKpiResults(kpis, window, asOf);
  const measured = results.reduce((n, r) => n + r.measurements, 0);

  return (
    <>
      <PageHeader
        title={
          <span className="line-clamp-2" title={c.name}>
            Performance — {c.name}
          </span>
        }
        description={`Campaign window ${window.startsOn ?? "open"} – ${window.endsOn ?? "open"} · analysis as of ${asOf} (UTC)`}
        actions={
          <>
            <Link href={`/campaigns/${c.id}`} className="text-sm underline underline-offset-2">
              Back to campaign
            </Link>
            {canEdit && measured > 0 ? (
              <StartCampaignRunButton kind="campaign_performance" campaignId={c.id} label="Generate performance review" />
            ) : null}
          </>
        }
      />

      <Alert>
        <AlertTitle>Numbers are computed, not generated</AlertTitle>
        <AlertDescription>
          Actual, expected-to-date and pace are calculated from the imported measurements. The performance review (Agent G) may only quote these
          numbers — gate G10 blocks any other number in a fact. Causes are hypotheses; correlation is not causation.
        </AlertDescription>
      </Alert>

      <Section
        id="kpis"
        title="KPI tree"
        description="From the approved campaign plan. The plan only proposes targets — the numeric target and baseline are set here by the team."
      >
        {kpis.length > 0 ? (
          <KpiTreeEditor
            canEdit={canEdit}
            kpis={kpis.map((k) => ({
              id: k.id,
              name: k.name,
              funnelStage: k.funnelStage,
              definition: k.definition,
              dataSource: k.dataSource,
              unit: k.unit,
              direction: k.direction,
              aggregation: k.aggregation,
              target: k.target,
              baseline: k.baseline,
            }))}
          />
        ) : c.approvedPlan ? (
          canEdit ? (
            <CreateKpiTreeButton campaignId={c.id} planVersion={c.approvedPlan.versionNumber} />
          ) : (
            <EmptyState>No KPI tree yet. An editor can create it from the approved plan.</EmptyState>
          )
        ) : (
          <EmptyState>
            The KPI tree comes from the approved campaign plan.{" "}
            {c.latestPlan ? (
              <Link href={`/assets/${c.latestPlan.id}`} className="underline underline-offset-2">
                Review the campaign plan ({c.latestPlan.state.replace(/_/g, " ")})
              </Link>
            ) : (
              <Link href={`/campaigns/${c.id}`} className="underline underline-offset-2">
                Generate the campaign package first
              </Link>
            )}
            .
          </EmptyState>
        )}
      </Section>

      {kpis.length > 0 ? (
        <Section id="import" title="Import measurements" description="CSV export from your web analytics, webinar tool or CRM. Up to 200 KB / 5,000 rows.">
          {canEdit ? (
            <CsvImport campaignId={c.id} kpiNames={kpis.map((k) => k.name)} startsOn={window.startsOn} today={asOf} />
          ) : (
            <EmptyState>Only editors can import measurements.</EmptyState>
          )}
          {c.kpiImports.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead className="text-right">Imported</TableHead>
                  <TableHead className="text-right">Rejected</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {c.kpiImports.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell data-label="File" className="whitespace-normal">
                      {i.fileName}
                    </TableCell>
                    <TableCell data-label="Rows" className="text-right tabular-nums">
                      {i.rowCount}
                    </TableCell>
                    <TableCell data-label="Imported" className="text-right tabular-nums">
                      {i.acceptedRows}
                    </TableCell>
                    <TableCell data-label="Rejected" className="text-right tabular-nums">
                      {Array.isArray(i.rejectedRows) ? i.rejectedRows.length : 0}
                    </TableCell>
                    <TableCell data-label="When">{fmtDate(i.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </Section>
      ) : null}

      {kpis.length > 0 ? (
        <Section
          id="results"
          title="Target vs. actual"
          description={`Pace = actual vs. expected to date (sum KPIs: target pro rata to the elapsed campaign time). On track ≥ ${PACE_THRESHOLDS.onTrack} %, at risk ≥ ${PACE_THRESHOLDS.atRisk} %.`}
        >
          {measured === 0 ? <EmptyState>No measurements in the campaign window up to today yet.</EmptyState> : <KpiResultsTable rows={results} />}
        </Section>
      ) : null}

      <Section id="reviews" title="Performance reviews" description="Generated by Agent G from the computed results; reviewed and approved like every deliverable.">
        {c.assets.length === 0 ? (
          <EmptyState>No performance review yet.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Review</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Latest version</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.assets.map((a) => {
                const v = a.versions[0];
                return (
                  <TableRow key={a.id}>
                    <TableCell data-label="Review" className="whitespace-normal">
                      <Link href={`/assets/${a.id}`} className="line-clamp-2 font-medium underline-offset-4 hover:underline">
                        {a.title}
                      </Link>
                    </TableCell>
                    <TableCell data-label="State">
                      <StateBadge state={a.state} />
                    </TableCell>
                    <TableCell data-label="Latest version">
                      {v ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          v{v.versionNumber} <ModeBadge mode={v.generationMode} /> <GatesBadge passed={v.gatesPassed} />
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Section>
    </>
  );
}
