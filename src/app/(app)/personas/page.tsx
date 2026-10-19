import { SyntheticTag } from "@/components/app/badges";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";

export const dynamic = "force-dynamic";

export default async function PersonasPage() {
  const actor = await requirePageActor();
  const personas = await tenantDb(actor, getDb()).views.personas();
  return (
    <>
      <PageHeader title="Personas" description="Buyer personas and the problems they report." />
      {personas.length === 0 ? (
        <EmptyState>No personas.</EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {personas.map((p) => (
            <li key={p.id} className="rounded-lg border p-4 text-sm">
              <h2 className="font-medium">
                {p.name} {p.isSynthetic ? <SyntheticTag /> : null}
              </h2>
              <p className="text-muted-foreground">
                {p.role} · {p.market}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <h3 className="font-medium">Goals</h3>
                  <ul className="list-disc pl-5">{p.goals.map((g) => <li key={g}>{g}</li>)}</ul>
                </div>
                <div>
                  <h3 className="font-medium">Concerns</h3>
                  <ul className="list-disc pl-5">{p.concerns.map((c) => <li key={c}>{c}</li>)}</ul>
                </div>
              </div>
              {p.buyerProblems.length ? (
                <>
                  <h3 className="mt-3 font-medium">Buyer problems</h3>
                  <ul className="list-disc pl-5">
                    {p.buyerProblems.map((b) => (
                      <li key={b.id}>
                        {b.statement} <span className="text-muted-foreground">(severity {b.severity})</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
