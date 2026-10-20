# Security

> These controls reduce risk; they do not make the system GDPR-compliant or certified.
> Status markers: ✅ implemented · ⏳ planned for the named milestone.

## Threat model (P0)
| Threat | Control |
|---|---|
| Cross-tenant data access via altered ids/params | ✅ domain checks + composite FKs · ✅ M3 `tenantDb(actor)` DAL, 404 on miss, `getActor()` from session + Membership only · test H passing (`npm run test:integration`) |
| Unauthorized approval (incl. by the AI) | ✅ `canReview` requires human reviewer; model output cannot set status |
| Unsupported/false claims reaching approved assets | ✅ gates G2–G7b, re-run at approval; export only of approved versions |
| Prompt injection via sources/uploads | ✅ M4 sources, claims, competitor evidence and the brief are passed inside delimited blocks with delimiter tags neutralised; system prompt declares them untrusted data; output is Zod-validated (unknown keys such as `status` stripped) and still gated |
| SSRF / arbitrary URL fetching | Not built. No generic fetch endpoint. Sources are entered/curated by humans |
| Confidential data sent to external model | ✅ M4 classification gate inside `AnthropicProvider.generate` (cannot be bypassed by callers): blocks unless `externalModelsApproved` and data ≤ `maxExternalModelClass`; prompt floor is `internal`; restricted never external unless an admin raises the limit |
| Secret leakage | API key server-side only (`server-only` import; unit test asserts only `src/server/llm` imports the SDK); `.env` gitignored; LLM errors carry no prompt/source text · ✅ M7 central logger (`src/server/log.ts`) redacts connection strings, URL credentials, API keys, bearer tokens, JWTs, key=value secrets and e-mails, drops prompt/content fields, truncates long strings |
| DB transport security | ✅ app URLs `sslmode=verify-full` (node-postgres); migration URLs `sslmode=require&sslaccept=strict` (Prisma schema engine ignores `verify-full`) |
| Abuse / cost blow-up | ✅ M5 per-run cost cap checked before every model call (live models without a documented price fail closed), max 2 active runs per tenant (advisory-locked admission), max 3 attempts, explicit retry only, 16 KB body limit on `POST /api/workflows` · ✅ M7 rate limits (login 10/5 min per IP+e-mail, workflow start 10/min and decisions 30/min per user; in-memory, per process), 64 KB declared-body limit for `/api/*` in `src/proxy.ts`, 300 KB server-action limit, stale runs (>10 min without progress) failed automatically |
| Run/audit data leakage | ✅ M5 `WorkflowRun.error` is built only from our own error codes/messages (unknown errors → generic text); AuditEvent metadata holds ids, states and counts only (no content, comments or prompts) |
| DB privilege abuse | ✅ separate `pmm_app` role with DML only; Postgres bound to 127.0.0.1 |
| Demo switcher in production | ✅ M3 hard-disabled when `NODE_ENV=production`; credentials login only for seeded demo users and only with `DEMO_MODE=true` |
| Session tampering | ✅ M3 sealed (encrypted + signed) HttpOnly, SameSite=Lax cookie (iron-session), `Secure` in production; tenant re-checked against Membership on every request |
| Clickjacking / content injection | ✅ M7 CSP (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`), `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `nosniff`, Permissions-Policy, HSTS in production · known gap: `script-src` needs `'unsafe-inline'` until a nonce-based CSP is added |
| Demo data operations | ✅ M7 `npm run demo:reset` touches only tenants with `isDemo = true`, refuses non-demo tenants and `NODE_ENV=production`, prints counts only |
| Vulnerable dependencies | ✅ M7 shadcn CLI moved to devDependencies: `npm audit --omit=dev` 7 high → 0; remaining 7 high are in the dev-only shadcn CLI chain |
| Migration credentials in the app | ✅ M3 app uses `DATABASE_URL` (DML-only role); `MIGRATION_DATABASE_URL` is read only by the Prisma CLI |

## Operational checklist (before any non-local deployment)
- [ ] Replace demo auth with SSO/OIDC; disable `DEMO_MODE`
- [ ] Rotate all default passwords in `docker/` and `.env`
- [ ] TLS in front of the app (cookies are `Secure` and HSTS is sent in production); nonce-based CSP
- [ ] Shared store for rate limits when running more than one instance
- [ ] Data processing agreement with the model provider before enabling external processing of customer data
- [ ] Backups and restore test; audit-log retention policy
- [ ] Dependency audit (`npm audit`), pinned versions
- [ ] Penetration test of tenant isolation
