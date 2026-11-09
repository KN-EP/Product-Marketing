"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resolveRegulatoryChangeAction } from "@/app/actions/radar";
import { actionErrorText } from "@/components/review/action-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Resolve an open regulatory alert (M16, reviewers). Refused while a claim it made stale is still stale. */
export function ResolveChangeForm({ changeId }: { changeId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (note.trim().length < 10 || pending) return;
        setError(null);
        start(async () => {
          const res = await resolveRegulatoryChangeAction({ changeId, note: note.trim() });
          if (res.ok) router.refresh();
          else setError(actionErrorText(res));
        });
      }}
    >
      <Input aria-label="Resolution note" placeholder="What was re-reviewed (min. 10 characters)" value={note} onChange={(e) => setNote(e.target.value)} className="min-w-64 flex-1" />
      <Button type="submit" size="sm" variant="outline" disabled={note.trim().length < 10 || pending}>
        {pending ? "Resolving…" : "Resolve alert"}
      </Button>
      <span role="status" aria-live="polite" className="w-full text-sm text-destructive">
        {error}
      </span>
    </form>
  );
}
