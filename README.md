# ExtendPartner Product Marketing OS 3.0

AI-assisted, human-managed Product Marketing operating system for B2B technology companies.
Built by ExtendPartner Solutions GmbH.

> **Demo data disclaimer.** The seeded tenant "DataGuard Demo – Unofficial" contains only
> **synthetic** example data. It is not a DataGuard product, does not describe real DataGuard
> features and implies no approval by DataGuard.

## Status

This repository is being built milestone by milestone (see `IMPLEMENTATION_PLAN.md`).

| Milestone | Scope | Status |
|---|---|---|
| M0 | Plan, specs, repo hygiene | ✅ done |
| M1 | Data model (Prisma schema), Docker Compose, least-privilege DB role | ✅ done, initial migration applied |
| M2 | Domain core: agent schemas, quality gates, claim/asset/workflow state machines, Markdown export | ✅ done, 27 unit tests passing |
| M3 | Next.js app shell, auth, tenant-scoped data-access layer | ✅ done, integration test H passing |
| M4 | LLM provider abstraction (Anthropic + simulated), agents A/B/C | 🔍 in review |
| M5 | Workflow engine, persistence, run history | ⏳ |
| M6 | UI pages and guided `/demo` | ⏳ |
| M7 | Seed, integration and Playwright E2E tests, hardening | ⏳ |

## Requirements

- Node.js ≥ 22
- PostgreSQL: local via Docker Compose, or a hosted Postgres such as Neon
- An Anthropic API key is **optional**; without it the app runs in deterministic *simulated* mode.

## Database roles and URLs

| Variable | Role | Used by |
|---|---|---|
| `MIGRATION_DATABASE_URL` | schema owner (`pmm_admin` locally) | Prisma CLI only (`prisma.config.ts` → `prisma migrate …`) |
| `DATABASE_URL` | `pmm_app`, DML only | the app (`src/server/db`) and the seed |
| `TEST_DATABASE_URL` | separate test DB / Neon branch | `npm run test:integration` only |

`prisma.config.ts` loads `.env` via `dotenv/config`. The app never sees `MIGRATION_DATABASE_URL`.

**TLS for hosted Postgres (e.g. Neon).** The right parameter depends on the client that reads the URL:

| URL | Read by | Use |
|---|---|---|
| `DATABASE_URL`, `TEST_DATABASE_URL` | node-postgres (app, seed, tests) | `sslmode=verify-full` |
| `MIGRATION_DATABASE_URL`, `TEST_MIGRATION_DATABASE_URL` | Prisma schema engine (`prisma migrate`) | `sslmode=require&sslaccept=strict` |

The Prisma schema engine does not recognise `sslmode=verify-full` (unknown values are silently
accepted) and defaults to `sslaccept=accept_invalid_certs`; `sslaccept=strict` enables certificate
validation there.

## LLM mode

Live Anthropic calls happen only when `LLM_MODE=live` **and** `ANTHROPIC_API_KEY` **and**
`ANTHROPIC_MODEL` are set. Otherwise the app falls back to deterministic simulated output
(fixtures from `src/demo/fixtures.ts`) and shows a banner. The model ID comes from
`ANTHROPIC_MODEL` only — check the current IDs at
<https://platform.claude.com/docs/en/about-claude/models>.

Before any external call the classification gate checks the tenant's
`externalModelsApproved` and `maxExternalModelClass`; restricted data never leaves the server
unless an admin raises the limit.

## Quick start

```bash
npm install
cp .env.example .env          # then fill in real values — never commit .env
# local Postgres only: docker compose up -d db
npm run db:migrate            # prisma migrate deploy, as the owner role
npm run db:seed               # synthetic demo tenants + users, as pmm_app
npm run dev                   # http://localhost:3000/login
```

Seeded demo users (password: `DEMO_USER_PASSWORD`), all synthetic:
`editor|reviewer|admin@dataguard-demo.example` and `editor|reviewer|admin@other-demo.example`.
With `DEMO_MODE=true` in development, `/login` also shows a one-click demo identity switcher;
it is hard-disabled when `NODE_ENV=production`.

## Scripts

```bash
npm run check             # prisma generate + typecheck + unit tests + schema validation
npm run build             # prisma generate + next build
npm run test:integration  # migrates TEST_DATABASE_URL, runs tests/integration (test H)
```

`test:integration` exits with code 2 and prints `NOT EXECUTED` if `TEST_DATABASE_URL` is
unset, and refuses to run if it points at the same database as `DATABASE_URL` or
`MIGRATION_DATABASE_URL`.

Line endings: `.gitattributes` enforces LF in the repository.

## Repository layout

```
prisma/schema.prisma        data model (18 core entities + join tables)
prisma.config.ts            Prisma 7 config (datasource URL, migrations, seed)
docker/                     Postgres init (least-privilege app role)
prisma/seed.ts              synthetic seed: demo tenant (fixtures) + second tenant, 3 users each
src/app/                    Next.js App Router: /login, /dashboard, /assets/[id], /api/{assets,claims,sources}/[id]
src/server/auth/            iron-session cookie, getActor() (session + Membership), demo login
src/server/db/              Prisma client (pg driver adapter), tenantDb(actor) data-access layer
src/server/llm/             LlmProvider: AnthropicProvider (server-only) + SimulatedProvider, classification gate
src/server/prompts/         versioned prompt templates for agents A/B/C (id + version)
src/server/agents/          agents A/B/C: KnowledgeSnapshot in, schema-valid output out
src/components/ui/          shadcn/ui components
src/domain/                 framework-free business logic — no DB, no HTTP
  actor.ts                  principal, roles, DomainError
  knowledge/snapshot.ts     tenant-scoped read model + excerpt matching
  schemas/                  versioned Zod schemas for agent outputs
  quality-gates/gates.ts    automated checks G1–G9
  claims/claim-state.ts     claim lifecycle, evidence adequacy, stale propagation
  assets/asset-state.ts     immutable versions, review decisions
  workflow/workflow-state.ts run lifecycle, limits, idempotency
  export/markdown.ts        export of approved versions only
src/demo/fixtures.ts        synthetic demo records + simulated agent outputs
tests/unit/                 Vitest (no DB)
tests/integration/          Vitest against TEST_DATABASE_URL (tenant isolation, test H)
scripts/validate-schema.cjs offline Prisma schema validation (WASM)
```

## Documentation

`PRODUCT_SPEC.md` · `ARCHITECTURE.md` · `DATA_MODEL.md` · `SECURITY.md` · `DEMO_SCRIPT.md` · `ROADMAP.md` · `IMPLEMENTATION_PLAN.md`
