"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { markRunFailedAction, retryWorkflowRunAction } from "@/app/actions/workflow";
import { actionErrorText } from "@/components/review/action-message";
import { Button } from "@/components/ui/button";

function ActionButton({
  label,
  pendingLabel,
  variant,
  confirmText,
  run,
}: {
  label: string;
  pendingLabel: string;
  variant?: "default" | "destructive" | "outline";
  confirmText?: string;
  run: () => Promise<{ ok: true } | { ok: false; status: number; error: string; message?: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <Button
        variant={variant}
        disabled={pending}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          start(async () => {
            setError(null);
            const res = await run();
            if (res.ok) router.refresh();
            else setError(actionErrorText(res));
          });
        }}
      >
        {pending ? pendingLabel : label}
      </Button>
      <span role="status" aria-live="polite" className="text-sm text-destructive">
        {error}
      </span>
    </div>
  );
}

export function RetryRunButton({ runId }: { runId: string }) {
  return <ActionButton label="Retry run" pendingLabel="Retrying…" run={() => retryWorkflowRunAction(runId)} />;
}

export function MarkRunFailedButton({ runId }: { runId: string }) {
  return (
    <ActionButton
      label="Mark as failed (stale)"
      pendingLabel="Marking…"
      variant="destructive"
      confirmText="Mark this stale run as failed? This frees its concurrency slot. It can then be retried."
      run={() => markRunFailedAction(runId)}
    />
  );
}

/** Refreshes server data every 2 s while a run is active. */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [active, router]);
  return active ? (
    <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
      Run in progress — this page updates automatically.
    </p>
  ) : null;
}
