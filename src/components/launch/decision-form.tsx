"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideLaunchPhaseAction } from "@/app/actions/launch";
import { actionErrorText } from "@/components/review/action-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PHASE_LABEL } from "@/domain/launches/launch";
import type { LaunchPhase } from "@/domain/schemas/launch";

const selectClass =
  "h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/** Go / no-go per phase (M15, reviewers). The server recomputes readiness and enforces every rule. */
export function LaunchDecisionForm({ launchId, phases }: { launchId: string; phases: { phase: LaunchPhase; status: string }[] }) {
  const router = useRouter();
  const [phase, setPhase] = useState<LaunchPhase>(phases[0]?.phase ?? "early_access");
  const [decision, setDecision] = useState<"go" | "no_go">("go");
  const [comment, setComment] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const status = phases.find((p) => p.phase === phase)?.status;
  const needsAck = decision === "go" && status === "go_with_risks";
  const needsComment = decision === "no_go" || needsAck;
  const valid = (!needsComment || comment.trim().length >= 10) && (!needsAck || ack);

  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || pending) return;
        setError(null);
        start(async () => {
          const res = await decideLaunchPhaseAction({ launchId, phase, decision, comment, risksAcknowledged: ack });
          if (res.ok) {
            setComment("");
            setAck(false);
            router.refresh();
          } else setError(actionErrorText(res));
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ld-phase">Phase</Label>
        <select id="ld-phase" className={selectClass} value={phase} onChange={(e) => setPhase(e.target.value as LaunchPhase)}>
          {phases.map((p) => (
            <option key={p.phase} value={p.phase}>
              {PHASE_LABEL[p.phase]} — readiness: {p.status.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ld-decision">Decision</Label>
        <select id="ld-decision" className={selectClass} value={decision} onChange={(e) => setDecision(e.target.value as "go" | "no_go")}>
          <option value="go">Go</option>
          <option value="no_go">No-go</option>
        </select>
      </div>
      {decision === "go" && status === "no_go" ? (
        <p className="text-sm text-destructive md:col-span-2">This phase is not ready: a required check fails. A go decision will be refused.</p>
      ) : null}
      <div className="flex flex-col gap-1.5 md:col-span-2">
        <Label htmlFor="ld-comment">Comment{needsComment ? " (required)" : " (optional)"}</Label>
        <Textarea id="ld-comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
      </div>
      {needsAck ? (
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="size-4 accent-primary" />I acknowledge the open recommended checks for this phase.
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <Button type="submit" disabled={!valid || pending}>
          {pending ? "Recording…" : "Record decision"}
        </Button>
        <span role="status" aria-live="polite" className="text-sm text-destructive">
          {error}
        </span>
      </div>
    </form>
  );
}
