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
| Asset | Logical deliverable | state, `currentVersionId` |
| AssetVersion | Immutable content snapshot | `content`, `gateReport`, `gatesPassed`, `generationMode` (live/simulated) |
| WorkflowRun | Execution record | status, idempotencyKey (unique per tenant), model, prompt versions, usage, cost, error |
| Approval | Human decision on one AssetVersion | approved / rejected / changes_requested + comment |
| AuditEvent | Change log | sanitized metadata only |
