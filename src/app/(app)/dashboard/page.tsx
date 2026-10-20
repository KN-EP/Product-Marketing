import Link from "next/link";
import { GatesBadge, StateBadge } from "@/components/app/badges";
import { EmptyState, PageHeader, Section } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ASSET_TYPE_LABEL, fmtDate } from "@/lib/format";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const actor = await requirePageActor();
  const tdb = tenantDb(actor, getDb());
  const [tenant, counts, queue, runs, progress] = await Promise.all([
    tdb.tenant.get(),
    tdb.counts(),
    tdb.views.reviewQueue(),
    tdb.views.runs(5),
    tdb.views.demoProgress(),
  ]);

  const stats = [
    { label: "Sources", value: counts.sources, href: "/knowledge/sources" },
    { label: "Claims", value: counts.claims, sub: `${progress.claimsApproved} approved`, href: "/knowledge/claims" },
    { label: "Assets", value: counts.assets, sub: `${progress.assetsApproved} approved`, href: "/assets" },
    { label: "Awaiting review", value: progress.assetsPending, href: "/approvals" },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={tenant.name}
        actions={
          <>
            {tenant.isDemo ? (
              <Link href="/demo" className={buttonVariants({ variant: "outline" })}>
                Guided demo
              </Link>
            ) : null}
            <Link href="/workflows" className={buttonVariants()}>
              Start workflow
            </Link>
          </>
        }
      />

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Key figures">
        {stats.map((s) => (
          <li key={s.label}>
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  <Link href={s.href} className="hover:underline">
                    {s.label}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
                {s.sub ? <p className="text-xs text-muted-foreground">{s.sub}</p> : null}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <Section title="Awaiting review" description="Assets in pending_review, oldest first.">
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((a) => (
                <TableRow key={a.id}>
                  <TableCell data-label="Asset">
                    <Link href={`/assets/${a.id}`} className="line-clamp-2 underline-offset-4 hover:underline">
                      {a.title}
                    </Link>
                  </TableCell>
                  <TableCell data-label="Type">{ASSET_TYPE_LABEL[a.type]}</TableCell>
                  <TableCell data-label="Version">v{a.versions[0]?.versionNumber}</TableCell>
                  <TableCell data-label="Checks">{a.versions[0] ? <GatesBadge passed={a.versions[0].gatesPassed} /> : null}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title="Recent workflow runs">
        {runs.length === 0 ? (
          <EmptyState>No runs yet.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell data-label="Run">
                    <Link href={`/workflows/${r.id}`} className="font-mono text-xs underline-offset-4 hover:underline">
                      {r.id}
                    </Link>
                  </TableCell>
                  <TableCell data-label="Status">
                    <StateBadge state={r.status} />
                  </TableCell>
                  <TableCell data-label="Started">{fmtDate(r.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </>
  );
}
