"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recordRegulatoryChangeAction } from "@/app/actions/radar";
import { actionErrorText } from "@/components/review/action-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CHANGE_KIND_LABEL } from "@/domain/regulatory/radar";

const selectClass =
  "h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

type Watch = { id: string; name: string; content: string };
type Prepared = { watchId: string; kind: string; summary: string; newDeadline: string; updatedSourceText: string };

/**
 * Record a regulatory change (M16, editors). The new wording replaces the
 * watched source — paste the verified text. In a demo tenant a prepared,
 * synthetic change can be loaded into the form (it is NOT saved until submitted).
 */
export function RecordChangeForm({ watches, prepared }: { watches: Watch[]; prepared: Prepared | null }) {
  const router = useRouter();
  const [watchId, setWatchId] = useState(watches[0]?.id ?? "");
  const [kind, setKind] = useState("deadline_shift");
  const [summary, setSummary] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [text, setText] = useState(watches[0]?.content ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const current = watches.find((w) => w.id === watchId);
  const changed = text.trim() !== (current?.content ?? "").trim();
  const valid = watchId && summary.trim().length >= 10 && text.trim().length >= 20 && changed && (kind !== "deadline_shift" || newDeadline);

  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || pending) return;
        setError(null);
        start(async () => {
          const res = await recordRegulatoryChangeAction({ watchId, kind, summary: summary.trim(), newDeadline, updatedSourceText: text.trim() });
          if (res.ok) {
            setSummary("");
            router.refresh();
          } else setError(actionErrorText(res));
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rc-watch">Watched item</Label>
        <select
          id="rc-watch"
          className={selectClass}
          value={watchId}
          onChange={(e) => {
            setWatchId(e.target.value);
            setText(watches.find((w) => w.id === e.target.value)?.content ?? "");
          }}
        >
          {watches.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rc-kind">Kind of change</Label>
          <select id="rc-kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(CHANGE_KIND_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rc-deadline">New deadline{kind === "deadline_shift" ? "" : " (optional)"}</Label>
          <Input id="rc-deadline" type="date" value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5 md:col-span-2">
        <Label htmlFor="rc-summary">Summary of the change</Label>
        <Input id="rc-summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={1000} />
      </div>
      <div className="flex flex-col gap-1.5 md:col-span-2">
        <Label htmlFor="rc-text">Updated, verified source text (replaces the stored text)</Label>
        <Textarea id="rc-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <Button type="submit" disabled={!valid || pending}>
          {pending ? "Recording…" : "Record change and analyse impact"}
        </Button>
        {prepared ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setWatchId(prepared.watchId);
              setKind(prepared.kind);
              setSummary(prepared.summary);
              setNewDeadline(prepared.newDeadline);
              setText(prepared.updatedSourceText);
            }}
          >
            Load prepared change (simulated)
          </Button>
        ) : null}
        <span role="status" aria-live="polite" className="text-sm text-destructive">
          {error}
        </span>
      </div>
    </form>
  );
}
