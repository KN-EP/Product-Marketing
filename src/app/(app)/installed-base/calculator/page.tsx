import Link from "next/link";
import { EmptyState, PageHeader, Section } from "@/components/app/page-header";
import { CostForm } from "@/components/installed-base/cost-form";
import { hasRole } from "@/domain/actor";
import type { CostResult } from "@/domain/installed-base/cost";
import { fmtDay } from "@/lib/format";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";

export const dynamic = "force-dynamic";

/**
 * M18 cost-per-part calculator: as is vs. retrofit (vs. new machine). The result
 * is computed in code; every input carries its basis, and the result says when it
 * rests on assumptions. A model may quote it — never compute it.
 */
export default async function CalculatorPage({ searchParams }: { searchParams?: Promise<{ unit?: string | string[] }> }) {
  const actor = await requirePageActor();
  const sp = (await searchParams) ?? {};
  const v = tenantDb(actor, getDb()).views;
  const [products, units, comparisons] = await Promise.all([v.products(), v.installedUnits(), v.costComparisons()]);
  const unit = Array.isArray(sp.unit) ? sp.unit[0] : sp.unit;

  return (
    <>
      <PageHeader
        title="Cost-per-part calculator"
        description="Cost per good part over the lifecycle: depreciation, maintenance, energy, labour and material, divided by good parts (output × hours × OEE × (1 − scrap)). Payback = investment ÷ annual operating savings. Inputs carry their basis; benchmark or illustrative inputs are listed with the result."
        actions={
          <Link href="/installed-base" className="text-sm underline-offset-4 hover:underline">
            Installed base
          </Link>
        }
      />
      <Section title="New comparison">
        {!hasRole(actor, "editor") ? (
          <EmptyState>Only editors can calculate.</EmptyState>
        ) : products.length ? (
          <CostForm
            products={products.map((p) => ({ id: p.id, label: p.name }))}
            units={units.map((u) => ({ id: u.id, label: `${u.unitRef} · ${u.accountLabel}`, productId: u.product.id }))}
            {...(unit ? { preselectUnit: unit } : {})}
          />
        ) : (
          <EmptyState>Create a product first.</EmptyState>
        )}
      </Section>
      <Section title="Saved comparisons">
        {comparisons.length === 0 ? (
          <EmptyState>None yet.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {comparisons.map((c) => {
              const r = c.result as unknown as CostResult;
              return (
                <li key={c.id}>
                  <Link href={`/installed-base/calculator/${c.id}`} className="underline-offset-4 hover:underline">
                    {c.title}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    · {c.product.name}
                    {c.unit ? ` · ${c.unit.unitRef}` : ""} · {fmtDay(c.createdAt)} · {r.status === "measured" ? "measured inputs" : "contains assumptions"}
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
