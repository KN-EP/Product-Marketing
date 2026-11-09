"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createLaunchAction } from "@/app/actions/launch";
import { actionErrorText } from "@/components/review/action-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PHASE_DATE_FIELD, PHASE_LABEL, TIER_LABEL } from "@/domain/launches/launch";
import { LAUNCH_PHASES } from "@/domain/schemas/launch";

type Option = { id: string; label: string };
type Release = Option & { productId: string };

const selectClass =
  "h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/** Launch briefing form (M15). Validation is repeated server-side. */
export function CreateLaunchForm({ products, releases }: { products: Option[]; releases: Release[] }) {
  const router = useRouter();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [releaseId, setReleaseId] = useState("");
  const [name, setName] = useState("");
  const [tier, setTier] = useState("tier_2");
  const [summary, setSummary] = useState("");
  const [pricingModel, setPricingModel] = useState("");
  const [targetSegments, setTargetSegments] = useState("");
  const [dates, setDates] = useState<Record<string, string>>({});
  const [externalReferences, setExternalReferences] = useState("0");
  const [internalPilot, setInternalPilot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ordered = LAUNCH_PHASES.map((p) => dates[PHASE_DATE_FIELD[p]]).filter(Boolean) as string[];
  const inOrder = ordered.every((d, i) => i === 0 || ordered[i - 1]! <= d);
  const valid = productId && name.trim().length >= 3 && summary.trim().length >= 10 && pricingModel.trim().length >= 2 && targetSegments.trim().length >= 2 && ordered.length > 0 && inOrder;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || pending) return;
    setError(null);
    start(async () => {
      const res = await createLaunchAction({
        productId,
        releaseId,
        name: name.trim(),
        tier,
        summary: summary.trim(),
        pricingModel: pricingModel.trim(),
        targetSegments: targetSegments.trim(),
        ...dates,
        externalReferences: Number(externalReferences) || 0,
        internalPilot,
      });
      if (res.ok) router.push(`/launches/${res.data.launchId}`);
      else setError(actionErrorText(res));
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ln-product">Product</Label>
        <select id="ln-product" className={selectClass} value={productId} onChange={(e) => (setProductId(e.target.value), setReleaseId(""))}>
          {products.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ln-release">Release (optional)</Label>
        <select id="ln-release" className={selectClass} value={releaseId} onChange={(e) => setReleaseId(e.target.value)}>
          <option value="">No release</option>
          {releases
            .filter((r) => r.productId === productId)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ln-name">Launch name</Label>
        <Input id="ln-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ln-tier">Tier</Label>
        <select id="ln-tier" className={selectClass} value={tier} onChange={(e) => setTier(e.target.value)}>
          {Object.entries(TIER_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5 md:col-span-2">
        <Label htmlFor="ln-summary">Summary</Label>
        <Textarea id="ln-summary" rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={1000} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ln-pricing">Pricing model</Label>
        <Input id="ln-pricing" value={pricingModel} onChange={(e) => setPricingModel(e.target.value)} placeholder="e.g. Included in premium; module for base" maxLength={200} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ln-segments">Target segments</Label>
        <Input id="ln-segments" value={targetSegments} onChange={(e) => setTargetSegments(e.target.value)} maxLength={200} />
      </div>
      <fieldset className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 md:col-span-2 lg:grid-cols-4">
        <legend className="px-1 text-sm font-medium">Phases — staged launch, dates in order (leave empty to skip a phase)</legend>
        {LAUNCH_PHASES.map((p) => (
          <div key={p} className="flex flex-col gap-1.5">
            <Label htmlFor={`ln-${p}`}>{PHASE_LABEL[p]}</Label>
            <Input id={`ln-${p}`} type="date" value={dates[PHASE_DATE_FIELD[p]] ?? ""} onChange={(e) => setDates((d) => ({ ...d, [PHASE_DATE_FIELD[p]]: e.target.value }))} />
          </div>
        ))}
        {!inOrder ? <p className="text-sm text-destructive sm:col-span-2 lg:col-span-4">Dates must follow early access → GA → existing customers → market.</p> : null}
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ln-refs">External reference customers</Label>
        <Input id="ln-refs" type="number" min={0} max={100} value={externalReferences} onChange={(e) => setExternalReferences(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 self-end text-sm">
        <input type="checkbox" checked={internalPilot} onChange={(e) => setInternalPilot(e.target.checked)} className="size-4 accent-primary" />
        Internal pilot documented (customer zero)
      </label>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <Button type="submit" disabled={!valid || pending}>
          {pending ? "Creating…" : "Plan the launch"}
        </Button>
        <span role="status" aria-live="polite" className="text-sm text-destructive">
          {error}
        </span>
      </div>
    </form>
  );
}
