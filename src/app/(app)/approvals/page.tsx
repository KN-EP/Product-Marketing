import Link from "next/link";
import { GatesBadge, ModeBadge, StateBadge } from "@/components/app/badges";
import { EmptyState, PageHeader, Section } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { GateReport } from "@/domain/quality-gates/gates";
import { ASSET_TYPE_LABEL, fmtDate } from "@/lib/format";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const actor = await requirePageActor();
  const tdb = tenantDb(actor, getDb());
  const [queue, decisions] = await Promise.all([tdb.views.reviewQueue(), tdb.views.recentDecisions()]);
  return (
    <>
      <PageHeader title="Approvals" description="Review queue and recent decisions. Only reviewers and admins can approve; gates re-run at decision time." />
      <Section title="Review queue">
        {queue.length === 0 ? (
          <EmptyState>Nothing is waiting for review.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Checks</TableHead>
                <TableHead>Waiting since</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((a) => {
                const v = a.versions[0];
                const report = v?.gateReport as unknown as GateReport | undefined;
                return (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-normal">
                      <Link href={`/assets/${a.id}`} className="font-medium underline-offset-4 hover:underline">
                        {a.title}
                      </Link>
                    </TableCell>
                    <TableCell>{ASSET_TYPE_LABEL[a.type]}</TableCell>
                    <TableCell>{v ? <span className="flex items-center gap-1.5">v{v.versionNumber} <ModeBadge mode={v.generationMode} /></span> : "—"}</TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1.5">
                        {v ? <GatesBadge passed={v.gatesPassed} /> : null}
                        {report?.requiresExpertReview ? <Badge variant="outline">expert review</Badge> : null}
                      </span>
                    </TableCell>
                    <TableCell>{fmtDate(a.updatedAt)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Section>
      <Section title="Recent decisions">
        {decisions.length === 0 ? (
          <EmptyState>No decisions yet.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Decision</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead>Reviewer</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {decisions.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <StateBadge state={d.decision} />
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <Link href={`/assets/${d.assetVersion.asset.id}`} className="underline-offset-4 hover:underline">
                      {d.assetVersion.asset.title}
                    </Link>{" "}
                    <span className="text-muted-foreground">v{d.assetVersion.versionNumber}</span>
                  </TableCell>
                  <TableCell>{d.reviewer.name}</TableCell>
                  <TableCell>{fmtDate(d.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </>
  );
}
