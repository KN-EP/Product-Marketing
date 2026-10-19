import Link from "next/link";
import { ModeBadge, StateBadge } from "@/components/app/badges";
import { EmptyState, PageHeader, Section } from "@/components/app/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StartWorkflowForm } from "@/components/workflow/start-form";
import { hasRole } from "@/domain/actor";
import { WORKFLOW_LIMITS } from "@/domain/workflow/workflow-state";
import { fmtDate, fmtUsd } from "@/lib/format";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const actor = await requirePageActor();
  const v = tenantDb(actor, getDb()).views;
  const [runs, products, personas, triggers, competitors] = await Promise.all([
    v.runs(),
    v.products(),
    v.personas(),
    v.regulatoryTriggers(),
    v.competitors(),
  ]);
  const canStart = hasRole(actor, "editor");

  return (
    <>
      <PageHeader
        title="Workflows"
        description={`Three-asset run: Agent A (product intelligence) → B (messaging framework) → C (battlecard + regulatory brief). Limits: ${WORKFLOW_LIMITS.maxConcurrentRunsPerTenant} active runs per tenant, ${WORKFLOW_LIMITS.maxAttempts} attempts, cost cap per run.`}
      />
      <Section title="Start a run" description="A completed run means the outputs are waiting for human review — never that they are approved.">
        {!canStart ? (
          <EmptyState>Only editors can start runs.</EmptyState>
        ) : products.length && personas.length && triggers.length && competitors.length >= 3 ? (
          <StartWorkflowForm
            products={products.map((p) => ({ id: p.id, label: p.name }))}
            personas={personas.map((p) => ({ id: p.id, label: `${p.name} (${p.role})` }))}
            triggers={triggers.map((t) => ({ id: t.id, label: `${t.name} (${t.jurisdiction})` }))}
            competitors={competitors.map((c) => ({ id: c.id, label: c.name }))}
            defaultMarket={personas[0]?.market ?? "Germany"}
          />
        ) : (
          <EmptyState>A run needs at least one product, persona and regulatory trigger, and three competitors.</EmptyState>
        )}
      </Section>
      <Section title="Runs">
        {runs.length === 0 ? (
          <EmptyState>No runs yet.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-right">Attempts</TableHead>
                <TableHead className="text-right">Cost (est.)</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/workflows/${r.id}`} className="font-mono text-xs underline-offset-4 hover:underline">
                      {r.id}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StateBadge state={r.status} />
                  </TableCell>
                  <TableCell>
                    <ModeBadge mode={r.generationMode} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.attempts}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtUsd(r.costEstimateUsd)}</TableCell>
                  <TableCell>{fmtDate(r.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </>
  );
}
