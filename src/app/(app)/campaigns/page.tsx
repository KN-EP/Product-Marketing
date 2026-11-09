import Link from "next/link";
import { SyntheticTag } from "@/components/app/badges";
import { EmptyState, PageHeader, Section } from "@/components/app/page-header";
import { CreateCampaignForm } from "@/components/campaign/create-form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasRole } from "@/domain/actor";
import { deliverableSummary } from "@/lib/campaigns";
import { CAMPAIGN_TYPE_LABEL, fmtDay } from "@/lib/format";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const actor = await requirePageActor();
  const v = tenantDb(actor, getDb()).views;
  const [campaigns, products, personas] = await Promise.all([v.campaigns(), v.products(), v.personas()]);
  const canCreate = hasRole(actor, "editor");

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Campaign briefings and their campaign package: campaign plan (Agent D), content matrix (Agent E) and sales play (Agent F). Every deliverable passes the same gates and human review; nothing is sent or published from here."
      />
      <Section title="New campaign" description="The briefing is human input. KPI targets are proposed by the plan and confirmed by the team.">
        {!canCreate ? (
          <EmptyState>Only editors can create campaigns.</EmptyState>
        ) : products.length && personas.length ? (
          <CreateCampaignForm
            products={products.map((p) => ({ id: p.id, label: p.name }))}
            personas={personas.map((p) => ({ id: p.id, label: `${p.name} (${p.role})` }))}
            defaultMarket={personas[0]?.market ?? "Germany"}
          />
        ) : (
          <EmptyState>A campaign needs at least one product and one persona.</EmptyState>
        )}
      </Section>
      <Section title="All campaigns">
        {campaigns.length === 0 ? (
          <EmptyState>No campaigns yet.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Persona</TableHead>
                <TableHead>Timeframe</TableHead>
                <TableHead>Deliverables</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell data-label="Campaign" className="whitespace-normal">
                    <Link href={`/campaigns/${c.id}`} className="line-clamp-2 font-medium underline-offset-4 hover:underline">
                      {c.name}
                    </Link>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {c.product.name} · {c.market} {c.isSynthetic ? <SyntheticTag /> : null}
                    </span>
                  </TableCell>
                  <TableCell data-label="Type">{CAMPAIGN_TYPE_LABEL[c.type]}</TableCell>
                  <TableCell data-label="Persona">
                    {c.persona.name} ({c.persona.role})
                  </TableCell>
                  <TableCell data-label="Timeframe">
                    {c.startsOn || c.endsOn ? `${fmtDay(c.startsOn)} – ${fmtDay(c.endsOn)}` : "Not set"}
                  </TableCell>
                  <TableCell data-label="Deliverables" className="whitespace-normal">
                    {deliverableSummary(c.assets.map((a) => a.state))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </>
  );
}
