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
| M1 | Data model (Prisma schema), Docker Compose, least-privilege DB role | ✅ schema validated · ⏳ migrations not yet generated |
| M2 | Domain core: agent schemas, quality gates, claim/asset/workflow state machines, Markdown export | ✅ done, 27 unit tests passing |
| M3 | Next.js app shell, auth, tenant-scoped data-access layer | ⏳ next |
| M4 | LLM provider abstraction (Anthropic + simulated), agents A/B/C | ⏳ |
| M5 | Workflow engine, persistence, run history | ⏳ |
| M6 | UI pages and guided `/demo` | ⏳ |
| M7 | Seed, integration and Playwright E2E tests, hardening | ⏳ |

## Requirements

- Node.js ≥ 22
- Docker (for PostgreSQL) — from M1 onward
- An Anthropic API key is **optional**; without it the app runs in deterministic *simulated* mode.

## Quick start (current state)

```bash
npm install
npm run check        # typecheck + unit tests + Prisma schema validation
```

Once M3+ land:

```bash
cp .env.example .env
docker compose up -d db
npx prisma migrate dev
npx prisma db seed
npm run dev          # http://localhost:3000/demo
```

## Repository layout

```
prisma/schema.prisma        data model (18 core entities + join tables)
prisma.config.ts            Prisma 7 config (datasource URL, migrations, seed)
docker/                     Postgres init (least-privilege app role)
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
tests/unit/                 Vitest
scripts/validate-schema.cjs offline Prisma schema validation (WASM)
```

## Documentation

`PRODUCT_SPEC.md` · `ARCHITECTURE.md` · `DATA_MODEL.md` · `SECURITY.md` · `DEMO_SCRIPT.md` · `ROADMAP.md` · `IMPLEMENTATION_PLAN.md`
