# Product specification — Product Marketing OS 3.0 (P0)

## Purpose
Enable ExtendPartner to run senior-led, AI-assisted Product Marketing as a managed service.
AI drafts and flags; humans own strategy, approvals and every external representation.

## First use case
30-day Product Marketing Accelerator demonstration for a prospect in AI Governance /
EU AI Act messaging and sales enablement. The demo tenant is **"DataGuard Demo – Unofficial"**
and uses synthetic data only.

## P0 demonstration flow
1. Select tenant "DataGuard Demo – Unofficial".
2. Product area: AI Governance. 3. Persona: CISO. 4. Market: Germany. 5. Trigger: EU AI Act.
6. Load approved product claims and sources. 7. Select three competitors with evidence.
8–10. Generate Messaging Framework, Competitive Battlecard, Regulatory GTM Brief.
11. Automated structural and evidence checks. 12. Route to human review.
13. Approve / reject / request changes. 14. Export approved asset to Markdown.
15. Show source evidence, run history and approval status.

## Agents
| Agent | Output schema | Key rule |
|---|---|---|
| A — Product & Market Intelligence | `product_intelligence_brief.v1` | Never invents features; lists missing evidence and expert questions |
| B — Positioning & Messaging | `messaging_framework.v1` | Proof points must reference approved claim IDs |
| C — Competitive & GTM Enablement | `competitive_battlecard.v1`, `regulatory_gtm_brief.v1` | Comparative claims need approved competitor evidence |

Every generated statement carries `kind` ∈ {fact, interpretation, hypothesis, suggestion},
`claimIds`, `evidence[{sourceId, excerpt}]`, `competitorEvidenceIds`, `regulatory`, `comparative`.

## Quality gates (gates.v1)
| Gate | Check | Blocking |
|---|---|---|
| G1 | Output validates against the versioned schema | yes |
| G2 | Every claim/source/competitor-evidence ID exists in the tenant | yes |
| G3 | Referenced claims are approved and not stale | yes |
| G4 | Cited excerpts exist verbatim (normalised) in stored, active sources | yes |
| G5 | Facts have approved claims (product) or source excerpts (regulatory); absolute promises need claims | yes |
| G6 | Facts vs. interpretation/hypothesis/suggestion are labelled; mixed cases flagged | info |
| G7 | Regulatory/legal assertions detected independently of model labels → expert review required | ack required |
| G7b | Comparative assertions need approved competitor evidence | yes |
| G8 | Any critical finding blocks approval and export-as-approved | — |
| G9 | Gate report stored on each AssetVersion | — |

Gates re-run at approval time against the current knowledge base. **Automated checks are
supporting controls, not fact verification.**

## States
- Claim: draft → pending_review → approved | rejected; approved → stale (source changed) → pending_review.
- Asset: draft → pending_review → approved | changes_requested | (rejected → draft); new edits create a new draft version; archived.
- Workflow: created → queued → running → validation → pending_review → completed | failed.

## Roles
viewer (read) · editor (create/edit drafts, submit) · reviewer (approve/reject claims and assets) · admin (settings, provider approval).
Only humans with reviewer+ can approve. System actors never approve.

## Pages
/dashboard · /products · /products/[id] · /knowledge/sources · /knowledge/claims · /personas ·
/competitors · /workflows · /workflows/[id] · /assets · /assets/[id] · /approvals · /settings · /demo

## Acceptance tests
A dashboard + demo selection · B inspect knowledge/evidence · C start three-asset workflow ·
D schema-valid simulated outputs · E unsupported critical claim cannot be approved ·
F reject → request changes → approve corrected version · G export with version + sources ·
H cross-tenant access blocked · I missing API key does not break demo · J tests, typecheck, build green.

---

# Extension M8–M10 — campaign package (sales-near campaigns, digital activation, GTM)

## Purpose
Turn a human campaign briefing into three reviewable deliverables, with the same evidence rules,
gates and human approval as the P0 assets. AI drafts; people decide, send and publish.

| Capability | Area | Deliverable | Agent |
|---|---|---|---|
| F1 Campaigns for demand, conversion and retention | a, b, d | `campaign_plan.v1`: objective, audience, core message, channel mix × funnel stage, phases, KPI proposals, asset list | D — Campaign planning |
| F4 Target-group content and communication concepts | b, d | `content_matrix.v1`: content pillars, items per channel and funnel stage (headline, body, CTA), tone of voice, do-not-say | E — Content & communication |
| F2 Sales, retention and loyalty measures | a | `sales_play.v1`: outreach sequence, retention play or loyalty play (by campaign type) with steps, objections, discovery questions, success signals, data requirements, hand-off rules | F — Sales & CS enablement |

Not in this extension (see `IMPLEMENTATION_PLAN.md`, M11/M12): F5 KPI analysis (needs CSV import or
CRM/analytics data) and F3 channel audit / social strategy.

## Rules
- **Campaign** = human briefing (name, type, objective, product, persona, market, channels, optional
  timeframe and budget). Passed to agents as untrusted data, never as evidence.
- Run kind `campaign_gtm`: D → E → F. E and F receive D's plan only after it re-validates against
  `campaign_plan.v1`. The latest **approved** messaging framework for the same product and persona (if
  any) is context for all three; an unapproved one is never used.
- Headlines, bodies, messages, objectives and rationales are Statements → gates G1–G9 apply unchanged
  (product facts need approved claims, regulatory statements need excerpts + expert review, no absolute
  promises, comparisons need approved competitor evidence).
- KPI targets are proposals ("To be set by the team" without a baseline), never promised results.
- Retention and loyalty plays must list `dataRequirements`; until that data exists they are generic.
- No automated sending: no integration in this extension writes to an external channel.

## Pages
/campaigns (briefing form + list) · /campaigns/[id] (briefing, campaign package, runs, "Generate").
/workflows shows the run kind; /demo has steps 16–19.

## Acceptance tests
K create a campaign (editor; viewer 403; foreign product/persona 404; injected tenantId 400) ·
L campaign run → plan, content matrix, sales play in `pending_review`, linked to the campaign ·
M content matrix v1 blocked (unsupported, absolute regulatory promise) → changes requested →
prepared correction → v2 approved with expert acknowledgement → Markdown export ·
N approved messaging framework (same product + persona) used as context; unapproved or other-persona one not ·
O cross-tenant campaign page / campaign run → 404.

---

# Extension M11 — KPI analysis and performance optimisation (F5)

## Flow
1. Campaign plan approved (human) → **KPI tree** created from its KPIs (once per campaign).
2. Team sets numeric **target**, baseline, unit, direction (higher/lower is better) and aggregation
   (sum / latest / average) per KPI — the plan only proposed targets as text.
3. **CSV import** of measurements: columns `kpi`, `date`, `value` (aliases accepted), separator `,`
   or `;`, dates `YYYY-MM-DD` or `DD.MM.YYYY`, English or German number format. Same KPI and date →
   replaced. Rejected rows are reported by line and reason (never by content).
4. **Target vs. actual** is computed deterministically (`src/domain/kpis/analysis.ts`): actual,
   expected to date (sum KPIs: target pro rata to the elapsed campaign time), deviation, pace and
   status (on track ≥ 95 %, at risk ≥ 75 %, off track, no target, no data).
5. Run kind `campaign_performance` → agent G writes the **performance review** draft (summary,
   findings with likely causes, recommendations, data gaps). The server adds `asOf` and the computed
   `kpiSnapshot`; human edits cannot change them.

## Rules
- Numbers are never model output. Statements reference KPIs by name (`kpiRefs`).
- **G10**: a fact with `kpiRefs` must only quote numbers found in the referenced KPI results
  (rounded and locale forms accepted) — otherwise critical; in hypotheses/suggestions a warning.
  A verified percentage is not treated as an absolute promise; promise words still are.
- KPI references outside performance reviews fail G2.
- Causes are hypotheses; recommendations are suggestions; correlation is not causation.

## Acceptance tests
P KPI tree only from an approved plan, once; foreign campaign 404; viewer 403 ·
Q KPI edits limited to target/baseline/unit/direction/aggregation; foreign KPI 404 ·
R CSV import: accepted/rejected rows, replace on same date, 413 above 200 KB, 400 on a bad header ·
S performance run needs data (409), produces a gated review with server numbers; edits keep them;
approve → export with KPI table · T same data → same run, new import → new run.


# Extension M12 — strategy first (use cases, ICP, release communication)

Feedback from the product marketing review: the campaign package started too late — without target
groups, use cases and ICPs it is marketing, not product marketing. Communication channels and sales
channels were mixed. Release and update planning and communication were missing.

## The street (stations)
1. Knowledge (product, claims, sources) → 2. **Use cases & ICP** → 3. Messaging → 4. Competition &
regulation → 5. **Release & update** → 6. GTM strategy brief → campaign (plan, content, sales play) →
7. Impact (KPI analysis).

## Flow
- **Use case map** (`use_case_definition`, per product and market): ICP (summary, criteria, buying
  triggers, disqualifiers), target segments with priority, buying center, up to eight use cases with
  problem, trigger, desired outcome, capabilities (facts need approved claims) and evidence status.
- **GTM strategy brief** (`campaign_strategy`, per campaign): campaign hypothesis, ICP, segments,
  buying center, prioritised use cases (from the approved use case map), positioning, channel strategy
  (communication channels with segment and role; sales channels with role and hand-off), success
  criteria. **The campaign package (`campaign_gtm`) can only start once a reviewer has approved the
  brief** (409 `strategy_not_approved` otherwise); D, E and F receive it as context. A newly approved
  brief means a new package run (idempotency key includes the brief's version).
- **Releases** (`/releases`): release plan (version, date, type, changes, audiences, channels). The
  `release_communication` run drafts a communication plan: release tier, message and action per
  audience, timeline from internal enablement (T-14) to follow-up, release notes, customer notice,
  sales/support FAQ.

## Rules
- Communication channels (carry a message) and sales channels (close a deal or a renewal) are separate
  fields everywhere: briefing, strategy brief, campaign plan (`channelType`), release plan.
- Planned release changes are not facts until an approved claim supports them.
- Internal audiences are enabled before external audiences.
- All three new deliverables pass the same gates, human review and Markdown export as every other.

## Acceptance tests
- Unit: `tests/unit/strategy.test.ts`; integration: `tests/integration/strategy.test.ts` (strategy
  gate, use case map as context, releases, isolation of every new entry point, demo reset); E2E:
  `tests/e2e/release-flow.spec.ts` and the updated campaign/KPI flows.
