# Security

> These controls reduce risk; they do not make the system GDPR-compliant or certified.
> Status markers: ✅ implemented · ⏳ planned for the named milestone.

## Threat model (P0)
| Threat | Control |
|---|---|
| Cross-tenant data access via altered ids/params | ✅ domain checks + composite FKs · ✅ M3 `tenantDb(actor)` DAL, 404 on miss, `getActor()` from session + Membership only · test H written (`npm run test:integration`, needs `TEST_DATABASE_URL`) |
| Unauthorized approval (incl. by the AI) | ✅ `canReview` requires human reviewer; model output cannot set status |
| Unsupported/false claims reaching approved assets | ✅ gates G2–G7b, re-run at approval; export only of approved versions |
| Prompt injection via sources/uploads | ⏳ M4 sources passed as delimited data, system prompt states they are untrusted; output still gated |
| SSRF / arbitrary URL fetching | Not built. No generic fetch endpoint. Sources are entered/curated by humans |
| Confidential data sent to external model | ⏳ M4 classification check; restricted never external unless admin-enabled |
| Secret leakage | API key server-side only; `.env` gitignored · ⏳ M7 log sanitizer |
| Abuse / cost blow-up | ⏳ M5/M7 rate limits, body-size limits, per-run cost cap, bounded concurrency |
| DB privilege abuse | ✅ separate `pmm_app` role with DML only; Postgres bound to 127.0.0.1 |
| Demo switcher in production | ✅ M3 hard-disabled when `NODE_ENV=production`; credentials login only for seeded demo users and only with `DEMO_MODE=true` |
| Session tampering | ✅ M3 sealed (encrypted + signed) HttpOnly, SameSite=Lax cookie (iron-session), `Secure` in production; tenant re-checked against Membership on every request |
| Migration credentials in the app | ✅ M3 app uses `DATABASE_URL` (DML-only role); `MIGRATION_DATABASE_URL` is read only by the Prisma CLI |

## Operational checklist (before any non-local deployment)
- [ ] Replace demo auth with SSO/OIDC; disable `DEMO_MODE`
- [ ] Rotate all default passwords in `docker/` and `.env`
- [ ] TLS, secure/HttpOnly/SameSite cookies, CSP and security headers
- [ ] Data processing agreement with the model provider before enabling external processing of customer data
- [ ] Backups and restore test; audit-log retention policy
- [ ] Dependency audit (`npm audit`), pinned versions
- [ ] Penetration test of tenant isolation
