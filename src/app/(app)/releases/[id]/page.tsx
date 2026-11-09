import Link from "next/link";
import { GatesBadge, ModeBadge, StateBadge, SyntheticTag } from "@/components/app/badges";
import { EmptyState, PageHeader, Section } from "@/components/app/page-header";
import { StartRunButton } from "@/components/campaign/generate-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasRole } from "@/domain/actor";
import { salesChannelLabel } from "@/domain/campaigns/campaign";
import { RELEASE_AUDIENCE_LABEL, RELEASE_TYPE_LABEL } from "@/domain/releases/release";
import { ASSET_TYPE_LABEL, fmtDate, fmtDay } from "@/lib/format";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";
import { or404 } from "@/server/http/page";

export const dynamic = "force-dynamic";

/** M12: release briefing, its communication plans and runs. Route param = record id; tenant from the session. */
export default async function ReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageActor();
  const r = await or404(tenantDb(actor, getDb()).views.release(id));
  const canGenerate = hasRole(actor, "editor");

  const briefing: [string, React.ReactNode][] = [
    [
      "Product",
      <Link key="p" href={`/products/${r.product.id}`} className="underline underline-offset-2">
        {r.product.name}
      </Link>,
    ],
    ["Version", r.version],
    ["Type", RELEASE_TYPE_LABEL[r.type]],
    ["Planned", r.plannedOn ? fmtDay(r.plannedOn) : "Not set"],
    ["Summary", r.summary],
    [
      "Changes",
      <ul key="c" className="list-disc pl-5">
        {r.changes.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>,
    ],
    ["Audiences", r.audiences.map((a) => (RELEASE_AUDIENCE_LABEL as Record<string, string>)[a] ?? a).join(", ")],
    ["Communication channels", r.communicationChannels.join(", ") || "None"],
    ["Sales channels", r.salesChannels.map(salesChannelLabel).join(", ") || "None"],
  ];

  return (
    <>
      <PageHeader
        title={
          <span className="line-clamp-2" title={r.name}>
            {r.name} · {r.version}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            {RELEASE_TYPE_LABEL[r.type]} · {r.product.name} {r.isSynthetic ? <SyntheticTag /> : null}
          </span>
        }
        actions={
          canGenerate ? (
            <StartRunButton
              input={{ kind: "release_communication", releaseId: r.id }}
              label={r.assets.length ? "Generate new communication plan" : "Generate communication plan"}
            />
          ) : null
        }
      />

      <Alert>
        <AlertTitle>Planned changes are not facts yet</AlertTitle>
        <AlertDescription>
          The plan describes planned features as planned. A change is stated as a product fact only once an approved claim supports it. Internal sales and
          support are enabled before customers, prospects and partners hear about the release.
        </AlertDescription>
      </Alert>

      <Section id="briefing" title="Release briefing" description={`Created ${fmtDate(r.createdAt)}. Human input — passed to the agent as data, never as evidence.`}>
        <dl className="grid gap-x-6 gap-y-3 rounded-lg border p-4 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]">
          {briefing.map(([k, val]) => (
            <div key={k} className="contents">
              <dt className="font-medium text-muted-foreground">{k}</dt>
              <dd className="min-w-0 break-words">{val}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="plans" title="Communication plans" description="Release tier, messages per audience, timeline, release notes, customer notice and FAQ. Open a plan to review it.">
        {r.assets.length === 0 ? (
          <EmptyState>No communication plan yet.</EmptyState>
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
              {r.assets.map((a) => {
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
        {r.workflowRuns.length === 0 ? (
          <EmptyState>No runs yet.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {r.workflowRuns.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/workflows/${w.id}`} className="font-mono text-xs underline-offset-4 hover:underline">
                  {w.id}
                </Link>
                <StateBadge state={w.status} /> <ModeBadge mode={w.generationMode} /> {fmtDate(w.createdAt)}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
