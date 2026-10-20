"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startWorkflowAction } from "@/app/actions/workflow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actionErrorText } from "@/components/review/action-message";

type Option = { id: string; label: string };

const selectClass =
  "h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/** Start form for the pmm_three_asset run. Options come from the tenant's own records. */
export function StartWorkflowForm({
  products,
  personas,
  triggers,
  competitors,
  defaultMarket,
}: {
  products: Option[];
  personas: Option[];
  triggers: Option[];
  competitors: Option[];
  defaultMarket: string;
}) {
  const router = useRouter();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [personaId, setPersonaId] = useState(personas[0]?.id ?? "");
  const [triggerId, setTriggerId] = useState(triggers[0]?.id ?? "");
  const [market, setMarket] = useState(defaultMarket);
  const [selected, setSelected] = useState<string[]>(competitors.slice(0, 3).map((c) => c.id));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 3 ? [...s, id] : s));
  const valid = productId && personaId && triggerId && market.trim().length >= 2 && selected.length === 3;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || pending) return;
    setError(null);
    start(async () => {
      const res = await startWorkflowAction({
        productId,
        personaId,
        market: market.trim(),
        regulatoryTriggerId: triggerId,
        competitorIds: selected,
        // Each click is an intentional new run; double-submits are blocked by `pending`.
        requestNonce: crypto.randomUUID(),
      });
      if (res.ok) router.push(`/workflows/${res.data.runId}`);
      else setError(actionErrorText(res));
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wf-product">Product</Label>
        <select id="wf-product" className={selectClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
          {products.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wf-persona">Persona</Label>
        <select id="wf-persona" className={selectClass} value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
          {personas.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wf-market">Market</Label>
        <Input id="wf-market" value={market} onChange={(e) => setMarket(e.target.value)} maxLength={120} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wf-trigger">Regulatory trigger</Label>
        <select id="wf-trigger" className={selectClass} value={triggerId} onChange={(e) => setTriggerId(e.target.value)}>
          {triggers.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="md:col-span-2">
        <legend className="text-sm font-medium">Competitors (select exactly 3 — {selected.length} selected)</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {competitors.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                disabled={!selected.includes(c.id) && selected.length >= 3}
                onChange={() => toggle(c.id)}
                className="size-4 accent-primary"
              />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-3 md:col-span-2">
        <Button type="submit" disabled={!valid || pending}>
          {pending ? "Starting…" : "Start workflow (3 deliverables)"}
        </Button>
        <span role="status" aria-live="polite" className="text-sm text-destructive">
          {error}
        </span>
      </div>
    </form>
  );
}
