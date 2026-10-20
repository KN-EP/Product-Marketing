"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createDraftVersionAction } from "@/app/actions/review";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { collectStatements } from "@/domain/schemas/agents";
import { humanise, parsePath, setAtPath } from "@/lib/content-paths";
import { actionErrorText } from "./action-message";

const KINDS = ["fact", "interpretation", "hypothesis", "suggestion"] as const;

function labelFor(path: string): string {
  return parsePath(path)
    .map((seg) => (typeof seg === "number" ? `#${seg + 1}` : humanise(seg)))
    .join(" › ");
}

/**
 * Edits statement text and kind on a working copy; references and structure
 * are kept. Nothing is stored until "Save as new version": that creates a NEW
 * human_edit version — the base version is never modified. "Load prepared
 * correction" (demo only) just replaces the working copy; Cancel discards it.
 */
export function StructuredEditor({
  assetId,
  baseVersionNumber,
  content,
  preparedCorrection,
}: {
  assetId: string;
  baseVersionNumber: number;
  content: unknown;
  /** Demo tenant's battlecard only: synthetic fixture used to pre-fill the form. */
  preparedCorrection: unknown | null;
}) {
  const router = useRouter();
  const [working, setWorking] = useState<unknown>(content);
  const [origin, setOrigin] = useState<"human_edit" | "prepared_correction_simulated">("human_edit");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const baseJson = useMemo(() => JSON.stringify(content), [content]);
  const baseStatements = useMemo(() => new Map(collectStatements(content).map((x) => [x.path, x.s])), [content]);
  const statements = useMemo(() => collectStatements(working), [working]);
  const dirty = JSON.stringify(working) !== baseJson;

  const update = (path: string, field: "text" | "kind", value: string) => setWorking((w: unknown) => setAtPath(w, path, field, value));

  function loadPrepared() {
    if (!preparedCorrection) return;
    setWorking(structuredClone(preparedCorrection));
    setOrigin("prepared_correction_simulated");
    setError(null);
    setNotice("Prepared correction loaded into the form. Review it, then save — nothing has been stored yet.");
  }

  function cancel() {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    router.push(`/assets/${assetId}`);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || pending) return;
    setError(null);
    start(async () => {
      const res = await createDraftVersionAction(assetId, working, origin);
      if (res.ok) {
        router.push(`/assets/${assetId}`);
        router.refresh();
      } else setError(actionErrorText(res));
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      {preparedCorrection ? (
        <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
          <p className="text-xs text-muted-foreground">
            Demo only: fills this form with a prepared, synthetic correction. It is not stored until you save; the saved version is a human
            edit and still has to pass the gates and human review.
          </p>
          <div>
            <Button type="button" variant="secondary" onClick={loadPrepared} disabled={pending}>
              Load prepared correction (simulated)
            </Button>
          </div>
        </div>
      ) : null}
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {notice}
      </p>

      <ol className="flex flex-col gap-4">
        {statements.map(({ path, s }, i) => {
          const id = `stmt-edit-${i}`;
          const base = baseStatements.get(path);
          const changed = !base || base.text !== s.text || base.kind !== s.kind;
          const refs = [
            ...s.claimIds.map((c) => `claim:${c}`),
            ...s.evidence.map((e) => `source:${e.sourceId}`),
            ...s.competitorEvidenceIds.map((c) => `competitor-evidence:${c}`),
          ].join(", ");
          return (
            <li key={path} className={changed ? "rounded-md border border-primary/40 p-3" : "rounded-md border p-3"}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={`${id}-text`} className="text-sm">
                  {labelFor(path)}
                  {changed ? <span className="ml-2 text-xs text-muted-foreground">(changed)</span> : null}
                </Label>
                <label className="flex items-center gap-2 text-xs">
                  Kind
                  <select
                    value={s.kind}
                    onChange={(ev) => update(path, "kind", ev.target.value)}
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
                value={s.text}
                onChange={(ev) => update(path, "text", ev.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">References: {refs || "none"}</p>
            </li>
          );
        })}
      </ol>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background py-3">
        <Button type="submit" disabled={!dirty || pending}>
          {pending ? "Saving…" : `Save as new version (based on v${baseVersionNumber})`}
        </Button>
        <Button type="button" variant="outline" onClick={cancel} disabled={pending}>
          Cancel
        </Button>
        <span className="text-sm text-muted-foreground">{dirty ? "Unsaved changes" : "No changes"}</span>
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      </div>
    </form>
  );
}
