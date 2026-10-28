import Link from "next/link";
import { GatesBadge, ModeBadge, StateBadge, SyntheticTag } from "@/components/app/badges";
import { EmptyState, PageHeader, Section } from "@/components/app/page-header";
import { GenerateCampaignPackageButton } from "@/components/campaign/generate-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasRole } from "@/domain/actor";
import { playTypeFor } from "@/domain/campaigns/campaign";
import { ASSET_TYPE_LABEL, CAMPAIGN_TYPE_LABEL, fmtDate, fmtDay, fmtEur } from "@/lib/format";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";
import { or404 } from "@/server/http/page";

export const dynamic = "force-dynamic";

const PLAY_LABEL: Record<string, string> = {
  outreach_sequence: "Outreach sequence",
  retention_play: "Retention play",
  loyalty_play: "Loyalty play",
};

/** Campaign briefing, its campaign package (deliverables) and run history. Route param = record id; tenant from the session. */
export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageActor();
  const c = await or404(tenantDb(actor, getDb()).views.campaign(id));
  const canGenerate = hasRole(actor, "editor");
  const play = playTypeFor(c.type);
  // Performance reviews are listed on the performance page.
  const packageAssets = c.assets.filter((a) => a.type !== "performance_review");

  const briefing: [string, React.ReactNode][] = [
    ["Type", CAMPAIGN_TYPE_LABEL[c.type]],
    ["Objective", c.objective],
    [
      "Product",
      <Link key="p" href={`/products/${c.product.id}`} className="underline underline-offset-2">
        {c.product.name}
      </Link>,
    ],
    ["Persona", `${c.persona.name} (${c.persona.role})`],
    ["Market", c.market],
    ["Channels", c.channels.join(", ")],
    ["Timeframe", c.startsOn || c.endsOn ? `${fmtDay(c.startsOn)} – ${fmtDay(c.endsOn)}` : "Not set"],
    ["Budget", fmtEur(c.budgetEur)],
    ["Sales play", PLAY_LABEL[play]],
  ];

  return (
    <>
      <PageHeader
        title={
          <span className="line-clamp-2" title={c.name}>
            {c.name}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            {CAMPAIGN_TYPE_LABEL[c.type]} · {c.persona.name} · {c.market} {c.isSynthetic ? <SyntheticTag /> : null}
          </span>
        }
        actions={
          <>
            <Link href={`/campaigns/${c.id}/performance`} className={buttonVariants({ variant: "outline" })}>
              Performance (KPIs)
            </Link>
            {canGenerate ? <GenerateCampaignPackageButton campaignId={c.id} hasRuns={c.workflowRuns.length > 0} /> : null}
          </>
        }
      />

      <Alert>
        <AlertTitle>Drafts for people, not automation</AlertTitle>
        <AlertDescription>
          The campaign package is generated as drafts and routed to human review. Nothing is sent, posted or booked from this system; approved
          deliverables leave it only as a Markdown export.
          {play !== "outreach_sequence"
            ? " Retention and loyalty plays list the customer data they need (usage, renewal, health/NPS) — until that data is connected they are generic playbooks."
            : ""}
        </AlertDescription>
      </Alert>

      <Section id="briefing" title="Briefing" description={`Created ${fmtDate(c.createdAt)}. Human input — passed to the agents as data, never as evidence.`}>
        <dl className="grid gap-x-6 gap-y-3 rounded-lg border p-4 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
          {briefing.map(([k, val]) => (
            <div key={k} className="contents">
              <dt className="font-medium text-muted-foreground">{k}</dt>
              <dd className="min-w-0 break-words">{val}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        id="deliverables"
        title="Campaign package"
        description="Campaign plan (F1), content matrix (F4) and sales play (F2). Open a deliverable to review the gate report, the evidence and the decision."
      >
        {packageAssets.length === 0 ? (
          <EmptyState>No deliverables yet. {canGenerate ? "Generate the campaign package to create them." : "An editor can generate them."}</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deliverable</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Latest version</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packageAssets.map((a) => {
                const v = a.versions[0];
                return (
                  <TableRow key={a.id}>
                    <TableCell data-label="Deliverable" className="whitespace-normal">
                      <Link href={`/assets/${a.id}`} className="line-clamp-2 font-medium underline-offset-4 hover:underline">
                        {a.title}
                      </Link>
                    </TableCell>
                    <TableCell data-label="Type">{ASSET_TYPE_LABEL[a.type]}</TableCell>
                    <TableCell data-label="State">
                      <StateBadge state={a.state} />
                    </TableCell>
                    <TableCell data-label="Latest version">
                      {v ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          v{v.versionNumber} <ModeBadge mode={v.generationMode} /> <GatesBadge passed={v.gatesPassed} />
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section id="runs" title="Runs">
        {c.workflowRuns.length === 0 ? (
          <EmptyState>No runs yet.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.workflowRuns.map((r) => (
                <TableRow key={r.id}>
                  <TableCell data-label="Run">
                    <Link href={`/workflows/${r.id}`} className="font-mono text-xs underline-offset-4 hover:underline">
                      {r.id}
                    </Link>
                  </TableCell>
                  <TableCell data-label="Status">
                    <StateBadge state={r.status} />
                  </TableCell>
                  <TableCell data-label="Mode">
                    <ModeBadge mode={r.generationMode} />
                  </TableCell>
                  <TableCell data-label="Created">{fmtDate(r.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </>
  );
}
