"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recordInterviewAction } from "@/app/actions/research";
import { toggleIn } from "@/components/campaign/channel-fields";
import { actionErrorText } from "@/components/review/action-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { containsContactData, MAX_NOTES_CHARS, OUTCOME_LABEL, REASON_LABEL } from "@/domain/research/win-loss";

type Option = { id: string; label: string };

const selectClass =
  "h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/** Win/loss interview form (M14). Notes only with granted consent; validation is repeated server-side. */
export function InterviewForm({ products, competitors }: { products: Option[]; competitors: Option[] }) {
  const router = useRouter();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [accountLabel, setAccountLabel] = useState("");
  const [segment, setSegment] = useState("Regulated mid-market");
  const [outcome, setOutcome] = useState("lost");
  const [decidedOn, setDecidedOn] = useState("");
  const [competitorId, setCompetitorId] = useState("");
  const [reasons, setReasons] = useState<string[]>([]);
  const [primaryReason, setPrimaryReason] = useState("");
  const [consentStatus, setConsentStatus] = useState("requested");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const primary = reasons.includes(primaryReason) ? primaryReason : (reasons[0] ?? "");
  const granted = consentStatus === "granted";
  const contactData = containsContactData(accountLabel) || containsContactData(notes);
  const valid =
    productId &&
    accountLabel.trim().length >= 3 &&
    segment.trim().length >= 2 &&
    reasons.length >= 1 &&
    reasons.length <= 5 &&
    !contactData &&
    (!granted || notes.trim().length >= 30);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || pending) return;
    setError(null);
    start(async () => {
      const res = await recordInterviewAction({
        productId,
        accountLabel: accountLabel.trim(),
        segment: segment.trim(),
        outcome,
        decidedOn,
        competitorId,
        reasons,
        primaryReason: primary,
        consentStatus,
        ...(granted ? { notes: notes.trim() } : {}),
      });
      if (res.ok) {
        setAccountLabel("");
        setNotes("");
        setReasons([]);
        router.refresh();
      } else setError(actionErrorText(res));
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wl-product">Product</Label>
        <select id="wl-product" className={selectClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
          {products.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wl-account">Account (pseudonymised — no person, no contact data)</Label>
        <Input id="wl-account" value={accountLabel} onChange={(e) => setAccountLabel(e.target.value)} placeholder="e.g. Mid-sized automotive supplier G" maxLength={120} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wl-segment">Segment</Label>
        <Input id="wl-segment" value={segment} onChange={(e) => setSegment(e.target.value)} maxLength={80} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wl-outcome">Outcome</Label>
          <select id="wl-outcome" className={selectClass} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {Object.entries(OUTCOME_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wl-date">Decided on (optional)</Label>
          <Input id="wl-date" type="date" value={decidedOn} onChange={(e) => setDecidedOn(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wl-competitor">Competitor (optional)</Label>
        <select id="wl-competitor" className={selectClass} value={competitorId} onChange={(e) => setCompetitorId(e.target.value)}>
          <option value="">None / status quo</option>
          {competitors.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wl-consent">Consent to store and use the notes</Label>
        <select id="wl-consent" className={selectClass} value={consentStatus} onChange={(e) => setConsentStatus(e.target.value)}>
          <option value="requested">Requested (no notes stored)</option>
          <option value="granted">Granted</option>
          <option value="declined">Declined (no notes stored)</option>
        </select>
      </div>
      <fieldset className="rounded-lg border p-3 md:col-span-2">
        <legend className="px-1 text-sm font-medium">Reasons ({reasons.length}/5) — same codes as the CRM reason field</legend>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {Object.entries(REASON_LABEL).map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={reasons.includes(v)} onChange={() => setReasons(toggleIn(v))} className="size-4 accent-primary" />
              {l}
            </label>
          ))}
        </div>
        {reasons.length > 1 ? (
          <div className="mt-3 flex flex-col gap-1.5 md:w-1/2">
            <Label htmlFor="wl-primary">Primary reason</Label>
            <select id="wl-primary" className={selectClass} value={primary} onChange={(e) => setPrimaryReason(e.target.value)}>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {REASON_LABEL[r as keyof typeof REASON_LABEL]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </fieldset>
      {granted ? (
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor="wl-notes">Interview notes (stored as a confidential source; quotes in a synthesis must be verbatim excerpts)</Label>
          <Textarea id="wl-notes" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={MAX_NOTES_CHARS} />
        </div>
      ) : null}
      {contactData ? <p className="text-sm text-destructive md:col-span-2">Remove e-mail addresses and phone numbers — pseudonymise the interview.</p> : null}
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <Button type="submit" disabled={!valid || pending}>
          {pending ? "Saving…" : "Record interview"}
        </Button>
        <span role="status" aria-live="polite" className="text-sm text-destructive">
          {error}
        </span>
      </div>
    </form>
  );
}
