import { KindBadge } from "@/components/app/badges";
import { Badge } from "@/components/ui/badge";
import { childPath, humanise, statementAnchor } from "@/lib/content-paths";
import { groupFindings } from "@/lib/findings";
import { cn } from "@/lib/utils";
import type { Finding } from "@/domain/quality-gates/gates";
import { orderedEntries } from "@/domain/schemas/display-order";
import type { KpiResult } from "@/domain/schemas/performance";
import { KpiResultsTable } from "@/components/kpi/results-table";

interface StatementLike {
  text: string;
  kind: string;
  claimIds?: string[];
  competitorEvidenceIds?: string[];
  kpiRefs?: string[];
  evidence?: { sourceId: string; excerpt: string }[];
  regulatory?: boolean;
  comparative?: boolean;
}

const isStatement = (v: unknown): v is StatementLike =>
  !!v && typeof v === "object" && typeof (v as StatementLike).text === "string" && typeof (v as StatementLike).kind === "string";

const HIDDEN_KEYS = new Set(["schemaVersion"]);

/**
 * Renders asset content as readable sections (not raw JSON). Statements carry
 * their kind label, claim/source/competitor-evidence references (linked to the
 * evidence panel) and, inline, the gate findings for their path.
 */
export function AssetContent({ content, findings, assetType }: { content: unknown; findings: Finding[]; assetType?: string }) {
  const byPath = new Map<string, Finding[]>();
  for (const f of findings) byPath.set(f.path, [...(byPath.get(f.path) ?? []), f]);
  return (
    <div className="flex flex-col gap-4">
      <Node value={content} path="$" depth={0} byPath={byPath} assetType={assetType} />
    </div>
  );
}

function Node({
  value,
  path,
  depth,
  byPath,
  label,
  assetType,
}: {
  value: unknown;
  path: string;
  depth: number;
  byPath: Map<string, Finding[]>;
  label?: string;
  /** Orders object keys as the asset's schema declares them (stored jsonb loses key order). */
  assetType?: string;
}) {
  if (value === null || value === undefined) return null;
  if (isStatement(value)) return <Statement s={value} path={path} label={label} findings={byPath.get(path) ?? []} />;
  if (path === "$.kpiSnapshot" && Array.isArray(value)) {
    return (
      <div className="flex flex-col gap-2">
        <Heading depth={depth}>KPI results (computed from imported data)</Heading>
        <KpiResultsTable rows={value as KpiResult[]} />
      </div>
    );
  }
  if (typeof value !== "object") {
    return label ? (
      <p className="text-sm">
        <span className="font-medium">{label}:</span> {String(value)}
      </p>
    ) : (
      <p className="text-sm">{String(value)}</p>
    );
  }
  if (Array.isArray(value)) {
    if (value.length === 0)
      return label ? (
        <div className="flex flex-col gap-1">
          <Heading depth={depth}>{label}</Heading>
          <p className="text-sm text-muted-foreground">None</p>
        </div>
      ) : null;
    const allStrings = value.every((v) => typeof v === "string");
    return (
      <div className="flex flex-col gap-2">
        {label ? <Heading depth={depth}>{label}</Heading> : null}
        {allStrings ? (
          <ul className="list-disc pl-5 text-sm">
            {(value as string[]).map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        ) : (
          <ol className="flex flex-col gap-3">
            {value.map((v, i) => (
              <li key={i}>
                <Node value={v} path={childPath(path, i)} depth={depth + 1} byPath={byPath} assetType={assetType} />
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }
  const entries = orderedEntries(value as Record<string, unknown>, assetType).filter(([k]) => !HIDDEN_KEYS.has(k));
  const body = (
    <div className={cn("flex flex-col gap-3", depth > 0 && "rounded-lg border p-3")}>
      {entries.map(([k, v]) => (
        <Node key={k} value={v} path={childPath(path, k)} depth={depth + 1} byPath={byPath} label={humanise(k)} assetType={assetType} />
      ))}
    </div>
  );
  return label ? (
    <div className="flex flex-col gap-2">
      <Heading depth={depth}>{label}</Heading>
      {body}
    </div>
  ) : (
    body
  );
}

function Heading({ depth, children }: { depth: number; children: React.ReactNode }) {
  const Tag = depth <= 1 ? "h3" : "h4";
  return <Tag className={cn("font-semibold", depth <= 1 ? "text-base" : "text-sm")}>{children}</Tag>;
}

function Statement({ s, path, label, findings }: { s: StatementLike; path: string; label?: string; findings: Finding[] }) {
  const critical = findings.some((f) => f.severity === "critical");
  const evidence = s.evidence ?? [];
  return (
    <article
      id={statementAnchor(path)}
      aria-label={label ? `${label} statement` : "Statement"}
      className={cn(
        "scroll-mt-28 rounded-md border-l-4 bg-muted/40 px-3 py-2 target:ring-2 target:ring-ring",
        critical ? "border-l-destructive" : "border-l-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {label ? <span className="text-xs font-medium text-muted-foreground">{label}</span> : null}
        <KindBadge kind={s.kind} />
        {s.regulatory ? <Badge variant="outline">regulatory</Badge> : null}
        {s.comparative ? <Badge variant="outline">comparative</Badge> : null}
      </div>
      <p className="mt-1 text-sm">{s.text}</p>
      {(s.claimIds?.length || evidence.length || s.competitorEvidenceIds?.length || s.kpiRefs?.length) ? (
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {s.claimIds?.map((c) => (
            <a key={c} href={`#ev-claim-${c}`} className="underline underline-offset-2">
              claim:{c}
            </a>
          ))}
          {[...new Map(evidence.map((e) => [e.sourceId, evidence.filter((x) => x.sourceId === e.sourceId).length])).entries()].map(([sourceId, n]) => (
            <a key={sourceId} href={`#ev-src-${sourceId}`} className="underline underline-offset-2">
              source:{sourceId}
              {n > 1 ? ` (${n} excerpts)` : ""}
            </a>
          ))}
          {s.competitorEvidenceIds?.map((c) => (
            <a key={c} href={`#ev-cev-${c}`} className="underline underline-offset-2">
              competitor-evidence:{c}
            </a>
          ))}
          {s.kpiRefs?.map((k) => (
            <span key={k}>kpi:{k}</span>
          ))}
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">No references.</p>
      )}
      {findings.length ? (
        <ul className="mt-2 flex flex-col gap-1 text-xs" aria-label="Findings for this statement">
          {groupFindings(findings).map((f, i) => (
            <li key={i} className={f.severity === "critical" ? "text-destructive" : "text-muted-foreground"}>
              <span className="font-medium uppercase">{f.severity}</span> · {f.message}
              {f.count > 1 ? ` (×${f.count})` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
