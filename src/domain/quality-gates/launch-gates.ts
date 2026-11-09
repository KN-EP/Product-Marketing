import type { LaunchPlan } from "../schemas/launch";
import { failedRequired } from "../launches/launch";
import { PHASE_LABEL } from "../launches/launch";

/**
 * M15 gate for the launch plan. G16 — readiness: a plan may schedule a phase
 * whose computed readiness is no-go (the plan is how the gaps get closed), but
 * the reviewer must see it: one warning per such phase, naming the missing
 * required checks. Duplicate phases are a structural error. The plan never
 * decides go / no-go; people do, on the launch page.
 */
type Add = (gate: "G16_launch_readiness", severity: "critical" | "warning" | "info", path: string, message: string) => void;

export function runLaunchGates(data: LaunchPlan, add: Add): void {
  const seen = new Set<string>();
  data.phases.forEach((p, i) => {
    const path = `$.phases[${i}]`;
    if (seen.has(p.phase)) add("G16_launch_readiness", "critical", path, `Phase ${p.phase} appears twice in the plan`);
    seen.add(p.phase);
    const r = data.readiness.phases.find((x) => x.phase === p.phase);
    if (r && r.status === "no_go") {
      add(
        "G16_launch_readiness",
        "warning",
        path,
        `${PHASE_LABEL[p.phase]} is planned, but its readiness is no-go — missing: ${failedRequired(r)
          .map((c) => c.label)
          .join("; ")}`,
      );
    }
  });
}
