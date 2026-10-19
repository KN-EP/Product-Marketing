"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createDraftVersionAction } from "@/app/actions/review";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { setAtPath } from "@/lib/content-paths";
import { actionErrorText } from "./action-message";

export interface EditableStatement {
  path: string;
  label: string;
  text: string;
  kind: string;
  refs: string;
}

const KINDS = ["fact", "interpretation", "hypothesis", "suggestion"] as const;

/**
 * Edits statement text and kind only; everything else (references, structure)
 * is kept. Saving always creates a NEW version (human_edit) — the base version
 * is never modified — which then runs through the gates.
 */
export function StructuredEditor({
  assetId,
  baseVersionNumber,
  content,
  statements,
}: {
  assetId: string;
  baseVersionNumber: number;
  content: unknown;
  statements: EditableStatement[];
}) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, { text: string; kind: string }>>(() =>
    Object.fromEntries(statements.map((s) => [s.path, { text: s.text, kind: s.kind }])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const changed = useMemo(
    () => statements.filter((s) => edits[s.path]!.text !== s.text || edits[s.path]!.kind !== s.kind),
    [edits, statements],
  );

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (changed.length === 0 || pending) return;
    let next: unknown = content;
    for (const s of changed) {
      next = setAtPath(next, s.path, "text", edits[s.path]!.text);
      next = setAtPath(next, s.path, "kind", edits[s.path]!.kind);
    }
    setError(null);
    start(async () => {
      const res = await createDraftVersionAction(assetId, next);
      if (res.ok) {
        router.push(`/assets/${assetId}`);
        router.refresh();
      } else setError(actionErrorText(res));
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <ol className="flex flex-col gap-4">
        {statements.map((s, i) => {
          const id = `stmt-edit-${i}`;
          const e = edits[s.path]!;
          const dirty = e.text !== s.text || e.kind !== s.kind;
          return (
            <li key={s.path} className={dirty ? "rounded-md border border-primary/40 p-3" : "rounded-md border p-3"}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={`${id}-text`} className="text-sm">
                  {s.label}
                  {dirty ? <span className="ml-2 text-xs text-muted-foreground">(changed)</span> : null}
                </Label>
                <label className="flex items-center gap-2 text-xs">
                  Kind
                  <select
                    value={e.kind}
                    onChange={(ev) => setEdits((p) => ({ ...p, [s.path]: { ...p[s.path]!, kind: ev.target.value } }))}
                    className="h-8 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Textarea
                id={`${id}-text`}
                className="mt-2"
                rows={2}
                maxLength={2000}
                value={e.text}
                onChange={(ev) => setEdits((p) => ({ ...p, [s.path]: { ...p[s.path]!, text: ev.target.value } }))}
              />
              <p className="mt-1 text-xs text-muted-foreground">References (unchanged): {s.refs || "none"}</p>
            </li>
          );
        })}
      </ol>
      <div className="sticky bottom-0 flex items-center gap-3 border-t bg-background py-3">
        <Button type="submit" disabled={changed.length === 0 || pending}>
          {pending ? "Saving…" : `Save as new version (based on v${baseVersionNumber})`}
        </Button>
        <span className="text-sm text-muted-foreground">{changed.length} statement(s) changed</span>
        <span role="status" aria-live="polite" className="text-sm text-destructive">
          {error}
        </span>
      </div>
    </form>
  );
}
