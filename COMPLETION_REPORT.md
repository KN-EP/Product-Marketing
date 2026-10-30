# Completion report — ExtendPartner Product Marketing OS 3.0 (P0, M0–M7)

Status: all P0 milestones implemented; M7 in review. Date: 2026-10-20.

> All demo content is **synthetic**. “DataGuard Demo – Unofficial” is not a DataGuard product and implies no
> review or approval by DataGuard. Simulated mode replays prepared outputs; nothing is generated live.

## 1. Capabilities

| Area | What it does |
|---|---|
| Tenancy & auth | Sealed session cookie; `getActor()` resolves tenant + role from session and Membership only. Every query goes through `tenantDb(actor)`; foreign and missing ids both return 404. Composite `(id, tenantId)` FKs block cross-tenant links in the database. |
| Knowledge base | Products with features, sources (stored text, classification), claims with structured evidence (source + exact excerpt), personas, competitors with evidence. |
| Agents | A: product intelligence brief (**internal input**). B: messaging framework. C: competitive battlecard + regulatory GTM brief. Versioned prompts; sources passed as delimited untrusted data. |
| LLM layer | `SimulatedProvider` (default) and `AnthropicProvider` (server-only; strict tool use with Zod-derived schema, Zod re-validation, retries with backoff, timeout, usage + cost estimate). Classification gate before any external call. |
| Workflow | `pmm_three_asset` run: A → B → C, **three deliverables** in `pending_review` (one transaction); idempotent requests; cost cap checked before each call; 2 active runs per tenant; 3 attempts; explicit retry; stale runs failed automatically. |
| Quality gates | G1–G9 (schema, references, approved claims, verbatim excerpts, unsupported assertions, labelling, regulatory expert review, comparative evidence). Re-run at approval against the current knowledge base. |
| Review | Version history with provenance (Simulated / Live / Human-edited (based on vN)); rendered statements with FACT / INTERPRETATION / HYPOTHESIS / SUGGESTION tags; grouped gate findings linked to statements; evidence panel with stored excerpts; explicit decision (approve / reject / request changes), comment rules, expert acknowledgement; structured editor; Markdown export of approved versions only. |
| Audit | AuditEvent for every run transition, version, decision, blocked approval, export and claim decision — ids, states and counts only. |
| Demo | Guided `/demo` (15 steps, each linked to the real page), persistent synthetic-data and simulated-mode banners, `npm run demo:reset`. |
| Hardening | Rate limits, body-size limits, security headers (CSP, frame-ancestors, referrer-policy, …), central log sanitizer. |

## 2. Paths

| Path | Content |
|---|---|
| `src/domain/` | Framework-free rules: actor, gates, claim/asset/workflow state, export |
| `src/server/db/` | Prisma client (pg adapter), `tenant-scope.ts` (`tenantDb`), `views.ts` (page queries) |
| `src/server/auth/` | Session, `getActor()`, demo login |
| `src/server/llm/`, `src/server/prompts/`, `src/server/agents/` | Providers, classification gate, prompt templates, agents A/B/C |
| `src/server/workflow/` | Orchestrator (adapter + in-process), limits, pipeline, stale sweep |
| `src/server/review/` | Review persistence (submit, decide, new version, export, claims) |
| `src/server/assets/deliverables.ts` | Three deliverables vs. internal input brief |
| `src/server/demo/reset.ts`, `scripts/demo-reset.ts` | Demo reset |
| `src/server/http/` | Route/action error mapping, rate limits |
| `src/server/log.ts` | Log sanitizer |
| `src/lib/security-headers.ts`, `src/proxy.ts`, `next.config.ts` | Headers and body limits |
| `src/app/(app)/` | Signed-in pages; `src/app/api/` routes; `src/app/actions/` server actions |
| `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts` | Data model, 2 migrations, synthetic seed |
| `tests/unit`, `tests/integration`, `tests/e2e` | Vitest unit, Vitest against the test DB, Playwright |

## 3. Commands

```bash
npm install
npm run db:migrate          # prisma migrate deploy as the owner role (MIGRATION_DATABASE_URL)
npm run db:seed             # synthetic demo data as pmm_app (needs DEMO_USER_PASSWORD)
npm run dev                 # http://localhost:3000/login
npm run check               # prisma generate + typecheck + unit tests + schema validation
npm run build
npm run test:integration    # needs TEST_DATABASE_URL (separate DB); simulated mode
npm run test:e2e            # needs TEST_DATABASE_URL; builds, runs Playwright (Chromium)
npm run demo:reset          # demo tenants only; refuses in production
```

First E2E run on a machine: `npx playwright install chromium`.

## 4. Demo instructions

1. `npm run demo:reset`, then `npm run dev`; sign in as `editor@dataguard-demo.example` (password: `DEMO_USER_PASSWORD`;
   in development the identity switcher on `/login` also works).
2. Open **Guided demo** and follow the 15 steps. Short version:
   - **Workflows → Start workflow (3 deliverables).** The run page shows the timeline, prompt versions, cost ($0 simulated),
     the three deliverables and the internal input brief.
   - **Battlecard v1** fails the gates. As `reviewer@…`: approve is disabled with reasons → choose *Request changes*, comment.
   - As editor: **Create corrected version → Load prepared correction (simulated)** fills the form → review → **Save as new
     version (based on v1)** → **Submit for review**.
   - As reviewer: choose **Approve** explicitly → approved; **Download approved v2 (Markdown)**.
   - Messaging framework / regulatory brief: approval requires the expert-review checkbox.
   - Isolation: sign in as `admin@other-demo.example` and open a DataGuard asset URL → 404.

## 5. Test results (2026-10-20, final code)

| Suite | Result |
|---|---|
| `npm run check` | typecheck OK · **111/111** unit tests (7 files) · schema valid |
| `npm run build` | OK (Next.js 16.4.2; proxy registered) |
| `npm run test:integration` | **109/109** (4 files) against the TEST branch, simulated mode |
| `npm run test:e2e` | **7/7** Playwright (Chromium, 1280 px + 375 px) against the TEST branch, simulated mode |
| `npm audit --omit=dev` | **0** vulnerabilities (was 7 high before M7) |
| `npm audit` (incl. dev) | 7 high — all in the dev-only shadcn CLI chain (braces → fast-glob) |

E2E covers: editor run → battlecard gates fail → reviewer cannot approve → request changes → editor loads correction,
cancels (nothing stored), loads again, saves v2 → submit → reviewer approves with explicit selection → Markdown contains v2,
reviewer, claim and source refs; cross-tenant 404; security headers + 413 body limit; no horizontal scroll at 1280 px;
compact menu and stacked tables at 375 px.

## 6. Known limitations

- **Single instance.** Rate limits and the orchestrator run in-process; background runs use Next.js `after()`.
  Multiple instances or serverless need a shared store and a queue.
- **Stale-run heartbeat** is per agent step. A single live step with retries can in the worst case exceed 10 minutes and be
  swept; the run is then retried explicitly.
- **Settings are read-only** in the UI (tenant policy, members).
- **Demo authentication only** (seeded users, `DEMO_MODE=true`); no SSO/OIDC.
- **Human edits** change statement text and kind only; references are not editable in the UI.
- Pricing table for cost estimates covers Claude Fable 5.1, Opus 5.5 and Sonnet 5.5; other live models fail closed on the cost cap.

## 7. Security limitations

- CSP needs `script-src 'unsafe-inline'` (Next.js inline bootstrap) until a nonce-based CSP is wired through the proxy.
- Automated gates are supporting controls, not fact verification; human review stays mandatory.
- No penetration test yet; isolation is covered by unit, integration and E2E tests.
- Prisma’s schema engine does not support `sslmode=verify-full`; migration URLs use `sslmode=require&sslaccept=strict`.
- Not GDPR-compliant or certified by itself; DPA with the model provider required before processing customer data.

## 8. API usage considerations (live mode)

- Live calls only with `LLM_MODE=live`, `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` (never defaulted in code).
- Tenant must approve external models; data above `maxExternalModelClass` is blocked (restricted never leaves by default).
- One run = 4 model calls (A, B, C×2), each up to 2 requests; per-run cap `min(LLM_MAX_COST_USD_PER_RUN, $2.00)`, checked
  before every call with a worst-case estimate.
- No refusal fallback to another model (would bypass the tenant’s model approval); refusals fail the run with a clear error.
- Integration and E2E tests force simulated mode; no test makes a real API call.

## 9. Next priorities

1. SSO/OIDC and editable tenant settings (admin), replacing demo auth.
2. Durable job queue + shared rate-limit store (multi-instance), finer heartbeat in live mode.
3. Nonce-based CSP; external penetration test of tenant isolation.
4. Source management UI (upload, re-verification, stale propagation to claims) and reference editing in the editor.
5. Live-mode evaluation set for agents A/B/C before enabling external models for real customer data.

---

# Addendum — M8–M10 campaign package (branch `feature/m8-gtm-capabilities`, 2026-10-28)

Status: implemented, in review. All campaign demo content is **synthetic** as well.

## What was added

| Area | What it does |
|---|---|
| Data model | `Campaign` (briefing), `Asset.campaignId`, `WorkflowRun.campaignId` — composite `(id, tenantId)` FKs, ON DELETE RESTRICT; asset types `campaign_plan`, `content_matrix`, `sales_play`; migration `20261028190000_campaigns` |
| Agents | D campaign plan (F1), E content matrix (F4), F sales play (F2: outreach / retention / loyalty). Versioned prompts; the campaign plan is passed to E and F as delimited untrusted data; the latest approved messaging framework for the same product and persona is context for all three |
| Workflow | Run kind `campaign_gtm` (`{ kind, campaignId }`): same admission, idempotency, limits, cost cap, gates, single-transaction persistence and audit as `pmm_three_asset` |
| UI | `/campaigns` (briefing form, list), `/campaigns/[id]` (briefing, campaign package, runs, generate), run kind on `/workflows`, guided demo steps 16–19 |
| Review | Content matrix v1 is blocked by the gates (unsupported, absolute regulatory promise); prepared correction for the demo tenant; approval and Markdown export unchanged |
| Display | UI and Markdown export render object keys in schema order (jsonb does not keep key order) |

## Test results (2026-10-28, local Postgres 16, simulated mode)

| Suite | Result |
|---|---|
| `npm run check` | typecheck OK · **157/157** unit tests (8 files) · schema valid |
| `npm run build` | OK (built with the Google font stubbed — fonts.googleapis.com was not reachable from the build sandbox; no code change) |
| Integration | **121/121** (5 files) — migrations applied with `psql` because binaries.prisma.sh was blocked; `prisma migrate deploy` still to be run once against Neon |
| E2E (Playwright) | **11/11** (4 new campaign tests + the 7 existing) |

## Known limitations of this extension
- Simulated mode replays one fixture per deliverable (the sales play by requested play type).
- KPI analysis (F5) and channel audit / social strategy (F3) are not part of it (M11, M12).
- The migration was written by hand in Prisma's format; run `prisma migrate dev` once locally to
  confirm there is no drift before deploying.

---

# Addendum — M11 KPI analysis (branch `feature/m11-kpi-analysis`, 2026-10-28)

| Area | What it does |
|---|---|
| Data model | `Kpi`, `KpiMeasurement`, `KpiImport` (composite FKs, cascade with the campaign); asset type `performance_review`; migration `20261029090000_kpis` |
| KPI tree | Created once from the approved campaign plan; targets, baselines, unit, direction and aggregation set by people |
| Import | Strict CSV reader (`,`/`;`, ISO/German dates, EN/DE numbers), ≤ 200 KB / 5,000 rows, rejected rows by line and reason, re-import replaces |
| Analysis | Deterministic target vs. actual, pace pro rata to the campaign time, status thresholds 95 % / 75 % |
| Agent G | `campaign_performance` run; draft from the model, `kpiSnapshot` + `asOf` from the server; human edits keep the server numbers |
| Gates | `kpiRefs` on statements; G2 for unknown KPIs; **G10** blocks facts quoting numbers not in the referenced KPI results |
| UI | `/campaigns/[id]/performance` (KPI tree editor, import, results table, reviews), KPI table in the review and in the Markdown export, demo steps 20–22 |

Test results (local Postgres 16, simulated mode): `npm run check` 180/180 unit · integration 127/127 ·
E2E 15/15 · build OK (Google font stubbed for the sandbox build only). The migration is hand-written in
Prisma's format — confirm with `prisma migrate dev --create-only` before deploying.

Also fixed on this branch: the Markdown export now renders numeric fields (e.g. a sales play's
`dayOffset`), which were silently dropped before.


---

# Addendum — M12 strategy first (branch `feature/m12-strategy-first`, 2026-10-30)

Input: comments from the presentation review (product marketing, not just marketing).

| Area | What it does |
|---|---|
| Channels | `Campaign.channels` → `communicationChannels` + `salesChannels` (fixed list); same split in releases, strategy brief and campaign plan (`channelType`); migration moves "Sales outreach" / "Customer success" |
| Use cases & ICP | `use_case_definition` run, use case agent (`agent-uc.use-case-map` 1.0.0), asset `use_case_map`, section on the product page |
| Strategy first | `campaign_strategy` run, strategy agent (`agent-s.gtm-strategy` 1.0.0), asset `gtm_strategy_brief`; `campaign_gtm` refused (409) until it is approved; D/E/F get it as context (prompts 1.1.0) |
| Release & update | `Release` model + `/releases` (plan, form, detail), `release_communication` run, release agent (`agent-r.release-communication` 1.0.0), asset `release_communication_plan` |
| Demo | seeded release 2.4 per tenant; guided demo steps 16–26; demo reset includes releases |

Test results (local Postgres 16, simulated mode): typecheck OK · unit **217/217** (10 files) ·
integration **142/142** (7 files) · E2E **19/19** · build OK (Google font stubbed for the sandbox build
only). Migration `20261030120000_strategy_first` is hand-written in Prisma's format (binaries.prisma.sh
blocked in the sandbox) and was verified with `psql`, including the channel data move — confirm with
`prisma migrate dev --create-only` before deploying.
