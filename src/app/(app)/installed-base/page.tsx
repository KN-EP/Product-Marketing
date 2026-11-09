import Link from "next/link";
import { SyntheticTag } from "@/components/app/badges";
import { EmptyState, PageHeader, Section } from "@/components/app/page-header";
import { UnitsImport } from "@/components/installed-base/units-import";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasRole } from "@/domain/actor";
import { assessUnit, isOverdue, OFFER_LABEL, TRIGGER_LABEL } from "@/domain/installed-base/installed-base";
import { fmtDay } from "@/lib/format";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * M18 installed base: the machines already at customers, ranked by the triggers
 * computed in code. The target list is where service, retrofit and replacement
 * campaigns start — with a hand-over to sales that has a deadline.
 */
export default async function InstalledBasePage({ searchParams }: { searchParams?: Promise<{ product?: string | string[]; region?: string | string[] }> }) {
  const actor = await requirePageActor();
  const sp = (await searchParams) ?? {};
  const v = tenantDb(actor, getDb()).views;
  const [units, products, handovers, imports] = await Promise.all([v.installedUnits(), v.products(), v.handovers(), v.installedBaseImports()]);
  const today = new Date();
  const canEdit = hasRole(actor, "editor");

  const product = one(sp.product);
  const region = one(sp.region);
  const regions = [...new Set(units.map((u) => u.region))].sort();
  const ranked = units
    .filter((u) => (!product || u.product.id === product) && (!region || u.region === region))
    .map((u) => ({ u, a: assessUnit(u, today), open: u.handovers.filter((h) => !["won", "lost", "no_decision"].includes(h.status)).length }))
    .sort((x, y) => y.a.score - x.a.score || y.a.ageYears - x.a.ageYears || x.u.unitRef.localeCompare(y.u.unitRef));

  const old = ranked.filter((r) => r.a.ageYears >= 10).length;
  const noContract = ranked.filter((r) => !r.u.serviceContract).length;
  const openHandovers = handovers.filter((h) => !["won", "lost", "no_decision"].includes(h.status)).length;
  const overdue = handovers.filter((h) => isOverdue(h, today)).length;

  return (
    <>
      <PageHeader
        title="Installed base"
        description="Machines already at customers, ranked by triggers computed in code (age, no service contract, spare-part orders, planned material change, regulated application, no recent service). Findings from field service go to sales with a deadline."
        actions={
          <>
            <Link href="/installed-base/handovers" className="text-sm underline-offset-4 hover:underline">
              Service → sales hand-overs
            </Link>
            <Link href="/installed-base/calculator" className="text-sm underline-offset-4 hover:underline">
              Cost-per-part calculator
            </Link>
          </>
        }
      />
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Installed base summary">
        {[
          ["Units", ranked.length],
          ["Older than 10 years", old],
          ["Without service contract", noContract],
          ["Open hand-overs (overdue)", `${openHandovers} (${overdue})`],
        ].map(([l, n]) => (
          <div key={String(l)} className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">{l}</dt>
            <dd className="text-xl font-semibold tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>
      <Section title="Target list" description="Highest score first. The suggested offer follows a fixed rule (see the unit page); people decide what to offer.">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="flex flex-col gap-1 text-sm">
            Product
            <select name="product" defaultValue={product} className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="">All</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Region
            <select name="region" defaultValue={region} className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="">All</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="h-9 rounded-md border px-3 text-sm hover:bg-muted">
            Filter
          </button>
        </form>
        {ranked.length === 0 ? (
          <EmptyState>{units.length ? "No unit matches the filter." : "No installed base yet. Import the export from your ERP or service system below."}</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unit</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Triggers</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Suggested offer</TableHead>
                <TableHead>Open hand-overs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranked.map(({ u, a, open }) => (
                <TableRow key={u.id}>
                  <TableCell data-label="Unit" className="whitespace-normal">
                    <Link href={`/installed-base/${u.id}`} className="font-medium underline-offset-4 hover:underline">
                      {u.unitRef}
                    </Link>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {u.product.name} · {u.region} {u.isSynthetic ? <SyntheticTag /> : null}
                    </span>
                  </TableCell>
                  <TableCell data-label="Account" className="whitespace-normal">
                    {u.accountLabel}
                    <span className="block text-xs text-muted-foreground">{u.application}</span>
                  </TableCell>
                  <TableCell data-label="Age">
                    {a.ageYears} y<span className="block text-xs text-muted-foreground">{fmtDay(u.installedOn)}</span>
                  </TableCell>
                  <TableCell data-label="Triggers" className="whitespace-normal">
                    <span className="flex flex-wrap gap-1">
                      {a.triggers.map((t) => (
                        <Badge key={t} variant="outline" className="font-normal">
                          {TRIGGER_LABEL[t]}
                        </Badge>
                      ))}
                    </span>
                  </TableCell>
                  <TableCell data-label="Score" className="text-right tabular-nums">
                    {a.score}
                  </TableCell>
                  <TableCell data-label="Suggested offer">{OFFER_LABEL[a.suggestedOffer]}</TableCell>
                  <TableCell data-label="Open hand-overs">{open || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
      <Section title="Import the installed base" description="CSV export from ERP or service system. Accounts are pseudonymised; rows with e-mail addresses or phone numbers are rejected.">
        {!canEdit ? (
          <EmptyState>Only editors can import.</EmptyState>
        ) : products.length ? (
          <UnitsImport productNames={products.map((p) => p.name)} />
        ) : (
          <EmptyState>Create the product (series) first.</EmptyState>
        )}
        {imports.length ? (
          <ul className="text-xs text-muted-foreground">
            {imports.map((i) => (
              <li key={i.id}>
                {fmtDay(i.createdAt)} · {i.fileName}: {i.acceptedRows} of {i.rowCount} row(s) accepted
              </li>
            ))}
          </ul>
        ) : null}
      </Section>
    </>
  );
}
