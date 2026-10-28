import Link from "next/link";
import { PageHeader, Section } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";
import { decideLlmMode } from "@/server/llm";

export const dynamic = "force-dynamic";

interface Step {
  n: string;
  title: string;
  what: string;
  href: string;
  linkText: string;
  done?: boolean;
}

/** Guided walkthrough of the 15-step P0 demonstration flow (PRODUCT_SPEC). Every step links to the real page. */
export default async function DemoPage() {
  const actor = await requirePageActor();
  const tdb = tenantDb(actor, getDb());
  const [tenant, p] = await Promise.all([tdb.tenant.get(), tdb.views.demoProgress()]);
  const simulated = decideLlmMode().mode === "simulated";

  const steps: Step[] = [
    { n: "1", title: "Select tenant", what: `You are in “${tenant.name}”. Switch tenants via the sign-in page.`, href: "/login", linkText: "Sign-in / switch tenant", done: tenant.isDemo },
    { n: "2", title: "Product area: AI Governance", what: "Open the product and its claims.", href: "/products", linkText: "Products" },
    { n: "3", title: "Persona: CISO", what: "Goals and concerns of the target buyer.", href: "/personas", linkText: "Personas" },
    { n: "4", title: "Market: Germany", what: "Entered when starting the workflow (default from the persona).", href: "/workflows", linkText: "Workflow start form" },
    { n: "5", title: "Trigger: EU AI Act", what: "Selected when starting the workflow; the source is a synthetic summary, not legal text.", href: "/knowledge/sources", linkText: "Sources" },
    { n: "6", title: "Approved claims and sources", what: "Each claim shows its source and the exact stored excerpt. Note the pending claim without evidence.", href: "/knowledge/claims", linkText: "Claims", done: p.claimsApproved > 0 },
    { n: "7", title: "Three competitors with evidence", what: "Placeholders; one approved evidence item backs the only permitted comparison.", href: "/competitors", linkText: "Competitors" },
    { n: "8–10", title: "Generate messaging framework, battlecard, regulatory brief", what: "Start the workflow: Agent A writes an internal input brief, agents B and C produce the three deliverables. In simulated mode, prepared outputs are replayed.", href: "/workflows", linkText: "Start workflow", done: p.runsCompleted > 0 },
    { n: "11", title: "Automated structural and evidence checks", what: "Open each of the three deliverables: gate report grouped by severity, findings linked to statements. Battlecard v1 fails deliberately.", href: "/assets", linkText: "Assets", done: p.runsCompleted > 0 },
    { n: "12", title: "Route to human review", what: "The three deliverables land in the review queue (the input brief stays internal). “Completed” never means approved.", href: "/approvals", linkText: "Approvals", done: p.assetsPending > 0 || p.assetsApproved > 0 },
    { n: "13", title: "Approve / reject / request changes", what: "Sign in as the reviewer. Battlecard v1: approval is blocked → request changes. As editor, open “Create corrected version”, click “Load prepared correction (simulated)”, review the form and save v2, submit, then approve. Regulatory content needs expert acknowledgement.", href: "/approvals", linkText: "Review queue", done: p.humanEdits > 0 && p.assetsApproved > 0 },
    { n: "14", title: "Export approved asset to Markdown", what: "On an approved asset: “Download approved vN (Markdown)” — version, approver, claim and source references, synthetic label.", href: "/assets", linkText: "Assets", done: p.exports > 0 },
    { n: "15", title: "Source evidence, run history, approval status", what: "Evidence panel on each asset, status timeline and prompt versions on the run, decisions in the version history.", href: "/workflows", linkText: "Run history" },
  ];

  const campaignSteps: Step[] = [
    { n: "16", title: "Campaign briefing", what: "Open the seeded campaign or create one: type, objective, persona, channels, timeframe, budget. The briefing is human input — agents treat it as data, not evidence.", href: "/campaigns", linkText: "Campaigns", done: p.campaigns > 0 },
    { n: "17", title: "Generate the campaign package", what: "On the campaign, “Generate campaign package”: Agent D writes the campaign plan, Agent E the content matrix, Agent F the sales play (outreach for demand campaigns; retention and loyalty plays list the customer data they still need). If a messaging framework was approved in step 13, it is reused as context.", href: "/campaigns", linkText: "Generate", done: p.campaignRunsCompleted > 0 },
    { n: "18", title: "Content matrix: unsupported promise blocked", what: "Content matrix v1 contains a “guaranteed” compliance headline → the gates block approval. As reviewer, request changes; as editor, “Create corrected version” → “Load prepared correction (simulated)” → save v2 → submit.", href: "/approvals", linkText: "Review queue" },
    { n: "19", title: "Approve and export the campaign package", what: "Plan and content mention the AI Act → expert acknowledgement required. Export each approved deliverable as Markdown. Nothing is sent, posted or booked from the system.", href: "/campaigns", linkText: "Campaigns", done: p.campaignAssetsApproved > 0 },
  ];

  const kpiSteps: Step[] = [
    { n: "20", title: "KPI tree from the approved plan", what: "Approve the campaign plan (expert acknowledgement), then open “Performance (KPIs)” on the campaign and create the KPI tree. Set numeric targets — the plan only proposed them.", href: "/campaigns", linkText: "Campaigns", done: p.kpis > 0 },
    { n: "21", title: "Import measurements", what: "Fill the import with the synthetic sample data (or upload a CSV export: kpi, date, value). Rejected rows are listed with line and reason. The target-vs-actual table is computed, not generated.", href: "/campaigns", linkText: "Campaigns", done: p.kpiImports > 0 },
    { n: "22", title: "Performance review", what: "“Generate performance review”: Agent G writes findings and recommendations; it may only quote the computed numbers (gate G10). Review, approve and export it like every deliverable.", href: "/campaigns", linkText: "Campaigns", done: p.performanceReviews > 0 },
  ];

  return (
    <>
      <PageHeader title="Guided demo" description="P0 demonstration flow (steps 1–15, ~15 minutes) the campaign package (steps 16–19, ~10 minutes) and the KPI analysis (steps 20–22, ~5 minutes). Every step opens the real page." />
      <Alert>
        <AlertTitle>Say this up front</AlertTitle>
        <AlertDescription>
          Everything you see in “{tenant.name}” is synthetic demo data. It does not describe a real product and no company named in it has reviewed it.
          {simulated ? " Simulated mode replays prepared outputs — nothing is generated live." : " Live mode: outputs are generated by the configured model and still require human review."}
        </AlertDescription>
      </Alert>
      {!tenant.isDemo ? (
        <Alert variant="destructive">
          <AlertTitle>Not a demo tenant</AlertTitle>
          <AlertDescription>The walkthrough is designed for a demo tenant. Sign in as one of its demo users.</AlertDescription>
        </Alert>
      ) : null}
      <StepList title="Steps" steps={steps} />
      <StepList title="Campaign package (M8–M10)" steps={campaignSteps} />
      <StepList title="KPI analysis (M11)" steps={kpiSteps} />
      <Section title="Isolation check (optional)">
        <p className="text-sm text-muted-foreground">
          Sign in as a user of the second demo tenant and open an asset, run or campaign URL of the first demo tenant: it returns 404, exactly like an id that does not exist.
        </p>
      </Section>
    </>
  );
}

function StepList({ title, steps }: { title: string; steps: Step[] }) {
  return (
    <Section title={title}>
      <ol className="flex flex-col divide-y rounded-lg border">
        {steps.map((s) => (
          <li key={s.n} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                <span className="mr-2 inline-block min-w-10 font-mono text-muted-foreground">{s.n}</span>
                {s.title}
                {s.done ? <span className="ml-2 text-xs font-normal text-muted-foreground">✓ done</span> : null}
              </p>
              <p className="mt-1 pl-12 text-sm text-muted-foreground">{s.what}</p>
            </div>
            <Link href={s.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {s.linkText}
            </Link>
          </li>
        ))}
      </ol>
    </Section>
  );
}
