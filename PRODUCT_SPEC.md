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
