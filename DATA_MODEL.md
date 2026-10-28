# Data model

Source of truth: `prisma/schema.prisma`. Validate with `npm run db:validate`.

## Tenancy
Every tenant-owned model has `tenantId` and `@@unique([id, tenantId])`. Children reference parents
via composite FKs `(parentId, tenantId) → (id, tenantId)`, so a row cannot point at another tenant's
record at database level.

## Entities
| Model | Purpose | Notes |
|---|---|---|
| Tenant | Customer workspace | `isDemo`, `externalModelsApproved`, `maxExternalModelClass` |
| User, Membership | Identity and role per tenant | role ∈ viewer/editor/reviewer/admin |
| Product, ProductFeature | Product facts | `isSynthetic` flag |
| Source | Evidence document | stored `content` + `contentHash`; `url` nullable, never fabricated; status active/changed/invalid; classification |
| Claim | Verifiable product statement | state machine, reviewer, approvedAt, lastVerifiedAt, reviewDueAt, staleReason |
| ClaimEvidence | Claim ↔ Source link | exact `excerpt` + optional `locator` — no free-text citations |
| Persona, BuyerProblem | Buyer context | |
| ValueProposition (+ ValuePropositionClaim) | Feature × Problem × Persona, backed by claims | |
| Competitor, CompetitorEvidence | Competitive facts | evidence has its own review state |
| RegulatoryTrigger | e.g. EU AI Act | links source ids |
| Campaign | Campaign briefing (M8) | type (demand_generation / conversion / retention / loyalty / sales_enablement), objective, product, persona, market, channels, optional `startsOn`/`endsOn` (date) and `budgetEur`; composite FKs to Product and Persona |
| Kpi | KPI of a campaign (M11) | from the approved plan (`sourceVersionId`, `position`); human `target`, `baseline`, `unit`, `direction`, `aggregation`; unique per campaign and name; cascades with the campaign |
| KpiMeasurement | One value per KPI and period start | `@@unique([kpiId, periodStart])` → a re-import replaces; `importId` (composite FK) |
| KpiImport | CSV import record | file name, row counts, rejected rows (line + reason only), importer |
| Asset | Logical deliverable | state, `currentVersionId`; `campaignId` for campaign deliverables (composite FK, ON DELETE RESTRICT) |
| AssetVersion | Immutable content snapshot | `content`, `gateReport`, `gatesPassed`, `generationMode` (live/simulated) |
| WorkflowRun | Execution record | kind (`pmm_three_asset` / `campaign_gtm`), status, idempotencyKey (unique per tenant), model, prompt versions, usage, cost, error; `campaignId` for campaign runs |
| Approval | Human decision on one AssetVersion | approved / rejected / changes_requested + comment |
| AuditEvent | Change log | sanitized metadata only |

## Asset types
`product_intelligence_brief` (internal input), `messaging_framework`, `competitive_battlecard`,
`regulatory_gtm_brief`, since M8 `campaign_plan`, `content_matrix`, `sales_play`, and since M11
`performance_review` (stored with the server-computed `kpiSnapshot`). Schemas:
`src/domain/schemas/agents.ts`, `campaign.ts`, `performance.ts`. Statements carry `kpiRefs`
(KPI names; only valid in performance reviews).

Stored content is `jsonb`, which does not keep object key order; the UI and the Markdown export put
keys back into schema order (`src/domain/schemas/display-order.ts`).

## Migrations
`20261019190729_init`, `20261020090000_human_edit_provenance`, `20261028190000_campaigns`,
`20261029090000_kpis`.
