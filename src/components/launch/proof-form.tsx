"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateLaunchProofAction } from "@/app/actions/launch";
import { actionErrorText } from "@/components/review/action-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Update the proof of a launch (M15): references grow during early access. */
export function LaunchProofForm({ launchId, externalReferences, internalPilot }: { launchId: string; externalReferences: number; internalPilot: boolean }) {
  const router = useRouter();
  const [refs, setRefs] = useState(String(externalReferences));
  const [pilot, setPilot] = useState(internalPilot);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const changed = Number(refs) !== externalReferences || pilot !== internalPilot;
  return (
    <form
      className="flex flex-wrap items-end gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!changed || pending) return;
        setError(null);
        start(async () => {
          const res = await updateLaunchProofAction({ launchId, externalReferences: Number(refs) || 0, internalPilot: pilot });
          if (res.ok) router.refresh();
          else setError(actionErrorText(res));
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lp-refs">External reference customers (documented approval)</Label>
        <Input id="lp-refs" type="number" min={0} max={100} value={refs} onChange={(e) => setRefs(e.target.value)} className="w-32" />
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" checked={pilot} onChange={(e) => setPilot(e.target.checked)} className="size-4 accent-primary" />
        Internal pilot documented
      </label>
      <Button type="submit" variant="outline" disabled={!changed || pending}>
        {pending ? "Saving…" : "Update proof"}
      </Button>
      <span role="status" aria-live="polite" className="text-sm text-destructive">
        {error}
      </span>
    </form>
  );
}
