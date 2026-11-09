import type { LocatedStatement } from "../schemas/agents";
import type { WinLossSynthesis } from "../schemas/research";
import { allowedWinLossNumbers, SMALL_SAMPLE } from "../research/win-loss";
import { unknownNumbers } from "../kpis/analysis";

/**
 * M14 gates for the win/loss synthesis. Supporting controls only: they never
 * verify that an interpretation is right.
 *
 * G15 — numbers: every number a statement quotes must exist in the
 * server-computed stats (counts, shares, win rate, as-of date). Critical for
 * facts, a warning otherwise. Small samples (< 5 consented interviews) are
 * flagged: drivers are hypotheses, not findings.
 */
type Add = (gate: "G15_win_loss_numbers", severity: "critical" | "warning" | "info", path: string, message: string) => void;

export function runResearchGates(data: WinLossSynthesis, statements: LocatedStatement[], add: Add): void {
  const allowed = allowedWinLossNumbers(data.stats, data.asOf);
  for (const { path, s } of statements) {
    const unknown = unknownNumbers(s.text, allowed);
    if (unknown.length) {
      add(
        "G15_win_loss_numbers",
        s.kind === "fact" ? "critical" : "warning",
        path,
        `Number(s) not found in the computed win/loss statistics: ${unknown.slice(0, 5).join(", ")}`,
      );
    }
  }
  if (data.stats.interviews < SMALL_SAMPLE) {
    add(
      "G15_win_loss_numbers",
      "warning",
      "$.stats",
      `Only ${data.stats.interviews} consented interview(s): treat every driver as a hypothesis and do not generalise to the market`,
    );
  }
  const factDrivers = [...data.winDrivers, ...data.lossDrivers].filter((d) => d.statement.kind === "fact" && d.statement.claimIds.length === 0);
  if (factDrivers.length && data.stats.interviews < SMALL_SAMPLE) {
    add("G15_win_loss_numbers", "critical", "$.winDrivers", "A driver from a small sample is stated as fact — label it as interpretation or hypothesis");
  }
}
