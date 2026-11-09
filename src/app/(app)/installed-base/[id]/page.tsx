import Link from "next/link";
import { SyntheticTag } from "@/components/app/badges";
import { EmptyState, PageHeader, Section } from "@/components/app/page-header";
import { FindingForm } from "@/components/installed-base/finding-form";
import { HandoverActions } from "@/components/installed-base/handover-actions";
import { Badge } from "@/components/ui/badge";
import { hasRole } from "@/domain/actor";
import type { CostResult } from "@/domain/installed-base/cost";
import { assessUnit, isOverdue, OFFER_LABEL, STATUS_LABEL, TRIGGER_LABEL, type HandoverStatus } from "@/domain/installed-base/installed-base";
import { REASON_LABEL, REASONS_BY_PROFILE } from "@/domain/research/win-loss";
import { fmtDate, fmtDay } from "@/lib/format";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";
import { or404 } from "@/server/http/page";

export const dynamic = "force-dynamic";

/** M18: one installed unit — facts, computed triggers, findings and hand-overs, cost comparisons. */
export default async function InstalledUnitPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor();
  const { id } = await params;
  const tdb = tenantDb(actor, getDb());
  const [u, profile] = await Promise.all([or404(tdb.views.installedUnit(id)), tdb.tenant.industryProfile()]);
  const today = new Date();
  const a = assessUnit(u, today);
  const canEdit = hasRole(actor, "editor");
  const fact = (label: string, value: React.ReactNode) => (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </>
  );

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {u.unitRef} <span className="text-muted-foreground">· {u.product.name}</span> {u.isSynthetic ? <SyntheticTag /> : null}
          </span>
        }
        description={`${u.accountLabel} · ${u.region} · ${u.application}`}
        actions={
          <Link href={`/installed-base/calculator?unit=${u.id}`} className="text-sm underline-offset-4 hover:underline">
            Compare cost per part
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Facts (imported)">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {fact("Installed", `${fmtDay(u.installedOn)} (${a.ageYears} years)`)}
            {fact("Service contract", u.serviceContract ? "Yes" : "No")}
            {fact("Spare-part orders (12 months)", u.sparePartOrders12m)}
            {fact("Material change planned", u.materialChangePlanned ? "Yes" : "No")}
            {fact("Regulated application", u.regulatedApplication ? "Yes" : "No")}
            {fact("Last service", u.lastServiceOn ? fmtDay(u.lastServiceOn) : "—")}
          </dl>
        </Section>
        <Section title="Computed" description="Same facts → same result. Rule: material change, or old and worn → retrofit; older than 20 years and worn → replacement; no contract → service contract; else spare parts.">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {fact(
              "Triggers",
              a.triggers.length ? (
                <span className="flex flex-wrap gap-1">
                  {a.triggers.map((t) => (
                    <Badge key={t} variant="outline" className="font-normal">
                      {TRIGGER_LABEL[t]}
                    </Badge>
                  ))}
                </span>
              ) : (
                "none"
              ),
            )}
            {fact("Score", a.score)}
            {fact("Suggested offer", OFFER_LABEL[a.suggestedOffer])}
          </dl>
        </Section>
      </div>
      <Section title="Report a finding" description="Field service hands over to sales. The deadline is computed; overdue hand-overs show on the hand-over list.">
        {canEdit ? <FindingForm unitId={u.id} suggestedOffer={a.suggestedOffer} /> : <EmptyState>Only editors can report findings.</EmptyState>}
      </Section>
      <Section title="Hand-overs">
        {u.handovers.length === 0 ? (
          <EmptyState>No findings handed over yet.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {u.handovers.map((h) => (
              <li key={h.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant={h.status === "won" ? "default" : h.status === "lost" ? "destructive" : "secondary"}>{STATUS_LABEL[h.status as HandoverStatus]}</Badge>
                  <span className="font-medium">{OFFER_LABEL[h.offer]}</span>
                  <span className="text-muted-foreground">
                    reported {fmtDate(h.reportedAt)} by {h.reportedBy.name} · due {fmtDay(h.dueOn)}
                  </span>
                  {isOverdue(h, today) ? <Badge variant="destructive">overdue</Badge> : null}
                </div>
                <p className="mt-2 text-sm">{h.finding}</p>
                {h.reasons.length ? (
                  <p className="mt-1 text-xs text-muted-foreground">Reasons: {h.reasons.map((r) => (REASON_LABEL as Record<string, string>)[r] ?? r).join(", ")}</p>
                ) : null}
                {canEdit ? (
                  <div className="mt-2">
                    <HandoverActions handoverId={h.id} status={h.status} reasonCodes={REASONS_BY_PROFILE[profile]} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Cost comparisons">
        {u.costComparisons.length === 0 ? (
          <EmptyState>None yet.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {u.costComparisons.map((c) => {
              const r = c.result as unknown as CostResult;
              return (
                <li key={c.id}>
                  <Link href={`/installed-base/calculator/${c.id}`} className="underline-offset-4 hover:underline">
                    {c.title}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    · {fmtDay(c.createdAt)} · {r.status === "measured" ? "measured inputs" : "contains assumptions"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}
