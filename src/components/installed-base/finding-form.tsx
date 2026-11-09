"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reportFindingAction } from "@/app/actions/installed-base";
import { actionErrorText } from "@/components/review/action-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HANDOVER_SLA_DAYS, HandoverOffer, OFFER_LABEL } from "@/domain/installed-base/installed-base";
import { containsContactData } from "@/domain/research/win-loss";

const selectClass =
  "h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/** Field service reports a finding; it becomes a hand-over to sales with a deadline (M18). */
export function FindingForm({ unitId, suggestedOffer }: { unitId: string; suggestedOffer: string }) {
  const router = useRouter();
  const [offer, setOffer] = useState(suggestedOffer);
  const [finding, setFinding] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const contact = containsContactData(finding);
  const valid = finding.trim().length >= 10 && !contact;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || pending) return;
    setError(null);
    setMsg(null);
    start(async () => {
      const res = await reportFindingAction({ unitId, offer, finding: finding.trim() });
      if (res.ok) {
        setFinding("");
        setMsg(`Handed over to sales — contact due by ${res.data.dueOn}.`);
        router.refresh();
      } else setError(actionErrorText(res));
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hf-offer">Offer to hand over</Label>
        <select id="hf-offer" className={selectClass} value={offer} onChange={(e) => setOffer(e.target.value)}>
          {HandoverOffer.options.map((o) => (
            <option key={o} value={o}>
              {OFFER_LABEL[o]}
              {o === suggestedOffer ? " (suggested)" : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5 md:col-span-2">
        <Label htmlFor="hf-finding">Finding (what the technician saw — no names, e-mails or phone numbers)</Label>
        <Textarea id="hf-finding" rows={3} value={finding} onChange={(e) => setFinding(e.target.value)} maxLength={1000} />
      </div>
      {contact ? <p className="text-sm text-destructive md:col-span-3">Remove e-mail addresses and phone numbers.</p> : null}
      <div className="flex flex-wrap items-center gap-3 md:col-span-3">
        <Button type="submit" disabled={!valid || pending}>
          {pending ? "Handing over…" : `Hand over to sales (due in ${HANDOVER_SLA_DAYS} days)`}
        </Button>
        <span role="status" aria-live="polite" className="text-sm">
          {msg}
        </span>
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      </div>
    </form>
  );
}
