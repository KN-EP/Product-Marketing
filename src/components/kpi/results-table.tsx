import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { KpiResult } from "@/domain/schemas/performance";
import { fmtKpi } from "@/lib/kpis";

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  on_track: { label: "on track", variant: "secondary" },
  at_risk: { label: "at risk", variant: "outline" },
  off_track: { label: "off track", variant: "destructive" },
  no_target: { label: "no target", variant: "outline" },
  no_data: { label: "no data", variant: "outline" },
};

export function KpiStatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status.replace(/_/g, " "), variant: "outline" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

/** Deterministic target/actual table (src/domain/kpis/analysis.ts). Status is always shown as text. */
export function KpiResultsTable({ rows }: { rows: KpiResult[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>KPI</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead className="text-right">Actual</TableHead>
          <TableHead className="text-right">Target</TableHead>
          <TableHead className="text-right">Expected to date</TableHead>
          <TableHead className="text-right">Pace</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.name}>
            <TableCell data-label="KPI" className="whitespace-normal font-medium">
              {r.name}
              <span className="block text-xs font-normal text-muted-foreground">
                {r.aggregation} · {r.direction === "higher_is_better" ? "higher is better" : "lower is better"} · {r.measurements} value(s)
              </span>
            </TableCell>
            <TableCell data-label="Stage">{r.funnelStage}</TableCell>
            <TableCell data-label="Actual" className="text-right tabular-nums">
              {fmtKpi(r.actual, r.unit)}
            </TableCell>
            <TableCell data-label="Target" className="text-right tabular-nums">
              {fmtKpi(r.target, r.unit)}
            </TableCell>
            <TableCell data-label="Expected to date" className="text-right tabular-nums">
              {fmtKpi(r.expectedToDate, r.unit)}
            </TableCell>
            <TableCell data-label="Pace" className="text-right tabular-nums">
              {r.pacePct === null ? "—" : `${r.pacePct} %`}
            </TableCell>
            <TableCell data-label="Status">
              <KpiStatusBadge status={r.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
