"use client";

import { useState } from "react";
import { StartRunButton } from "@/components/campaign/generate-button";
import { Label } from "@/components/ui/label";
import { ENABLEMENT_CATALOG, PRODUCT_ASSET_TYPES, SALES_TOOLKIT_TYPES, type EnablementType } from "@/domain/schemas/enablement";

/**
 * M13a + M13b: starts the campaign_asset run for one deliverable type. Like the
 * campaign package it needs the approved GTM strategy brief (the server enforces it too).
 */
export function AssetStart({ campaignId, strategyApproved }: { campaignId: string; strategyApproved: boolean }) {
  const [type, setType] = useState<EnablementType>("one_pager");
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="asset-type">Deliverable</Label>
        <select
          id="asset-type"
          value={type}
          onChange={(e) => setType(e.target.value as EnablementType)}
          disabled={!strategyApproved}
          className="h-9 w-72 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <optgroup label="Product & conversion assets">
            {PRODUCT_ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {ENABLEMENT_CATALOG[t].label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Sales toolkit & training">
            {SALES_TOOLKIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ENABLEMENT_CATALOG[t].label}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      <StartRunButton input={{ kind: "campaign_asset", campaignId, deliverableType: type }} disabled={!strategyApproved} variant="outline" label="Generate deliverable" />
    </div>
  );
}
