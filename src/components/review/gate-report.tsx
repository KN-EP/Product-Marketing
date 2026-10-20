import { Badge } from "@/components/ui/badge";
import { statementAnchor } from "@/lib/content-paths";
import { groupFindings } from "@/lib/findings";
import { fmtDate } from "@/lib/format";
import type { GateReport, Severity } from "@/domain/quality-gates/gates";

const ORDER: Severity[] = ["critical", "warning", "info"];
const TITLE: Record<Severity, string> = {
  critical: "Critical — block approval",
  warning: "Warnings",
  info: "Information",
};

const gateLabel = (gate: string) => gate.split("_")[0];

/** Gate findings grouped by severity; each finding links to its statement. */
export function GateReportView({ report, statementPaths }: { report: GateReport; statementPaths: Set<string> }) {
  const counts = Object.fromEntries(ORDER.map((s) => [s, report.findings.filter((f) => f.severity === s).length]));
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={report.passed ? "secondary" : "destructive"}>{report.passed ? "Passed" : "Failed"}</Badge>
        {report.requiresExpertReview ? <Badge variant="outline">Expert review required</Badge> : null}
        <span className="text-xs text-muted-foreground">
          {counts.critical} critical · {counts.warning} warning · {counts.info} info · {report.gateVersion} · evaluated {fmtDate(report.evaluatedAt)}
        </span>
      </div>
      {ORDER.map((sev) => {
        // Display grouping only; the stored report is unchanged.
        const items = groupFindings(report.findings.filter((f) => f.severity === sev));
        const total = items.reduce((n, g) => n + g.count, 0);
        if (items.length === 0) return null;
        return (
          <div key={sev}>
            <h4 className={sev === "critical" ? "font-medium text-destructive" : "font-medium"}>
              {TITLE[sev]} ({total})
            </h4>
            <ul className="mt-1 flex flex-col gap-1">
              {items.map((f, i) => (
                <li key={i} className="flex flex-wrap gap-x-2">
                  <span className="font-mono text-xs">{gateLabel(f.gate)}</span>
                  <span>{f.message}</span>
                  {f.count > 1 ? <span className="text-xs font-medium">×{f.count}</span> : null}
                  {statementPaths.has(f.path) ? (
                    <a href={`#${statementAnchor(f.path)}`} className="text-xs underline underline-offset-2">
                      Go to statement
                    </a>
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">{f.path}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">Automated checks are supporting controls, not fact verification.</p>
    </div>
  );
}
