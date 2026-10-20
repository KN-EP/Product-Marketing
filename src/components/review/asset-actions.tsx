"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { exportMarkdownAction, submitForReviewAction } from "@/app/actions/review";
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
