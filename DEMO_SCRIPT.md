# Demo script (target, ~15 minutes)

Say up front: *"Everything you see uses synthetic demo data. This is not a DataGuard product and
DataGuard has not reviewed it. Simulated mode replays prepared outputs — nothing is generated live."*

1. **/demo → Select "DataGuard Demo – Unofficial".** Point out the *Simulated* banner.
2. **Context:** AI Governance · CISO · Germany · EU AI Act.
3. **Knowledge:** open a claim; show its source and exact excerpt. Show the pending claim
   "automatically classifies AI systems" — not approved, no evidence.
4. **Competitors:** three placeholders; one approved evidence item.
5. **Run workflow.** It produces **three deliverables**; Agent A’s product intelligence brief is an internal input
   (shown on the run and product page, never reviewed or exported). Show run history: statuses, prompt versions,
   mode, cost (0 in simulated mode).
6. **Messaging Framework:** gates passed; expert review required because the EU AI Act is mentioned.
   Approve with expert acknowledgement.
7. **Battlecard v1:** gates **fail** — unsupported comparison ("better than…") and the pending claim.
   Try to approve → blocked. Request changes with a comment.
8. **Battlecard v2:** as editor, “Create corrected version” → “Load prepared correction (simulated)” fills the form
   (nothing is stored yet) → review → “Save as new version (based on v1)” → submit. As reviewer, choose
   “Approve” explicitly (nothing is pre-selected) → approved.
9. **Regulatory brief:** regulatory facts backed by source excerpts; "do not say" list; approve with ack.
10. **Export** the Messaging Framework as Markdown: version, approver, claim and source references, synthetic label.
11. **Isolation:** switch to the second demo tenant; the DataGuard demo URLs return 404.

Current state (M7): every step runs in the UI and is covered by the Playwright E2E suite. Before a demo,
run `npm run demo:reset` for a clean state (demo tenants only).
