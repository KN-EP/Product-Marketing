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
    { n: "16", title: "Campaign briefing", what: "Open the seeded campaign or create one: type, objective, persona, timeframe, budget — and two separate channel lists: communication channels (LinkedIn, email, webinar …) and sales channels (direct sales, partners & resellers, customer success …). The briefing is human input — agents treat it as data, not evidence.", href: "/campaigns", linkText: "Campaigns", done: p.campaigns > 0 },
    { n: "17", title: "Use cases & ICP", what: "On the product, “Define use cases & ICP”: the use case agent proposes the ideal customer profile, target segments, buying center and prioritised use cases. Capabilities need approved claims — the automated classification use case stays “unsupported”. Approve it as reviewer (expert acknowledgement).", href: "/products", linkText: "Products", done: p.useCaseMaps > 0 },
    { n: "18", title: "GTM strategy brief first", what: "On the campaign, “Generate GTM strategy brief”: target segments, buying center, prioritised use cases (from the approved use case map), positioning and the channel strategy — communication channels and sales channels with hand-offs. The campaign package stays locked until a reviewer approves the brief.", href: "/campaigns", linkText: "Campaigns", done: p.strategiesApproved > 0 },
    { n: "19", title: "Generate the campaign package", what: "Now “Generate campaign package”: Agent D writes the campaign plan (every channel marked as communication or sales), Agent E the content matrix, Agent F the sales play with hand-offs per sales channel — all built on the approved strategy brief.", href: "/campaigns", linkText: "Generate", done: p.campaignRunsCompleted > 0 },
    { n: "20", title: "Content matrix: unsupported promise blocked", what: "Content matrix v1 contains a “guaranteed” compliance headline → the gates block approval. As reviewer, request changes; as editor, “Create corrected version” → “Load prepared correction (simulated)” → save v2 → submit.", href: "/approvals", linkText: "Review queue" },
    { n: "21", title: "Approve and export the campaign package", what: "Plan and content mention the AI Act → expert acknowledgement required. Export each approved deliverable as Markdown. Nothing is sent, posted or booked from the system.", href: "/campaigns", linkText: "Campaigns", done: p.campaignAssetsApproved > 0 },
  ];

  const kpiSteps: Step[] = [
    { n: "22", title: "KPI tree from the approved plan", what: "Approve the campaign plan (expert acknowledgement), then open “Performance (KPIs)” on the campaign and create the KPI tree. Set numeric targets — the plan only proposed them.", href: "/campaigns", linkText: "Campaigns", done: p.kpis > 0 },
    { n: "23", title: "Import measurements", what: "Fill the import with the synthetic sample data (or upload a CSV export: kpi, date, value). Rejected rows are listed with line and reason. The target-vs-actual table is computed, not generated.", href: "/campaigns", linkText: "Campaigns", done: p.kpiImports > 0 },
    { n: "24", title: "Performance review", what: "“Generate performance review”: Agent G writes findings and recommendations; it may only quote the computed numbers (gate G10). Review, approve and export it like every deliverable.", href: "/campaigns", linkText: "Campaigns", done: p.performanceReviews > 0 },
  ];

  const releaseSteps: Step[] = [
    { n: "25", title: "Release plan", what: "Open “Releases”: the seeded release 2.4 (feature update) with its changes, audiences and both channel lists. Add a release to the plan if you like.", href: "/releases", linkText: "Releases", done: p.releases > 0 },
    { n: "26", title: "Release communication plan", what: "On the release, “Generate communication plan”: release tier, message per audience, timeline from internal enablement (T-14) to follow-up, release notes, customer notice and sales/support FAQ. Planned features are stated as planned, not as facts.", href: "/releases", linkText: "Releases", done: p.releasePlans > 0 },
  ];

  const assetSteps: Step[] = [
    { n: "27", title: "Assets & sales toolkit", what: "On the campaign (strategy brief approved), section “3 · Assets & sales toolkit”: pick a deliverable — product page, solution brief, case study, ad copy, pitch deck outline, demo story, discovery guide, ROI argument and more — and generate it. One deliverable per run, built on the approved strategy brief.", href: "/campaigns", linkText: "Campaigns", done: p.enablementAssets > 0 },
    { n: "28", title: "One-pager: a number without basis is blocked", what: "Generate the one-pager: “Teams save 40 % …” is stated as fact without a claim → gate G11 blocks approval. As editor, “Create corrected version” → “Load prepared correction (simulated)”: the number becomes a marked, illustrative assumption. Save v2, submit, approve.", href: "/approvals", linkText: "Review queue" },
    { n: "29", title: "ROI argument and case study", what: "Generate the ROI argument: every number rests on a named assumption (customer input, benchmark to verify, illustrative) and is never a fact. The case study stays anonymous — a named customer without documented approval would be blocked (gate G12). Approve and export.", href: "/campaigns", linkText: "Campaigns", done: p.enablementApproved > 0 },
  ];

  const researchSteps: Step[] = [
    { n: "30", title: "Win/loss interviews with consent", what: "Open “Win/loss & research”: six pseudonymised interviews with reason codes from the CRM taxonomy. Five have granted consent (notes stored as a confidential interview source), one only “requested” — it is counted, never analysed. Record one more if you like: notes are refused without consent and contact data is refused always.", href: "/research", linkText: "Win/loss & research", done: p.interviews > 0 },
    { n: "31", title: "Win/loss synthesis", what: "“Generate win/loss synthesis”: the counts and the win rate are computed in code; the agent writes drivers, patterns and implications and may only quote those numbers (gate G15) and verbatim interview excerpts (gate G4). Fewer than five interviews → every driver is flagged as a hypothesis. Approve and export it.", href: "/research", linkText: "Generate synthesis", done: p.winLossApproved > 0 },
    { n: "32", title: "Consent withdrawn", what: "Withdraw consent for “automotive supplier A”: the notes are erased and the source becomes invalid. Try to export the approved synthesis again — blocked: the approval no longer holds because its evidence is gone (approval_outdated). A new synthesis leaves the interview out.", href: "/research", linkText: "Interviews", done: p.consentWithdrawn > 0 },
  ];

  const launchSteps: Step[] = [
    { n: "33", title: "Staged launch and computed readiness", what: "Open “Launches” → the seeded tier-1 launch of a new module: used internally (customer zero), no external reference yet. The readiness matrix is computed from approvals, claims and proof: every phase is “not ready” until the launch plan is approved; the market phase stays “not ready” without an external reference.", href: "/launches", linkText: "Launches", done: p.launches > 0 },
    { n: "34", title: "Launch plan", what: "“Generate launch plan”: early access → GA → existing customers → market, a proof plan (turn early-access customers into references), the enablement plan and success signals. The plan never says “go”; gate G16 warns for every phase that is planned while not ready. Approve it as reviewer.", href: "/launches", linkText: "Launches", done: p.launchPlans > 0 },
    { n: "35", title: "Go / no-go", what: "As reviewer: early access “go” (ready once the plan is approved). Market launch “go” is refused — no external reference. As editor, update the proof (e.g. two references after early access): the matrix changes. Each decision stores the readiness it was based on.", href: "/launches", linkText: "Decide", done: p.launchDecisions > 0 },
  ];

  const radarSteps: Step[] = [
    { n: "36", title: "Regulatory radar: record a change", what: "Open “Regulatory radar”: the watched EU AI Act application date (synthetic scenario: 2 August 2026) and the approved regulatory claim that depends on it. “Load prepared change (simulated)” → the deadline moves to 2 December 2027 → record it. The source text is replaced, the claim becomes stale, and every asset that cites the source, the claim or the old date is listed with the reason.", href: "/radar", linkText: "Regulatory radar", done: p.regulatoryChanges > 0 },
    { n: "37", title: "Consequences", what: "Open the launch: every phase is now “not ready” (stale claim, open alert). An approved asset that relied on the claim can no longer be exported (approval_outdated). “Generate change brief”: what changed (verbatim excerpt), affected messages, a new do-not-say list — regulatory statements need expert acknowledgement.", href: "/launches", linkText: "Launches", done: p.changeBriefs > 0 },
    { n: "38", title: "Resolve the alert", what: "As reviewer, “Resolve alert” is refused while the claim is still stale. Retire it (claims page: move it to draft) or re-verify a corrected claim, then resolve with a note. The launch readiness turns back.", href: "/radar", linkText: "Resolve", done: p.regulatoryResolved > 0 },
  ];

  return (
    <>
      <PageHeader title="Guided demo" description="P0 demonstration flow (steps 1–15, ~15 minutes), strategy first and the campaign package (steps 16–21, ~12 minutes), the KPI analysis (steps 22–24, ~5 minutes), release communication (steps 25–26, ~3 minutes), assets & sales toolkit (steps 27–29, ~5 minutes) win/loss & research (steps 30–32, ~5 minutes) the staged launch (steps 33–35, ~5 minutes) and the regulatory radar (steps 36–38, ~5 minutes). Every step opens the real page." />
      <Alert>
        <AlertTitle>Say this up front</AlertTitle>
        <AlertDescription>
          This is a governed system of record, not a prompt: every statement is labelled and backed by evidence, every deliverable is approved by a person, and an
          approval only holds while its evidence holds. Everything you see in “{tenant.name}” is synthetic demo data. It does not describe a real product and no company named in it has reviewed it.
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
      <StepList title="Strategy first and campaign package (M8–M10, M12)" steps={campaignSteps} />
      <StepList title="KPI analysis (M11)" steps={kpiSteps} />
      <StepList title="Release & update communication (M12)" steps={releaseSteps} />
      <StepList title="Assets & sales toolkit (M13)" steps={assetSteps} />
      <StepList title="Win/loss & research (M14)" steps={researchSteps} />
      <StepList title="Launch (M15)" steps={launchSteps} />
      <StepList title="Regulatory radar (M16)" steps={radarSteps} />
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
