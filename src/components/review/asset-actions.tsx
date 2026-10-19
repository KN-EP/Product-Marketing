"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { exportMarkdownAction, loadPreparedCorrectionAction, submitForReviewAction } from "@/app/actions/review";
import { Button } from "@/components/ui/button";
import { actionErrorText } from "./action-message";

function useActionButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return { router, pending, start, error, setError };
}

export function SubmitForReviewButton({ assetId }: { assetId: string }) {
  const { router, pending, start, error, setError } = useActionButton();
  return (
    <div className="flex items-center gap-2">
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await submitForReviewAction(assetId);
            if (res.ok) router.refresh();
            else setError(actionErrorText(res));
          })
        }
      >
        {pending ? "Submitting…" : "Submit for review"}
      </Button>
      <span role="status" aria-live="polite" className="text-sm text-destructive">
        {error}
      </span>
    </div>
  );
}

/** Downloads the latest APPROVED version as Markdown (the server refuses anything else). */
export function ExportMarkdownButton({ assetId, versionNumber, fileStem }: { assetId: string; versionNumber: number; fileStem: string }) {
  const { pending, start, error, setError } = useActionButton();
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await exportMarkdownAction(assetId);
            if (!res.ok) return setError(actionErrorText(res));
            const url = URL.createObjectURL(new Blob([res.data.markdown], { type: "text/markdown;charset=utf-8" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = `${fileStem}-v${versionNumber}.md`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          })
        }
      >
        {pending ? "Preparing…" : `Download approved v${versionNumber} (Markdown)`}
      </Button>
      <span role="status" aria-live="polite" className="text-sm text-destructive">
        {error}
      </span>
    </div>
  );
}

/** Demo tenant only. Clearly labelled: the correction is a prepared synthetic fixture, applied as a human edit. */
export function LoadPreparedCorrectionButton({ assetId }: { assetId: string }) {
  const { router, pending, start, error, setError } = useActionButton();
  return (
    <div className="flex flex-col gap-1 rounded-md border border-dashed p-3">
      <p className="text-xs text-muted-foreground">
        Demo only: creates a new version from a prepared, synthetic correction. It is recorded as a human edit and still has to pass the
        gates and human review.
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await loadPreparedCorrectionAction(assetId);
              if (res.ok) {
                router.push(`/assets/${assetId}`);
                router.refresh();
              } else setError(actionErrorText(res));
            })
          }
        >
          {pending ? "Loading…" : "Load prepared correction (simulated)"}
        </Button>
        <span role="status" aria-live="polite" className="text-sm text-destructive">
          {error}
        </span>
      </div>
    </div>
  );
}
