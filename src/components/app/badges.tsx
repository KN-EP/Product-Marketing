import { Badge } from "@/components/ui/badge";

type Variant = "default" | "secondary" | "destructive" | "outline";

const STATE_VARIANT: Record<string, Variant> = {
  approved: "default",
  completed: "default",
  active: "secondary",
  pending_review: "secondary",
  queued: "secondary",
  running: "secondary",
  validation: "secondary",
  created: "outline",
  draft: "outline",
  changes_requested: "outline",
  rejected: "destructive",
  failed: "destructive",
  stale: "destructive",
  invalid: "destructive",
  changed: "outline",
  archived: "outline",
};

const human = (s: string) => s.replace(/_/g, " ");

/** Workflow, asset, claim and source states. Text always present (not colour-only). */
export function StateBadge({ state }: { state: string }) {
  return <Badge variant={STATE_VARIANT[state] ?? "outline"}>{human(state)}</Badge>;
}

export function ModeBadge({ mode, label }: { mode: string; label?: string }) {
  const text = label ?? (mode === "simulated" ? "Simulated" : mode === "human_edit" ? "Human-edited" : "Live model");
  return <Badge variant={mode === "live" ? "default" : "outline"}>{text}</Badge>;
}

const KIND_LABEL: Record<string, string> = {
  fact: "FACT",
  interpretation: "INTERPRETATION",
  hypothesis: "HYPOTHESIS",
  suggestion: "SUGGESTION",
};

export function KindBadge({ kind }: { kind: string }) {
  return (
    <Badge variant={kind === "fact" ? "default" : "outline"} className="font-mono text-[0.7rem] tracking-wide">
      {KIND_LABEL[kind] ?? kind.toUpperCase()}
    </Badge>
  );
}

export function GatesBadge({ passed }: { passed: boolean }) {
  return <Badge variant={passed ? "secondary" : "destructive"}>{passed ? "Gates passed" : "Gates failed"}</Badge>;
}

export function SyntheticTag() {
  return <Badge variant="outline">synthetic</Badge>;
}
