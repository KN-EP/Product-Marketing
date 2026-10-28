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

## M6 — UI ✅
Pages per PRODUCT_SPEC §Pages. `/demo` is the guided 15-step walkthrough.

## M7 — Demo correctness, demo reset, hardening, E2E 🔍 in review
- QA fixes: three deliverables (Agent A brief is an internal input), prepared correction only pre-fills the editor,
  no pre-selected decision, grouped findings, tenant-aware banner, synthetic product features, responsive layout.
- `npm run demo:reset` (demo tenants only; refuses in production).
- Automatic stale-run sweep; rate limits; body-size limits; security headers; central log sanitizer.
- Vitest unit + integration against the test database; Playwright E2E for the review loop.
- Completion report: `COMPLETION_REPORT.md`.

---

# Extension plan (M8+)

Source: capability check "vertriebsnahe Kampagnen / digitale Aktivierung / Go-to-Market" (Oct 2026).
Same principle: every milestone ends green; human approval stays the only way to "approved".

## M8 — Data model + content (F4) ✅ (review)
- `Campaign` model, `Asset.campaignId`, `WorkflowRun.campaignId` (composite FKs), asset types
  `campaign_plan`, `content_matrix`, `sales_play`; migration `20261028190000_campaigns`.
- `content_matrix.v1` + agent E; demo v1 fails the gates (unsupported "guaranteed" compliance headline),
  prepared correction for the demo tenant.

## M9 — Campaigns (F1) ✅ (review)
- Campaign briefing (`CampaignInput`, `/campaigns`), `campaign_plan.v1` + agent D, run kind
  `campaign_gtm` (D → E → F), approved messaging framework as context.

## M10 — Sales plays (F2) ✅ (review)
- `sales_play.v1` + agent F: outreach sequence; retention / loyalty play by campaign type, with
  `dataRequirements`. Export only — no automated sending.
- Guided demo steps 16–19, unit + integration + E2E tests.

## M11 — KPI analysis (F5), next
- KPI tree per campaign (from the approved plan), CSV import of measurements, deviation analysis
  → recommendation (reviewed like any asset). Later: GA4, CRM, LinkedIn Ads (read-only).

## M12 — Channel audit & social/digital strategy (F3), next
- Channel audit (CSV/URL input), content pillars, editorial calendar; retention plays with CRM data.
