import Link from "next/link";
import { GatesBadge, ModeBadge, StateBadge, SyntheticTag } from "@/components/app/badges";
import { EmptyState, PageHeader, Section } from "@/components/app/page-header";
import { StartRunButton } from "@/components/campaign/generate-button";
import { InterviewForm } from "@/components/research/interview-form";
import { WithdrawConsentButton } from "@/components/research/withdraw-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasRole } from "@/domain/actor";
import {
  computeWinLossStats,
  MIN_INTERVIEWS_FOR_SYNTHESIS,
  OUTCOME_LABEL,
  REASON_LABEL,
  type ConsentStatus,
  type DealOutcome,
} from "@/domain/research/win-loss";
import { fmtDate, fmtDay } from "@/lib/format";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";

export const dynamic = "force-dynamic";

const reasonLabel = (r: string) => (REASON_LABEL as Record<string, string>)[r] ?? r;

/**
 * M14 station "Win/loss & research": pseudonymised interviews with consent
 * tracking, statistics computed in code, and the win/loss synthesis run.
 */
export default async function ResearchPage() {
  const actor = await requirePageActor();
  const v = tenantDb(actor, getDb()).views;
  const [interviews, products, competitors, syntheses] = await Promise.all([v.interviews(), v.products(), v.competitors(), v.winLossSyntheses()]);
  const canEdit = hasRole(actor, "editor");

  const byProduct = products
    .map((p) => {
      const xs = interviews.filter((i) => i.product.id === p.id);
      const stats = computeWinLossStats(
        xs.map((i) => ({
          outcome: i.outcome as DealOutcome,
          segment: i.segment,
          reasons: i.reasons,
          primaryReason: i.primaryReason,
          consentStatus: i.consentStatus as ConsentStatus,
          competitorName: i.competitor?.name ?? null,
        })),
      );
      return { product: p, total: xs.length, stats };
    })
    .filter((x) => x.total > 0);

  return (
    <>
      <PageHeader
        title="Win/loss & research"
        description="Why deals are won, lost or churned — from pseudonymised interviews, with the same reason codes as the CRM. Numbers are computed from the consented interviews; the research agent may only quote them, and every quote must be a verbatim excerpt."
      />
      <Alert>
        <AlertTitle>Consent first</AlertTitle>
        <AlertDescription>
          Notes are stored only with granted consent, as a confidential interview source that agent prompts never see — except the win/loss synthesis of the same
          product. Withdrawn consent erases the notes and invalidates the source: anything that cited it fails the quality gates again.
        </AlertDescription>
      </Alert>

      <Section id="stats" title="Computed statistics" description="Consented interviews only. Computed in code, not generated.">
        {byProduct.length === 0 ? (
          <EmptyState>No interviews recorded yet.</EmptyState>
        ) : (
          byProduct.map(({ product, total, stats }) => (
            <div key={product.id} className="flex flex-col gap-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm">
                  <span className="font-medium">{product.name}</span> — {stats.interviews} of {total} interviews consented · won {stats.won} · lost {stats.lost} · churned{" "}
                  {stats.churned} · no decision {stats.noDecision}
                  {stats.winRatePct !== null ? ` · win rate (decided deals) ${stats.winRatePct} %` : ""}
                </p>
                {canEdit ? (
                  <StartRunButton
                    input={{ kind: "win_loss_synthesis", productId: product.id }}
                    label="Generate win/loss synthesis"
                    disabled={stats.interviews < MIN_INTERVIEWS_FOR_SYNTHESIS}
                  />
                ) : null}
              </div>
              {stats.interviews < MIN_INTERVIEWS_FOR_SYNTHESIS ? (
                <p className="text-sm text-muted-foreground">A synthesis needs at least {MIN_INTERVIEWS_FOR_SYNTHESIS} consented interviews.</p>
              ) : null}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reason</TableHead>
                    <TableHead>Named</TableHead>
                    <TableHead>Primary</TableHead>
                    <TableHead>Won</TableHead>
                    <TableHead>Lost</TableHead>
                    <TableHead>Churned</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.reasons.map((r) => (
                    <TableRow key={r.code}>
                      <TableCell data-label="Reason">{r.label}</TableCell>
                      <TableCell data-label="Named">{r.total}</TableCell>
                      <TableCell data-label="Primary">{r.primary}</TableCell>
                      <TableCell data-label="Won">{r.won}</TableCell>
                      <TableCell data-label="Lost">{r.lost}</TableCell>
                      <TableCell data-label="Churned">{r.churned}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))
        )}
      </Section>

      <Section id="syntheses" title="Win/loss syntheses" description="Drivers, patterns and implications — interpretations and hypotheses for people to decide on. Open one to review it.">
        {syntheses.length === 0 ? (
          <EmptyState>No synthesis yet.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {syntheses.map((a) => {
              const latest = a.versions[0];
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`/assets/${a.id}`} className="font-medium underline-offset-4 hover:underline">
                    {a.title}
                  </Link>
                  <StateBadge state={a.state} />
                  {latest ? (
                    <>
                      v{latest.versionNumber} <ModeBadge mode={latest.generationMode} /> <GatesBadge passed={latest.gatesPassed} />
                    </>
                  ) : null}
                  <span className="text-muted-foreground">{fmtDate(a.createdAt)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section id="interviews" title="Interviews" description="Pseudonymised accounts. Notes are not shown here; they live in the consented interview source.">
        {interviews.length === 0 ? (
          <EmptyState>No interviews recorded yet.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Decided</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Competitor</TableHead>
                <TableHead>Reasons</TableHead>
                <TableHead>Consent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {interviews.map((i) => (
                <TableRow key={i.id}>
                  <TableCell data-label="Decided">{i.decidedOn ? fmtDay(i.decidedOn) : "—"}</TableCell>
                  <TableCell data-label="Account" className="whitespace-normal">
                    <span className="font-medium">{i.accountLabel}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {i.segment} · {i.product.name} {i.isSynthetic ? <SyntheticTag /> : null}
                    </span>
                  </TableCell>
                  <TableCell data-label="Outcome">{OUTCOME_LABEL[i.outcome as DealOutcome]}</TableCell>
                  <TableCell data-label="Competitor">{i.competitor?.name ?? "None / status quo"}</TableCell>
                  <TableCell data-label="Reasons" className="whitespace-normal">
                    <span className="font-medium">{reasonLabel(i.primaryReason)}</span>
                    {i.reasons.filter((r) => r !== i.primaryReason).length ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {i.reasons.filter((r) => r !== i.primaryReason).map(reasonLabel).join(", ")}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell data-label="Consent">
                    <span className="flex flex-wrap items-center gap-2">
                      <StateBadge state={i.consentStatus} />
                      {i.sourceId && i.consentStatus === "granted" ? (
                        <Link href="/knowledge/sources" className="text-xs underline underline-offset-2">
                          source
                        </Link>
                      ) : null}
                      {canEdit && i.consentStatus === "granted" ? <WithdrawConsentButton interviewId={i.id} /> : null}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section id="record" title="Record an interview" description="Pseudonymise the account. Use the reason codes of the CRM loss-reason field. Notes only with granted consent.">
        {!canEdit ? (
          <EmptyState>Only editors can record interviews.</EmptyState>
        ) : products.length ? (
          <InterviewForm products={products.map((p) => ({ id: p.id, label: p.name }))} competitors={competitors.map((c) => ({ id: c.id, label: c.name }))} />
        ) : (
          <EmptyState>An interview needs a product.</EmptyState>
        )}
      </Section>
    </>
  );
}
