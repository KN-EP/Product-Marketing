"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startWorkflowAction } from "@/app/actions/workflow";
import { actionErrorText } from "@/components/review/action-message";
import { Button } from "@/components/ui/button";

type RunStart =
  | { kind: "campaign_gtm" | "campaign_performance" | "campaign_strategy"; campaignId: string }
  | { kind: "release_communication"; releaseId: string }
  | { kind: "use_case_definition"; productId: string; market: string };

/** Starts a record-scoped run (same validation, idempotency and limits as every run) and opens it. */
export function StartRunButton({
  input,
  label,
  variant = "default",
  disabled = false,
}: {
  input: RunStart;
  label: string;
  variant?: "default" | "outline";
  disabled?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function go() {
    if (pending) return;
    setError(null);
    start(async () => {
      // Each click is an intentional new run; double-submits are blocked by `pending`.
      const res = await startWorkflowAction({ ...input, requestNonce: crypto.randomUUID() });
      if (res.ok) router.push(`/workflows/${res.data.runId}`);
      else setError(actionErrorText(res));
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant={variant} onClick={go} disabled={pending || disabled}>
        {pending ? "Starting…" : label}
      </Button>
      <span role="status" aria-live="polite" className="text-sm text-destructive">
        {error}
      </span>
    </div>
  );
}

/** Campaign-scoped run (M8–M11). */
export function StartCampaignRunButton({
  kind,
  campaignId,
  label,
  variant,
  disabled,
}: {
  kind: "campaign_gtm" | "campaign_performance" | "campaign_strategy";
  campaignId: string;
  label: string;
  variant?: "default" | "outline";
  disabled?: boolean;
}) {
  return <StartRunButton input={{ kind, campaignId }} label={label} variant={variant} disabled={disabled} />;
}

/** Campaign package (M8–M10). Since M12 only enabled once the GTM strategy brief is approved (the server enforces it too). */
export function GenerateCampaignPackageButton({ campaignId, hasRuns, strategyApproved }: { campaignId: string; hasRuns: boolean; strategyApproved: boolean }) {
  return (
    <StartCampaignRunButton
      kind="campaign_gtm"
      campaignId={campaignId}
      disabled={!strategyApproved}
      label={hasRuns ? "Generate new campaign package" : "Generate campaign package (3 deliverables)"}
    />
  );
}

/** M12: GTM strategy brief — the first, strategic step of every campaign. */
export function GenerateStrategyButton({ campaignId, hasStrategy }: { campaignId: string; hasStrategy: boolean }) {
  return (
    <StartCampaignRunButton
      kind="campaign_strategy"
      campaignId={campaignId}
      variant={hasStrategy ? "outline" : "default"}
      label={hasStrategy ? "Generate new strategy brief" : "Generate GTM strategy brief"}
    />
  );
}
