"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { decideAction } from "@/app/actions/review";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { actionErrorText } from "./action-message";

type Decision = "approved" | "rejected" | "changes_requested";

const OPTIONS: { value: Decision; label: string }[] = [
  { value: "approved", label: "Approve this version" },
  { value: "changes_requested", label: "Request changes" },
  { value: "rejected", label: "Reject" },
];

/**
 * Reviewer decision on the CURRENT version. Approve is disabled — with the
 * reasons shown — when the live gate re-check fails. A comment is required for
 * reject / request changes. The server re-checks everything regardless.
 */
export function DecisionForm({
  assetId,
  versionId,
  versionNumber,
  requiresExpertReview,
  approveBlockedReasons,
}: {
  assetId: string;
  versionId: string;
  versionNumber: number;
  requiresExpertReview: boolean;
  approveBlockedReasons: string[];
}) {
  const router = useRouter();
  const ids = { reasons: useId(), comment: useId(), ack: useId(), status: useId() };
  const approveBlocked = approveBlockedReasons.length > 0;
  // No pre-selection: the reviewer must choose explicitly.
  const [decision, setDecision] = useState<Decision | null>(null);
  const [comment, setComment] = useState("");
  const [ack, setAck] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const needsComment = decision !== null && decision !== "approved";
  const needsAck = decision === "approved" && requiresExpertReview;
  const canSubmit =
    decision !== null && !pending && (!needsComment || comment.trim().length > 0) && (!needsAck || ack) && !(decision === "approved" && approveBlocked);
  const hint =
    decision === null
      ? "Choose a decision."
      : needsComment && !comment.trim()
        ? "A comment is required for this decision."
        : needsAck && !ack
          ? "Confirm the expert review to approve."
          : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || decision === null) return;
    setMessage(null);
    startTransition(async () => {
      const res = await decideAction({
        assetId,
        versionId,
        decision,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
        ...(needsAck ? { expertReviewAcknowledged: ack } : {}),
      });
      if (res.ok) {
        setMessage({ kind: "ok", text: `Decision recorded: ${decision.replace("_", " ")}.` });
        setComment("");
        setDecision(null);
        router.refresh();
      } else {
        setMessage({ kind: "error", text: actionErrorText(res) });
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-describedby={ids.status}>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Decision on v{versionNumber}</legend>
        {OPTIONS.map((o) => {
          const disabled = o.value === "approved" && approveBlocked;
          return (
            <label key={o.value} className="flex items-center gap-2 text-sm has-[:disabled]:text-muted-foreground">
              <input
                type="radio"
                name="decision"
                value={o.value}
                checked={decision === o.value}
                disabled={disabled}
                aria-describedby={disabled ? ids.reasons : undefined}
                onChange={() => setDecision(o.value)}
                className="size-4 accent-primary"
              />
              {o.label}
            </label>
          );
        })}
        {approveBlocked ? (
          <div id={ids.reasons} className="rounded-md border border-destructive/40 p-2 text-xs text-destructive">
            <p className="font-medium">Approval is not possible:</p>
            <ul className="list-disc pl-4">
              {approveBlockedReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </fieldset>

      {needsAck ? (
        <label htmlFor={ids.ack} className="flex items-start gap-2 text-sm">
          <input id={ids.ack} type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
          <span>
            I confirm that the regulatory / legal statements were checked by a qualified expert.
            <span className="block text-xs text-muted-foreground">Required because the gate report flags regulatory content.</span>
          </span>
        </label>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.comment}>
          Comment {needsComment ? <span className="text-destructive">(required)</span> : <span className="text-muted-foreground">(optional)</span>}
        </Label>
        <Textarea
          id={ids.comment}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          required={needsComment}
          maxLength={4000}
          rows={3}
          placeholder={needsComment ? "What must change, and why?" : ""}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!canSubmit} aria-describedby={hint ? `${ids.status}-hint` : undefined}>
          {pending ? "Saving…" : "Record decision"}
        </Button>
        {hint ? (
          <span id={`${ids.status}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </span>
        ) : null}
        <p id={ids.status} role="status" aria-live="polite" className={message?.kind === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {message?.text}
        </p>
      </div>
    </form>
  );
}
