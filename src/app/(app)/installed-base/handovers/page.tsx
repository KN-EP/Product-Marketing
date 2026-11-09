import Link from "next/link";
import { EmptyState, PageHeader, Section } from "@/components/app/page-header";
import { HandoverActions } from "@/components/installed-base/handover-actions";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasRole } from "@/domain/actor";
import { CLOSED_STATUSES, HANDOVER_SLA_DAYS, HandoverStatus, isOverdue, OFFER_LABEL, STATUS_LABEL } from "@/domain/installed-base/installed-base";
import { REASON_LABEL, REASONS_BY_PROFILE } from "@/domain/research/win-loss";
import { fmtDay } from "@/lib/format";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";

export const dynamic = "force-dynamic";

/** M18: the service → sales pipeline with deadlines, and why closed hand-overs were won or lost. */
export default async function HandoversPage() {
  const actor = await requirePageActor();
  const tdb = tenantDb(actor, getDb());
  const [handovers, profile] = await Promise.all([tdb.views.handovers(), tdb.tenant.industryProfile()]);
  const today = new Date();
  const canEdit = hasRole(actor, "editor");
  const open = handovers.filter((h) => !CLOSED_STATUSES.includes(h.status as HandoverStatus));
  const closed = handovers.filter((h) => CLOSED_STATUSES.includes(h.status as HandoverStatus));
  const byStatus = HandoverStatus.options.map((s) => [s, handovers.filter((h) => h.status === s).length] as const);
  const reasonCounts = new Map<string, number>();
  for (const h of closed) for (const r of h.reasons) reasonCounts.set(`${h.status}|${r}`, (reasonCounts.get(`${h.status}|${r}`) ?? 0) + 1);

  return (
    <>
      <PageHeader
        title="Service → sales hand-overs"
        description={`Findings from field service, handed over to sales. Sales contacts the customer within ${HANDOVER_SLA_DAYS} days; overdue hand-overs are marked. Closing records reason codes — the same codes as win/loss interviews.`}
        actions={
          <Link href="/installed-base" className="text-sm underline-offset-4 hover:underline">
            Installed base
          </Link>
        }
      />
      <dl className="grid grid-cols-3 gap-3 md:grid-cols-6" aria-label="Hand-overs by status">
        {byStatus.map(([s, n]) => (
          <div key={s} className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">{STATUS_LABEL[s]}</dt>
            <dd className="text-xl font-semibold tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>
      <Section title="Open">
        {open.length === 0 ? (
          <EmptyState>No open hand-overs.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unit</TableHead>
                <TableHead>Offer</TableHead>
                <TableHead>Finding</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
                {canEdit ? <TableHead>Next step</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {open.map((h) => (
                <TableRow key={h.id}>
                  <TableCell data-label="Unit" className="whitespace-normal">
                    <Link href={`/installed-base/${h.unit.id}`} className="font-medium underline-offset-4 hover:underline">
                      {h.unit.unitRef}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {h.unit.product.name} · {h.unit.accountLabel} · {h.unit.region}
                    </span>
                  </TableCell>
                  <TableCell data-label="Offer">{OFFER_LABEL[h.offer]}</TableCell>
                  <TableCell data-label="Finding" className="max-w-sm whitespace-normal text-sm">
                    {h.finding}
                  </TableCell>
                  <TableCell data-label="Status">{STATUS_LABEL[h.status as HandoverStatus]}</TableCell>
                  <TableCell data-label="Due">
                    {fmtDay(h.dueOn)} {isOverdue(h, today) ? <Badge variant="destructive">overdue</Badge> : null}
                  </TableCell>
                  {canEdit ? (
                    <TableCell data-label="Next step" className="whitespace-normal">
                      <HandoverActions handoverId={h.id} status={h.status} reasonCodes={REASONS_BY_PROFILE[profile]} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
      <Section title="Why closed hand-overs were won or lost" description="Counted in code from the reason codes recorded at closing.">
        {reasonCounts.size === 0 ? (
          <EmptyState>Nothing closed yet.</EmptyState>
        ) : (
          <ul className="grid gap-1 text-sm md:grid-cols-2">
            {[...reasonCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([k, n]) => {
                const [status, r] = k.split("|") as [HandoverStatus, string];
                return (
                  <li key={k}>
                    <Badge variant={status === "won" ? "default" : "outline"} className="mr-2">
                      {STATUS_LABEL[status]}
                    </Badge>
                    {(REASON_LABEL as Record<string, string>)[r] ?? r}: {n}
                  </li>
                );
              })}
          </ul>
        )}
      </Section>
    </>
  );
}
