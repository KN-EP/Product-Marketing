import Link from "next/link";
import { StateBadge, SyntheticTag } from "@/components/app/badges";
import { EmptyState, PageHeader, Section } from "@/components/app/page-header";
import { InputBrief } from "@/components/review/input-brief";
import type { GateReport } from "@/domain/quality-gates/gates";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";
import { or404 } from "@/server/http/page";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageActor();
  const v = tenantDb(actor, getDb()).views;
  const p = await or404(v.product(id));
  const brief = await v.inputBriefForProduct(p.id);
  const unassigned = p.claims.filter((c) => !p.features.some((f) => f.claims.some((fc) => fc.id === c.id)));

  return (
    <>
      <PageHeader
        title={
          <span className="line-clamp-2" title={p.name}>
            {p.name} {p.isSynthetic ? <SyntheticTag /> : null}
          </span>
        }
        description={`${p.area} · ${p.description}`}
      />
      <Section title="Features and claims" description="Only approved claims may support statements of kind FACT.">
        {p.features.length === 0 && p.claims.length === 0 ? (
          <EmptyState>No features or claims recorded.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {p.features.map((f) => (
              <li key={f.id} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {f.name} {f.isSynthetic ? <SyntheticTag /> : null}
                </p>
                <p className="text-muted-foreground">{f.description}</p>
                {f.claims.length ? (
                  <ul className="mt-2 flex flex-col gap-1">
                    {f.claims.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center gap-2">
                        <StateBadge state={c.state} />
                        <Link href={`/knowledge/claims#clm-${c.id}`} className="underline-offset-4 hover:underline">
                          {c.text}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">No claims for this feature.</p>
                )}
              </li>
            ))}
            {unassigned.length ? (
              <li className="rounded-lg border p-3 text-sm">
                <p className="font-medium">Claims without a feature</p>
                <ul className="mt-2 flex flex-col gap-1">
                  {unassigned.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2">
                      <StateBadge state={c.state} />
                      <Link href={`/knowledge/claims#clm-${c.id}`} className="underline-offset-4 hover:underline">
                        {c.text}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ) : null}
          </ul>
        )}
      </Section>
      <Section title="Input brief" description="Latest Agent A product intelligence brief for this product (internal).">
        {brief ? (
          <InputBrief
            content={brief.content}
            gateReport={brief.gateReport as unknown as GateReport}
            generationMode={brief.generationMode}
            createdAt={brief.createdAt}
            runId={brief.workflowRunId}
          />
        ) : (
          <EmptyState>No input brief yet — it is created by the first workflow run for this product.</EmptyState>
        )}
      </Section>
    </>
  );
}
