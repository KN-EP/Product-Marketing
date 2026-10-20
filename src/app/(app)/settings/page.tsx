import { PageHeader, Section } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WORKFLOW_LIMITS } from "@/domain/workflow/workflow-state";
import { isCredentialsLoginEnabled, isDemoSwitcherEnabled } from "@/server/auth/demo-mode";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";
import { decideLlmMode, FALLBACK_MESSAGES } from "@/server/llm";
import { costCapUsd } from "@/server/workflow/limits";

export const dynamic = "force-dynamic";

/** Read-only in P0: changes to tenant policy are an admin operation outside the UI. */
export default async function SettingsPage() {
  const actor = await requirePageActor();
  const tdb = tenantDb(actor, getDb());
  const [tenant, members] = await Promise.all([tdb.views.tenantSettings(), tdb.views.members()]);
  const llm = decideLlmMode();

  const row = (label: string, value: React.ReactNode) => (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </>
  );

  return (
    <>
      <PageHeader title="Settings" description="Read-only overview. Tenant policy changes are an administrator operation and are not editable in this version." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Tenant">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {row("Name", tenant.name)}
            {row("Slug", <span className="font-mono text-xs">{tenant.slug}</span>)}
            {row("Demo tenant", tenant.isDemo ? "Yes — synthetic data only" : "No")}
          </dl>
        </Section>
        <Section title="External model policy" description="Checked before every external model call.">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {row("External models approved", tenant.externalModelsApproved ? <Badge>approved</Badge> : <Badge variant="outline">not approved</Badge>)}
            {row("Highest class sent externally", <Badge variant="outline">{tenant.maxExternalModelClass}</Badge>)}
          </dl>
        </Section>
        <Section title="Model provider">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {row("Mode", llm.mode === "live" ? <Badge>live</Badge> : <Badge variant="outline">simulated</Badge>)}
            {llm.mode === "live" ? row("Model", <span className="font-mono text-xs">{llm.model}</span>) : row("Reason", FALLBACK_MESSAGES[llm.reason])}
            {row("Cost cap per run", `$${costCapUsd().toFixed(2)}`)}
          </dl>
        </Section>
        <Section title="Workflow limits">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {row("Max attempts per run", WORKFLOW_LIMITS.maxAttempts)}
            {row("Max active runs per tenant", WORKFLOW_LIMITS.maxConcurrentRunsPerTenant)}
            {row("Model timeout", `${WORKFLOW_LIMITS.modelTimeoutMs / 1000} s`)}
            {row("Demo login", isCredentialsLoginEnabled() ? "enabled (seeded demo users only)" : "disabled")}
            {row("Demo identity switcher", isDemoSwitcherEnabled() ? "enabled (development only)" : "disabled")}
          </dl>
        </Section>
      </div>
      <Section title="Members">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.user.id}>
                <TableCell data-label="Name">{m.user.name}</TableCell>
                <TableCell data-label="E-mail">{m.user.email}</TableCell>
                <TableCell data-label="Role">{m.role}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </>
  );
}
