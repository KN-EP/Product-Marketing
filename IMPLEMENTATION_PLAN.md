# Implementation plan (P0)

Principle: every milestone ends green (`npm run check`, later `npm run build` and E2E).
Do not start P1/P2 features before the P0 end-to-end flow works.

## M0 — Plan & specs ✅
Repository inspected (empty). Specs written.

## M1 — Data model ✅
- ✅ Prisma schema; composite FKs `(id, tenantId)` so child rows cannot reference another tenant's parent.
- ✅ Docker Compose with Postgres bound to 127.0.0.1, separate `pmm_app` role (DML only).
- ✅ First migration `20261019190729_init` generated and applied.

## M2 — Domain core ✅
Framework-free, unit-tested: agent output schemas v1, quality gates, claim/asset/workflow
state machines, Markdown export, synthetic fixtures. Covers acceptance tests D, E, F, G and
the domain half of H.

## M3 — App shell, auth, tenant isolation ✅
- Next.js App Router, Tailwind, shadcn/ui.
- Session auth (credentials in demo mode only). Demo identity switcher hard-disabled when `NODE_ENV=production`.
- `getActor()` resolves tenant from session + Membership; never from request input.
- `tenantDb(actor)` data-access layer: every query injects `tenantId`; lookups by id use
  `findFirst({ where: { id, tenantId } })` and return 404 on miss.
- Integration test H: a user of tenant A requesting tenant B's ids receives 404 on every route.

## M4 — LLM layer & agents ✅
- `LlmProvider` interface; `AnthropicProvider` (server-only, timeout, retry/backoff on 429/5xx,
  usage capture) and `SimulatedProvider` (returns fixtures, labelled `simulated`).
- Versioned prompt templates in `src/server/prompts/` (id + version recorded per run).
- Structured output via tool-use/JSON schema derived from the Zod schemas; always re-validated with Zod.
- Data classification check before any external call (`Tenant.externalModelsApproved`,
  `maxExternalModelClass`). Restricted data never leaves the server by default.
- Missing API key → automatic fallback to simulated mode with visible banner (test I).

## M5 — Workflow engine ✅
- In-process orchestrator: A → B → C, persisted status transitions per `workflow-state.ts`.
- Idempotency via `@@unique([tenantId, idempotencyKey])`; duplicate requests return the existing run.
- Bounded concurrency per tenant, per-run cost cap, max attempts.
- Each output goes through `addVersion` → gates → `pending_review`. Workflow "completed" ≠ content approved.
- `OrchestratorAdapter` interface for a future n8n implementation (no dependency).

## M6 — UI 🔍 in review
Pages per PRODUCT_SPEC §Pages. `/demo` is the guided 15-step walkthrough.

## M7 — Seed, tests, hardening
- `prisma/seed.ts` loads `src/demo/fixtures.ts` + users (editor, reviewer, admin) + a second tenant for isolation tests.
- Vitest integration tests against a test database; Playwright E2E for the demo flow.
- Rate limits, body-size limits, log sanitizer, security headers.
- Completion report.
