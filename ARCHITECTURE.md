# Architecture

## Shape
A single Next.js (App Router) application on one machine, PostgreSQL via Docker Compose.
No microservices. Layering, inside-out:

```
src/domain/     pure TypeScript business rules (no DB, no HTTP, no SDKs)  ← implemented
src/server/     data access (tenant-scoped Prisma), LLM providers, workflow orchestrator, auth
src/app/        route handlers / server actions / pages (thin; call server layer)
```

The domain layer decides; the server layer persists and wires; the UI displays.

## Key decisions
1. **Tenant from session only.** `Actor` is resolved from session + Membership. Route params
   identify records, never tenants. Every query is filtered by `actor.tenantId`; misses return 404
   (no existence leaks). DB composite FKs `(id, tenantId)` prevent cross-tenant references even if
   application code is wrong.
2. **Approval is never model output.** `addVersion` ignores any status in model output; only
   `decide()` with a human reviewer actor can approve, and only the current version.
3. **Immutable versions.** AssetVersion rows have no update path; in memory they are deep-frozen.
4. **Gates are deterministic code**, not LLM self-checks. They run at generation and again at approval.
5. **Provider abstraction.** `LlmProvider { generate(schema, prompt, opts) }`; Anthropic now,
   others later; `SimulatedProvider` exercises the identical pipeline offline.
6. **Orchestration in app code**, with an adapter interface for n8n later.
7. **Observability.** WorkflowRun stores status, timings, model id, prompt versions, input refs,
   usage/cost estimate, error and attempts.

## Request path (generation)
```
POST /api/workflows  → getActor() → validate input (Zod) → idempotencyKey
  → WorkflowRun(created→queued) → orchestrator
     → build KnowledgeSnapshot (tenant-scoped)
     → classification check → provider.generate (A, B, C)
     → Zod validate → addVersion (gates) → Asset pending_review
  → WorkflowRun(pending_review → completed)
```

`{ kind: "campaign_gtm", campaignId }` follows the same path: the Campaign is resolved through
`tenantDb` (404 on a foreign id), the pipeline is D → E → F, and the three deliverables are stored with
`campaignId`. The orchestrator selects inputs, pipeline and titles per run kind (`prepare()`); limits,
idempotency, gates, persistence and audit are shared.

`campaign_performance` (M11) computes the KPI results in code (`src/domain/kpis/analysis.ts`),
gives them to agent G as delimited data, and attaches them to the stored review as `kpiSnapshot`
— the model never writes numbers that are stored. Gate G10 checks quoted numbers against it.
