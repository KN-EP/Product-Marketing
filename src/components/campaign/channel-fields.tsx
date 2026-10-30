"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_CHANNELS, PRESET_COMMUNICATION_CHANNELS, SALES_CHANNEL_LABEL } from "@/lib/campaigns";

/**
 * M12: communication channels (they carry a message) and sales channels (they
 * close a deal or a renewal) are picked separately. Used by the campaign and
 * the release briefing forms.
 */
export function ChannelFields({
  idPrefix,
  preset,
  onTogglePreset,
  other,
  onOther,
  communicationCount,
  sales,
  onToggleSales,
}: {
  idPrefix: string;
  preset: string[];
  onTogglePreset: (c: string) => void;
  other: string;
  onOther: (v: string) => void;
  communicationCount: number;
  sales: string[];
  onToggleSales: (c: string) => void;
}) {
  return (
    <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
      <fieldset className="rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">
          Communication channels ({communicationCount} selected, max. {MAX_CHANNELS})
        </legend>
        <p className="text-xs text-muted-foreground">Where the message reaches the audience.</p>
        <div className="mt-2 flex flex-wrap gap-4">
          {PRESET_COMMUNICATION_CHANNELS.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={preset.includes(c)} onChange={() => onTogglePreset(c)} className="size-4 accent-primary" />
              {c}
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-other`}>Other communication channels (comma-separated)</Label>
          <Input id={`${idPrefix}-other`} value={other} onChange={(e) => onOther(e.target.value)} maxLength={200} placeholder="e.g. Partner newsletter" />
        </div>
      </fieldset>
      <fieldset className="rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Sales channels ({sales.length} selected)</legend>
        <p className="text-xs text-muted-foreground">Who closes the deal or looks after existing customers.</p>
        <div className="mt-2 flex flex-col gap-2">
          {Object.entries(SALES_CHANNEL_LABEL).map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={sales.includes(v)} onChange={() => onToggleSales(v)} className="size-4 accent-primary" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export const toggleIn = (c: string) => (s: string[]) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]);
