"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { withdrawConsentAction } from "@/app/actions/research";
import { actionErrorText } from "@/components/review/action-message";
import { Button } from "@/components/ui/button";

/** Withdraw consent (M14): two-step confirm inline — no browser dialog. */
export function WithdrawConsentButton({ interviewId }: { interviewId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!confirming)
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(true)}>
        Withdraw consent
      </Button>
    );
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await withdrawConsentAction(interviewId);
            if (res.ok) router.refresh();
            else setError(actionErrorText(res));
          })
        }
      >
        {pending ? "Erasing…" : "Erase notes"}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
      <span role="status" className="text-xs text-destructive">
        {error}
      </span>
    </span>
  );
}
