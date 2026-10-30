import Link from "next/link";
import { SyntheticTag } from "@/components/app/badges";
import { EmptyState, PageHeader, Section } from "@/components/app/page-header";
import { CreateReleaseForm } from "@/components/release/create-form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasRole } from "@/domain/actor";
import { RELEASE_AUDIENCE_LABEL, RELEASE_TYPE_LABEL } from "@/domain/releases/release";
import { deliverableSummary } from "@/lib/campaigns";
import { fmtDay } from "@/lib/format";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";

export const dynamic = "force-dynamic";

/** M12 station "Release & update": the release plan and the release briefing form. */
export default async function ReleasesPage() {
  const actor = await requirePageActor();
  const v = tenantDb(actor, getDb()).views;
  const [releases, products] = await Promise.all([v.releases(), v.products()]);
  const canCreate = hasRole(actor, "editor");

  return (
    <>
      <PageHeader
        title="Releases"
        description="Release and update planning: what changes, when and for whom. The release agent drafts the communication plan per audience — internal enablement first, then customers, prospects and partners. Nothing is sent or published from here."
      />
      <Section title="Release plan" description="Planned releases and updates, next first.">
        {releases.length === 0 ? (
          <EmptyState>No releases planned yet.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Planned</TableHead>
                <TableHead>Release</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Audiences</TableHead>
                <TableHead>Communication plan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {releases.map((r) => (
                <TableRow key={r.id}>
                  <TableCell data-label="Planned">{r.plannedOn ? fmtDay(r.plannedOn) : "Not set"}</TableCell>
                  <TableCell data-label="Release" className="whitespace-normal">
                    <Link href={`/releases/${r.id}`} className="line-clamp-2 font-medium underline-offset-4 hover:underline">
                      {r.name} · {r.version}
                    </Link>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {r.product.name} {r.isSynthetic ? <SyntheticTag /> : null}
                    </span>
                  </TableCell>
                  <TableCell data-label="Type">{RELEASE_TYPE_LABEL[r.type]}</TableCell>
                  <TableCell data-label="Audiences" className="whitespace-normal">
                    {r.audiences.map((a) => (RELEASE_AUDIENCE_LABEL as Record<string, string>)[a] ?? a).join(", ")}
                  </TableCell>
                  <TableCell data-label="Communication plan" className="whitespace-normal">
                    {deliverableSummary(r.assets.map((a) => a.state))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
      <Section title="Plan a release" description="The briefing is human input. Planned changes are not product facts until a claim is approved.">
        {!canCreate ? (
          <EmptyState>Only editors can plan releases.</EmptyState>
        ) : products.length ? (
          <CreateReleaseForm products={products.map((p) => ({ id: p.id, label: p.name }))} />
        ) : (
          <EmptyState>A release needs a product.</EmptyState>
        )}
      </Section>
    </>
  );
}
