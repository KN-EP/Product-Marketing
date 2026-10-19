import { DomainError, type Actor } from "../actor";
import { generationLabel, latestApprovedVersion, type AssetRecord } from "../assets/asset-state";
import type { KnowledgeSnapshot } from "../knowledge/snapshot";
import { collectStatements } from "../schemas/agents";

const LABEL: Record<string, string> = {
  fact: "FACT",
  interpretation: "INTERPRETATION",
  hypothesis: "HYPOTHESIS",
  suggestion: "SUGGESTION",
};

function humanise(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

/**
 * Export the latest APPROVED version of an asset. Drafts cannot be exported as
 * approved. The output carries version, approval and source references.
 */
export function exportApprovedMarkdown(asset: AssetRecord, actor: Actor, kb: KnowledgeSnapshot, reviewerName: (id: string) => string): string {
  if (asset.tenantId !== actor.tenantId) throw new DomainError("tenant_mismatch", "Asset not found");
  const approved = latestApprovedVersion(asset);
  if (!approved) throw new DomainError("not_approved", "Asset has no approved version");
  const { version, approval } = approved;

  const lines: string[] = [];
  lines.push(`# ${asset.title}`, "");
  lines.push(`| | |`, `|---|---|`);
  lines.push(`| Asset type | ${asset.type} |`);
  lines.push(`| Version | v${version.versionNumber} (${version.id}) |`);
  lines.push(`| Schema | ${version.schemaVersion} |`);
  lines.push(`| Approved by | ${reviewerName(approval.reviewerId)} |`);
  lines.push(`| Approved at | ${approval.createdAt.toISOString()} |`);
  const generation =
    version.generationMode === "simulated"
      ? "SIMULATED (deterministic demo output, not generated live)"
      : version.generationMode === "human_edit"
        ? `${generationLabel(asset, version)}, human-reviewed`
        : "Live model output, human-reviewed";
  lines.push(`| Generation | ${generation} |`);
  lines.push("");
  if (version.generationMode === "simulated" || [...kb.sources.values()].some((s) => s.isSynthetic)) {
    lines.push("> **Demonstration content.** Contains synthetic example data. Not an official statement of any named company.", "");
  }

  const sourceIds = new Set<string>();
  const render = (value: unknown, depth: number): void => {
    if (value === null || value === undefined) return;
    if (typeof value === "string") {
      lines.push(`- ${value}`);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v) => render(v, depth));
      return;
    }
    if (typeof value === "object") {
      const o = value as Record<string, unknown>;
      if (typeof o.text === "string" && typeof o.kind === "string") {
        const refs = [
          ...((o.claimIds as string[]) ?? []).map((c) => `claim:${c}`),
          ...((o.evidence as { sourceId: string }[]) ?? []).map((e) => {
            sourceIds.add(e.sourceId);
            return `source:${e.sourceId}`;
          }),
          ...((o.competitorEvidenceIds as string[]) ?? []).map((c) => `competitor-evidence:${c}`),
        ];
        lines.push(`- **[${LABEL[o.kind] ?? o.kind}]** ${o.text}${refs.length ? ` _(${refs.join(", ")})_` : ""}`);
        return;
      }
      for (const [k, v] of Object.entries(o)) {
        if (k === "schemaVersion") continue;
        if (typeof v === "string") {
          lines.push(`**${humanise(k)}:** ${v}`, "");
        } else {
          lines.push(`${"#".repeat(Math.min(depth + 2, 6))} ${humanise(k)}`, "");
          render(v, depth + 1);
          lines.push("");
        }
      }
    }
  };
  render(version.content, 0);

  // Claims referenced → their sources as well.
  for (const { s } of collectStatements(version.content)) {
    for (const cid of s.claimIds) kb.claims.get(cid)?.evidence.forEach((e) => sourceIds.add(e.sourceId));
  }

  lines.push("## Sources", "");
  for (const id of [...sourceIds].sort()) {
    const s = kb.sources.get(id);
    if (!s) continue;
    lines.push(`- \`${s.id}\` — ${s.title}${s.url ? ` — ${s.url}` : ""}${s.isSynthetic ? " _(synthetic demo source)_" : ""}`);
  }
  lines.push("", "---", "_Automated checks are supporting controls, not fact verification. Approval reflects human review of this exact version._");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}
