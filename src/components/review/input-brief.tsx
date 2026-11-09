import Link from "next/link";
import { ModeBadge } from "@/components/app/badges";
import { Badge } from "@/components/ui/badge";
import type { GateReport } from "@/domain/quality-gates/gates";
import { INPUT_BRIEF_LABEL } from "@/server/assets/deliverables";
import { fmtDate } from "@/lib/format";
import { AssetContent } from "./asset-content";

/**
 * Agent A's product intelligence brief: an INTERNAL input for agents B and C.
 * Shown for transparency (incl. missing evidence and expert questions); it is
 * not a deliverable, is never reviewed and cannot be exported.
 */
export function InputBrief({
  content,
  gateReport,
  generationMode,
  createdAt,
  runId,
}: {
  content: unknown;
  gateReport: GateReport;
  generationMode: string;
  createdAt: Date;
  runId?: string | null;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4" aria-label={INPUT_BRIEF_LABEL}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">internal</Badge>
        <span className="font-medium">{INPUT_BRIEF_LABEL}</span>
        <ModeBadge mode={generationMode} />
        <span className="text-xs text-muted-foreground">
          {fmtDate(createdAt)}
          {runId ? (
            <>
              {" · "}
              <Link href={`/workflows/${runId}`} className="underline underline-offset-2">
                run
              </Link>
            </>
          ) : null}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Input for the messaging framework, battlecard and regulatory brief. Not reviewed, not approved and not exportable — do not use
        externally. Missing evidence and expert questions below are open work items.
      </p>
      <AssetContent content={content} findings={gateReport.findings} assetType="product_intelligence_brief" />
    </div>
  );
}
