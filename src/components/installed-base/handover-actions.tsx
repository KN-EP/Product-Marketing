"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateHandoverAction } from "@/app/actions/installed-base";
import { actionErrorText } from "@/components/review/action-message";
import { Button } from "@/components/ui/button";
import { REASON_LABEL } from "@/domain/research/win-loss";

const NEXT: Record<string, { to: string; label: string }[]> = {
  open: [{ to: "contacted", label: "Customer contacted" }],
  contacted: [{ to: "offered", label: "Offer sent" }],
  offered: [{ to: "won", label: "Won" }],
};
const CLOSE = [
  { to: "lost", label: "Lost" },
  { to: "no_decision", label: "No decision" },
];

/** Moves one hand-over; closing asks for reason codes of the tenant's industry profile (M18). */
export function HandoverActions({ handoverId, status, reasonCodes }: { handoverId: string; status: string; reasonCodes: readonly string[] }) {
  const router = useRouter();
  const [closing, setClosing] = useState<string | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (["won", "lost", "no_decision"].includes(status)) return null;

  function move(to: string, rs: string[] = []) {
    setError(null);
    start(async () => {
      const res = await updateHandoverAction({ handoverId, status: to, reasons: rs });
      if (res.ok) {
        setClosing(null);
        setReasons([]);
        router.refresh();
      } else setError(actionErrorText(res));
    });
  }
  const options = [...(NEXT[status] ?? []), ...CLOSE];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Button
            key={o.to}
            type="button"
            size="sm"
            variant={o.to === "lost" || o.to === "no_decision" ? "outline" : "default"}
            disabled={pending}
            onClick={() => (o.to === "won" || o.to === "lost" || o.to === "no_decision" ? setClosing(o.to) : move(o.to))}
          >
            {o.label}
          </Button>
        ))}
      </div>
      {closing ? (
        <fieldset className="rounded-md border p-2">
          <legend className="px-1 text-xs font-medium">Why? ({reasons.length}/5){closing === "won" ? " — optional" : ""}</legend>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {reasonCodes.map((r) => (
              <label key={r} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  className="size-3.5 accent-primary"
                  checked={reasons.includes(r)}
                  onChange={() => setReasons((xs) => (xs.includes(r) ? xs.filter((x) => x !== r) : xs.length < 5 ? [...xs, r] : xs))}
                />
                {REASON_LABEL[r as keyof typeof REASON_LABEL] ?? r}
              </label>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" disabled={pending || (closing !== "won" && reasons.length === 0)} onClick={() => move(closing, reasons)}>
              Close as {closing === "no_decision" ? "no decision" : closing}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setClosing(null)}>
              Cancel
            </Button>
          </div>
        </fieldset>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
