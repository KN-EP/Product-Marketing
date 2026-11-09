import Link from "next/link";
import { PageHeader, Section } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BASIS_LABEL, COST_FIELDS, SCENARIO_LABEL, type CostResult, type Scenario } from "@/domain/installed-base/cost";
import { fmtDate } from "@/lib/format";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";
import { or404 } from "@/server/http/page";

export const dynamic = "force-dynamic";

const eur = (n: number, d = 0) => `${n.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d })} €`;

/** M18: one saved cost comparison — result computed in code, with every input and its basis. */
export default async function CostComparisonPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor();
  const { id } = await params;
  const c = await or404(tenantDb(actor, getDb()).views.costComparison(id));
  const r = c.result as unknown as CostResult;
  const inputs = c.inputs as unknown as Scenario[];

  return (
    <>
      <PageHeader
        title={c.title}
        description={`${c.product.name}${c.unit ? ` · ${c.unit.unitRef} · ${c.unit.accountLabel}` : ""} · calculated ${fmtDate(c.createdAt)} by ${c.createdBy.name}`}
        actions={
          <Link href="/installed-base/calculator" className="text-sm underline-offset-4 hover:underline">
            Calculator
          </Link>
        }
      />
      <p className="text-sm">
        {r.status === "measured" ? (
          <Badge>measured inputs</Badge>
        ) : (
          <>
            <Badge variant="outline">contains assumptions</Badge>{" "}
            <span className="text-muted-foreground">
              {r.assumptions.length} input(s) are benchmarks to verify or illustrative — quote the result only together with these assumptions.
            </span>
          </>
        )}
      </p>
      <Section title="Result (computed)">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Scenario</TableHead>
              <TableHead className="text-right">Cost per good part</TableHead>
              <TableHead className="text-right">Operating cost per good part</TableHead>
              <TableHead className="text-right">Good parts per year</TableHead>
              <TableHead className="text-right">vs. as is</TableHead>
              <TableHead className="text-right">Operating savings per year</TableHead>
              <TableHead className="text-right">Payback</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.scenarios.map((s) => (
              <TableRow key={s.kind}>
                <TableCell data-label="Scenario" className="font-medium">
                  {SCENARIO_LABEL[s.kind]}
                </TableCell>
                <TableCell data-label="Cost per good part" className="text-right tabular-nums">
                  {eur(s.costPerGoodPartEur, 4)}
                </TableCell>
                <TableCell data-label="Operating cost per good part" className="text-right tabular-nums">
                  {eur(s.operatingCostPerGoodPartEur, 4)}
                </TableCell>
                <TableCell data-label="Good parts per year" className="text-right tabular-nums">
                  {s.goodPartsPerYear.toLocaleString("en-GB")}
                </TableCell>
                <TableCell data-label="vs. as is" className="text-right tabular-nums">
                  {s.deltaCostPerPartPercent === null ? "—" : `${s.deltaCostPerPartPercent > 0 ? "+" : ""}${s.deltaCostPerPartPercent} %`}
                </TableCell>
                <TableCell data-label="Operating savings per year" className="text-right tabular-nums">
                  {s.annualOperatingSavingsEur === null ? "—" : eur(s.annualOperatingSavingsEur)}
                </TableCell>
                <TableCell data-label="Payback" className="text-right tabular-nums">
                  {s.paybackYears === null ? "—" : `${s.paybackYears} years`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
      <Section title="Inputs and their basis">
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th scope="col" className="p-2 font-medium">
                  Input
                </th>
                {inputs.map((s) => (
                  <th key={s.kind} scope="col" className="p-2 font-medium">
                    {SCENARIO_LABEL[s.kind]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Object.keys(COST_FIELDS) as (keyof typeof COST_FIELDS)[]).map((f) => (
                <tr key={f} className="border-b last:border-0">
                  <th scope="row" className="p-2 text-left font-normal">
                    {COST_FIELDS[f].label}
                  </th>
                  {inputs.map((s) => (
                    <td key={s.kind} className="p-2 tabular-nums">
                      {s.values[f].value.toLocaleString("en-GB")}{" "}
                      <span className={s.values[f].basis === "measured" || s.values[f].basis === "customer_input" ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
                        ({BASIS_LABEL[s.values[f].basis]})
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
