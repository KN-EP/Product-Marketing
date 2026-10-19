import Link from "next/link";
import { GatesBadge, ModeBadge, StateBadge } from "@/components/app/badges";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ASSET_TYPE_LABEL, fmtDate } from "@/lib/format";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const actor = await requirePageActor();
  const assets = await tenantDb(actor, getDb()).views.assets();
  return (
    <>
      <PageHeader title="Assets" description="Generated and edited marketing assets. Every version is immutable; approval is always a human decision." />
      {assets.length === 0 ? (
        <EmptyState>
          No assets yet. <Link href="/workflows" className="underline underline-offset-2">Start a workflow</Link> to generate them.
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Latest version</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assets.map((a) => {
              const v = a.versions[0];
              return (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-normal">
                    <Link href={`/assets/${a.id}`} className="font-medium underline-offset-4 hover:underline">
                      {a.title}
                    </Link>
                  </TableCell>
                  <TableCell>{ASSET_TYPE_LABEL[a.type]}</TableCell>
                  <TableCell>
                    <StateBadge state={a.state} />
                  </TableCell>
                  <TableCell>
                    {v ? (
                      <span className="flex flex-wrap items-center gap-1.5">
                        v{v.versionNumber} <ModeBadge mode={v.generationMode} /> <GatesBadge passed={v.gatesPassed} />
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{fmtDate(a.updatedAt)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </>
  );
}
