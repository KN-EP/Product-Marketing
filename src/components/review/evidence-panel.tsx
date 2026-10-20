import Link from "next/link";
import { StateBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/page-header";
import { excerptExistsInSource, type KnowledgeSnapshot } from "@/domain/knowledge/snapshot";
import { collectStatements } from "@/domain/schemas/agents";
import { groupBy } from "@/lib/findings";

function Verified({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="text-xs text-muted-foreground">✓ found verbatim in the stored source</span>
  ) : (
    <span className="text-xs font-medium text-destructive">✗ not found in the stored source</span>
  );
}

/**
 * Every reference made by the version's statements, with the STORED excerpt:
 * claim evidence (ClaimEvidence), excerpts cited directly in the output, and
 * competitor evidence. Unknown ids are shown as such (gate G2 flags them).
 */
export function EvidencePanel({ content, kb }: { content: unknown; kb: KnowledgeSnapshot }) {
  const statements = collectStatements(content).map((x) => x.s);
  const claimIds = [...new Set(statements.flatMap((s) => s.claimIds))];
  const cevIds = [...new Set(statements.flatMap((s) => s.competitorEvidenceIds))];
  const cited = new Map<string, Set<string>>();
  for (const s of statements) for (const e of s.evidence) cited.set(e.sourceId, (cited.get(e.sourceId) ?? new Set()).add(e.excerpt));

  if (!claimIds.length && !cevIds.length && !cited.size) return <EmptyState>This version references no evidence.</EmptyState>;

  return (
    <div className="flex flex-col gap-5 text-sm">
      {claimIds.length ? (
        <div>
          <h4 className="font-medium">Claims</h4>
          <ul className="mt-2 flex flex-col gap-3">
            {claimIds.map((id) => {
              const c = kb.claims.get(id);
              return (
                <li key={id} id={`ev-claim-${id}`} className="scroll-mt-28 rounded-md border p-3 target:ring-2 target:ring-ring">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{id}</span>
                    {c ? <StateBadge state={c.state} /> : <span className="text-xs font-medium text-destructive">unknown in this tenant</span>}
                  </div>
                  {c ? (
                    <>
                      <p className="mt-1">{c.text}</p>
                      {c.evidence.length === 0 ? (
                        <p className="mt-1 text-xs text-destructive">Claim has no evidence.</p>
                      ) : (
                        // Multiple excerpts from one source are grouped under that source.
                        groupBy(c.evidence, (e) => e.sourceId).map(([sourceId, items]) => {
                          const src = kb.sources.get(sourceId);
                          return (
                            <div key={sourceId} className="mt-2">
                              <p className="text-xs text-muted-foreground">
                                <Link href={`/knowledge/sources#src-${sourceId}`} className="underline underline-offset-2">
                                  {src?.title ?? sourceId}
                                </Link>
                                {items.length > 1 ? ` · ${items.length} excerpts` : ""}
                              </p>
                              {items.map((e, i) => (
                                <div key={i} className="mt-1">
                                  <blockquote className="border-l-2 pl-3 italic">&ldquo;{e.excerpt}&rdquo;</blockquote>
                                  <p className="pl-3">
                                    <Verified ok={!!src && excerptExistsInSource(e.excerpt, src)} />
                                  </p>
                                </div>
                              ))}
                            </div>
                          );
                        })
                      )}
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {cited.size ? (
        <div>
          <h4 className="font-medium">Excerpts cited in the output</h4>
          <ul className="mt-2 flex flex-col gap-3">
            {[...cited.entries()].map(([sourceId, excerpts]) => {
              const src = kb.sources.get(sourceId);
              return (
                <li key={sourceId} id={`ev-src-${sourceId}`} className="scroll-mt-28 rounded-md border p-3 target:ring-2 target:ring-ring">
                  <p className="text-xs">
                    {src ? (
                      <Link href={`/knowledge/sources#src-${sourceId}`} className="font-medium underline underline-offset-2">
                        {src.title}
                      </Link>
                    ) : (
                      <span className="font-medium text-destructive">Unknown source {sourceId}</span>
                    )}{" "}
                    {src ? <StateBadge state={src.status} /> : null}
                  </p>
                  {[...excerpts].map((ex, i) => (
                    <div key={i} className="mt-2">
                      <blockquote className="border-l-2 pl-3 italic">&ldquo;{ex}&rdquo;</blockquote>
                      <p className="pl-3">
                        <Verified ok={!!src && excerptExistsInSource(ex, src)} />
                      </p>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {cevIds.length ? (
        <div>
          <h4 className="font-medium">Competitor evidence</h4>
          <ul className="mt-2 flex flex-col gap-3">
            {cevIds.map((id) => {
              const e = kb.competitorEvidence.get(id);
              const src = e ? kb.sources.get(e.sourceId) : undefined;
              return (
                <li key={id} id={`ev-cev-${id}`} className="scroll-mt-28 rounded-md border p-3 target:ring-2 target:ring-ring">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{id}</span>
                    {e ? <StateBadge state={e.state} /> : <span className="text-xs font-medium text-destructive">unknown in this tenant</span>}
                  </div>
                  {e ? (
                    <>
                      <p className="mt-1">{e.assertion}</p>
                      <blockquote className="mt-2 border-l-2 pl-3 italic">&ldquo;{e.excerpt}&rdquo;</blockquote>
                      <p className="pl-3 text-xs text-muted-foreground">
                        {src?.title ?? e.sourceId} · <Verified ok={!!src && excerptExistsInSource(e.excerpt, src)} />
                      </p>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
