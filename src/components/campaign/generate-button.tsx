"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startWorkflowAction } from "@/app/actions/workflow";
import { actionErrorText } from "@/components/review/action-message";
import { Button } from "@/components/ui/button";

/** Starts a campaign_gtm run for this campaign (same validation, idempotency and limits as every run). */
export function GenerateCampaignPackageButton({ campaignId, hasRuns }: { campaignId: string; hasRuns: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function go() {
    if (pending) return;
    setError(null);
    start(async () => {
      const res = await startWorkflowAction({
        kind: "campaign_gtm",
        campaignId,
        // Each click is an intentional new run; double-submits are blocked by `pending`.
        requestNonce: crypto.randomUUID(),
      });
      if (res.ok) router.push(`/workflows/${res.data.runId}`);
      else setError(actionErrorText(res));
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" onClick={go} disabled={pending}>
        {pending ? "Starting…" : hasRuns ? "Generate new campaign package" : "Generate campaign package (3 deliverables)"}
      </Button>
      <span role="status" aria-live="polite" className="text-sm text-destructive">
        {error}
      </span>
    </div>
  );
}
