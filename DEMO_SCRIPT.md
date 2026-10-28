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

**Campaign package (M8–M10, ~10 more minutes)**

12. **/campaigns:** open the seeded campaign "[SYNTHETIC] AI inventory campaign — CISOs DACH"
    (demand generation · CISO · LinkedIn, Email, Webinar, Sales outreach). The briefing is human input.
13. **Generate campaign package:** agent D writes the campaign plan, E the content matrix, F the sales
    play (outreach sequence). The messaging framework approved in step 6 is reused as context.
14. **Campaign plan:** KPI targets are proposals ("To be set by the team"), the AI Act statement needs
    expert acknowledgement.
15. **Content matrix v1:** the webinar headline "Become EU AI Act compliant in 30 days — guaranteed."
    is blocked (fact without claim, absolute promise, regulatory fact without excerpt). Request changes;
    as editor load the prepared correction, save v2, submit; approve with acknowledgement.
16. **Sales play:** every product fact references an approved claim; opt-out handling; no automated
    sending. Optional: create a *retention* campaign → the play lists the customer data it needs.
17. **Export** an approved campaign deliverable as Markdown.

Current state (M10): every step runs in the UI; steps 1–11 and the campaign generation, the blocked content matrix and campaign isolation are covered by the Playwright E2E suite. Before a demo,
run `npm run demo:reset` for a clean state (demo tenants only).
