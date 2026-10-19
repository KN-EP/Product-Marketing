# Security

> These controls reduce risk; they do not make the system GDPR-compliant or certified.
> Status markers: ✅ implemented · ⏳ planned for the named milestone.

## Threat model (P0)
| Threat | Control |
|---|---|
| Cross-tenant data access via altered ids/params | ✅ domain checks + composite FKs · ⏳ M3 tenant-scoped DAL, 404 on miss, test H |
| Unauthorized approval (incl. by the AI) | ✅ `canReview` requires human reviewer; model output cannot set status |
| Unsupported/false claims reaching approved assets | ✅ gates G2–G7b, re-run at approval; export only of approved versions |
| Prompt injection via sources/uploads | ⏳ M4 sources passed as delimited data, system prompt states they are untrusted; output still gated |
| SSRF / arbitrary URL fetching | Not built. No generic fetch endpoint. Sources are entered/curated by humans |
| Confidential data sent to external model | ⏳ M4 classification check; restricted never external unless admin-enabled |
| Secret leakage | API key server-side only; `.env` gitignored · ⏳ M7 log sanitizer |
| Abuse / cost blow-up | ⏳ M5/M7 rate limits, body-size limits, per-run cost cap, bounded concurrency |
| DB privilege abuse | ✅ separate `pmm_app` role with DML only; Postgres bound to 127.0.0.1 |
| Demo switcher in production | ⏳ M3 hard-disabled when `NODE_ENV=production` |

## Operational checklist (before any non-local deployment)
- [ ] Replace demo auth with SSO/OIDC; disable `DEMO_MODE`
- [ ] Rotate all default passwords in `docker/` and `.env`
- [ ] TLS, secure/HttpOnly/SameSite cookies, CSP and security headers
- [ ] Data processing agreement with the model provider before enabling external processing of customer data
- [ ] Backups and restore test; audit-log retention policy
- [ ] Dependency audit (`npm audit`), pinned versions
- [ ] Penetration test of tenant isolation
