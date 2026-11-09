"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCampaignAction } from "@/app/actions/campaign";
import { actionErrorText } from "@/components/review/action-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChannelFields, toggleIn } from "@/components/campaign/channel-fields";
import { MAX_CHANNELS, parseChannels } from "@/lib/campaigns";
import { CAMPAIGN_TYPE_LABEL } from "@/lib/format";

type Option = { id: string; label: string };

const selectClass =
  "h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/** Campaign briefing form (M8; M12: communication and sales channels apart). Options come from the tenant's own records; validation is repeated server-side. */
export function CreateCampaignForm({ products, personas, defaultMarket }: { products: Option[]; personas: Option[]; defaultMarket: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("demand_generation");
  const [objective, setObjective] = useState("");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [personaId, setPersonaId] = useState(personas[0]?.id ?? "");
  const [market, setMarket] = useState(defaultMarket);
  const [preset, setPreset] = useState<string[]>(["LinkedIn", "Email", "Webinar"]);
  const [other, setOther] = useState("");
  const [sales, setSales] = useState<string[]>(["direct_sales"]);
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [budget, setBudget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const channels = parseChannels(preset, other);

  const datesOk = !startsOn || !endsOn || endsOn >= startsOn;
  const valid =
    name.trim().length >= 3 &&
    objective.trim().length >= 10 &&
    productId &&
    personaId &&
    market.trim().length >= 2 &&
    channels.length + sales.length >= 1 &&
    channels.length <= MAX_CHANNELS &&
    datesOk;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || pending) return;
    setError(null);
    start(async () => {
      const res = await createCampaignAction({
        name: name.trim(),
        type,
        objective: objective.trim(),
        productId,
        personaId,
        market: market.trim(),
        communicationChannels: channels,
        salesChannels: sales,
        startsOn,
        endsOn,
        budgetEur: budget.trim() === "" ? undefined : Number(budget),
      });
      if (res.ok) router.push(`/campaigns/${res.data.campaignId}`);
      else setError(actionErrorText(res));
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cp-name">Campaign name</Label>
        <Input id="cp-name" value={name} onChange={(e) => setName(e.target.value)} minLength={3} maxLength={120} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cp-type">Campaign type</Label>
        <select id="cp-type" className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(CAMPAIGN_TYPE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5 md:col-span-2">
        <Label htmlFor="cp-objective">Objective</Label>
        <Textarea
          id="cp-objective"
          rows={3}
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          minLength={10}
          maxLength={1000}
          placeholder="What should this campaign change, for whom? (no targets needed — the plan proposes KPIs)"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cp-product">Product</Label>
        <select id="cp-product" className={selectClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
          {products.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cp-persona">Persona</Label>
        <select id="cp-persona" className={selectClass} value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
          {personas.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cp-market">Market</Label>
        <Input id="cp-market" value={market} onChange={(e) => setMarket(e.target.value)} maxLength={120} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cp-budget">Budget in EUR (optional)</Label>
        <Input id="cp-budget" type="number" inputMode="decimal" min={0} max={10_000_000} step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cp-start">Start (optional)</Label>
        <Input id="cp-start" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cp-end">End (optional)</Label>
        <Input id="cp-end" type="date" value={endsOn} min={startsOn || undefined} onChange={(e) => setEndsOn(e.target.value)} aria-invalid={!datesOk} />
      </div>
      <ChannelFields
        idPrefix="cp"
        preset={preset}
        onTogglePreset={(c) => setPreset(toggleIn(c))}
        other={other}
        onOther={setOther}
        communicationCount={channels.length}
        sales={sales}
        onToggleSales={(c) => setSales(toggleIn(c))}
      />
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <Button type="submit" disabled={!valid || pending}>
          {pending ? "Creating…" : "Create campaign"}
        </Button>
        {!datesOk ? <span className="text-sm text-destructive">The end date must not be before the start date.</span> : null}
        <span role="status" aria-live="polite" className="text-sm text-destructive">
          {error}
        </span>
      </div>
    </form>
  );
}
