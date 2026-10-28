"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startWorkflowAction } from "@/app/actions/workflow";
import { actionErrorText } from "@/components/review/action-message";
import { Button } from "@/components/ui/button";

/** Starts a campaign-scoped run (same validation, idempotency and limits as every run) and opens it. */
export function StartCampaignRunButton({
  kind,
  campaignId,
  label,
  variant = "default",
}: {
  kind: "campaign_gtm" | "campaign_performance";
  campaignId: string;
  label: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function go() {
    if (pending) return;
    setError(null);
    start(async () => {
      // Each click is an intentional new run; double-submits are blocked by `pending`.
      const res = await startWorkflowAction({ kind, campaignId, requestNonce: crypto.randomUUID() });
      if (res.ok) router.push(`/workflows/${res.data.runId}`);
      else setError(actionErrorText(res));
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant={variant} onClick={go} disabled={pending}>
        {pending ? "Starting…" : label}
      </Button>
      <span role="status" aria-live="polite" className="text-sm text-destructive">
        {error}
      </span>
    </div>
  );
}

/** Campaign package (M8–M10). */
export function GenerateCampaignPackageButton({ campaignId, hasRuns }: { campaignId: string; hasRuns: boolean }) {
  return (
    <StartCampaignRunButton
      kind="campaign_gtm"
      campaignId={campaignId}
      label={hasRuns ? "Generate new campaign package" : "Generate campaign package (3 deliverables)"}
    />
  );
}
