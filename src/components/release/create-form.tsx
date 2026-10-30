"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createReleaseAction } from "@/app/actions/release";
import { ChannelFields, toggleIn } from "@/components/campaign/channel-fields";
import { actionErrorText } from "@/components/review/action-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_RELEASE_CHANGES, RELEASE_AUDIENCE_LABEL, RELEASE_TYPE_LABEL } from "@/domain/releases/release";
import { MAX_CHANNELS, parseChannels } from "@/lib/campaigns";

type Option = { id: string; label: string };

const selectClass =
  "h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/** Release briefing form (M12, station "Release & update"). Validation is repeated server-side. */
export function CreateReleaseForm({ products }: { products: Option[] }) {
  const router = useRouter();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [type, setType] = useState("feature_update");
  const [plannedOn, setPlannedOn] = useState("");
  const [summary, setSummary] = useState("");
  const [changesText, setChangesText] = useState("");
  const [audiences, setAudiences] = useState<string[]>(["internal_sales", "internal_support", "existing_customers"]);
  const [preset, setPreset] = useState<string[]>(["Email"]);
  const [other, setOther] = useState("");
  const [sales, setSales] = useState<string[]>(["customer_success"]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const changes = changesText
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
  const channels = parseChannels(preset, other);
  const valid =
    productId &&
    name.trim().length >= 3 &&
    version.trim().length >= 1 &&
    summary.trim().length >= 10 &&
    changes.length >= 1 &&
    changes.length <= MAX_RELEASE_CHANGES &&
    audiences.length >= 1 &&
    channels.length + sales.length >= 1 &&
    channels.length <= MAX_CHANNELS;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || pending) return;
    setError(null);
    start(async () => {
      const res = await createReleaseAction({
        productId,
        name: name.trim(),
        version: version.trim(),
        type,
        plannedOn,
        summary: summary.trim(),
        changes,
        audiences,
        communicationChannels: channels,
        salesChannels: sales,
      });
      if (res.ok) router.push(`/releases/${res.data.releaseId}`);
      else setError(actionErrorText(res));
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rl-product">Product</Label>
        <select id="rl-product" className={selectClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
          {products.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rl-type">Release type</Label>
        <select id="rl-type" className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(RELEASE_TYPE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rl-name">Release name</Label>
        <Input id="rl-name" value={name} onChange={(e) => setName(e.target.value)} minLength={3} maxLength={120} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rl-version">Version</Label>
          <Input id="rl-version" value={version} onChange={(e) => setVersion(e.target.value)} maxLength={40} placeholder="e.g. 2.4" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rl-date">Planned date (optional)</Label>
          <Input id="rl-date" type="date" value={plannedOn} onChange={(e) => setPlannedOn(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5 md:col-span-2">
        <Label htmlFor="rl-summary">Summary</Label>
        <Textarea id="rl-summary" rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} minLength={10} maxLength={1000} required />
      </div>
      <div className="flex flex-col gap-1.5 md:col-span-2">
        <Label htmlFor="rl-changes">
          Changes (one per line, max. {MAX_RELEASE_CHANGES}) — planned changes are not product facts until a claim is approved
        </Label>
        <Textarea id="rl-changes" rows={4} value={changesText} onChange={(e) => setChangesText(e.target.value)} placeholder={"Owner reminders for due reviews\nBulk export of documentation packs"} />
      </div>
      <fieldset className="rounded-lg border p-3 md:col-span-2">
        <legend className="px-1 text-sm font-medium">Audiences ({audiences.length} selected)</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {Object.entries(RELEASE_AUDIENCE_LABEL).map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={audiences.includes(v)} onChange={() => setAudiences(toggleIn(v))} className="size-4 accent-primary" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <ChannelFields
        idPrefix="rl"
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
          {pending ? "Creating…" : "Add release to the plan"}
        </Button>
        <span role="status" aria-live="polite" className="text-sm text-destructive">
          {error}
        </span>
      </div>
    </form>
  );
}
