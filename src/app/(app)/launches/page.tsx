import Link from "next/link";
import { SyntheticTag } from "@/components/app/badges";
import { EmptyState, PageHeader, Section } from "@/components/app/page-header";
import { CreateLaunchForm } from "@/components/launch/create-form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasRole } from "@/domain/actor";
import { PHASE_DATE_FIELD, PHASE_LABEL, TIER_LABEL } from "@/domain/launches/launch";
import { LAUNCH_PHASES } from "@/domain/schemas/launch";
import { fmtDay } from "@/lib/format";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";

export const dynamic = "force-dynamic";

/** M15 station "Launch": staged launches and the launch briefing form. */
export default async function LaunchesPage() {
  const actor = await requirePageActor();
  const v = tenantDb(actor, getDb()).views;
  const [launches, products, releases] = await Promise.all([v.launches(), v.products(), v.releases()]);
  const canCreate = hasRole(actor, "editor");

  return (
    <>
      <PageHeader
        title="Launches"
        description="Staged launches: early access → general availability → existing customers → market. Readiness per phase is computed from approved deliverables, claims and proof; people decide go / no-go. Nothing is published from here."
      />
      <Section title="Launch plan" description="Phases and the latest go / no-go decision per phase.">
        {launches.length === 0 ? (
          <EmptyState>No launches planned yet.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Launch</TableHead>
                <TableHead>Tier</TableHead>
                {LAUNCH_PHASES.map((p) => (
                  <TableHead key={p}>{PHASE_LABEL[p]}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {launches.map((l) => (
                <TableRow key={l.id}>
                  <TableCell data-label="Launch" className="whitespace-normal">
                    <Link href={`/launches/${l.id}`} className="line-clamp-2 font-medium underline-offset-4 hover:underline">
                      {l.name}
                    </Link>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {l.product.name} {l.isSynthetic ? <SyntheticTag /> : null}
                    </span>
                  </TableCell>
                  <TableCell data-label="Tier">{TIER_LABEL[l.tier].split(" — ")[0]}</TableCell>
                  {LAUNCH_PHASES.map((p) => {
                    const date = l[PHASE_DATE_FIELD[p]];
                    const latest = l.decisions.find((d) => d.phase === p);
                    return (
                      <TableCell key={p} data-label={PHASE_LABEL[p]}>
                        {date ? fmtDay(date) : "—"}
                        {latest ? <span className="block text-xs text-muted-foreground">{latest.decision === "go" ? "go" : "no-go"}</span> : null}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
      <Section title="Plan a launch" description="The briefing is human input. Proof means what it says: an internal pilot is internal proof, a reference needs the customer's documented approval.">
        {!canCreate ? (
          <EmptyState>Only editors can plan launches.</EmptyState>
        ) : products.length ? (
          <CreateLaunchForm
            products={products.map((p) => ({ id: p.id, label: p.name }))}
            releases={releases.map((r) => ({ id: r.id, label: `${r.name} · ${r.version}`, productId: r.product.id }))}
          />
        ) : (
          <EmptyState>A launch needs a product.</EmptyState>
        )}
      </Section>
    </>
  );
}
