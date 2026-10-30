"use client";

import { useState } from "react";
import { StartRunButton } from "@/components/campaign/generate-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** M12 station "Use cases & ICP": starts the use case run for one product and market. */
export function UseCaseStart({ productId, defaultMarket, hasMaps }: { productId: string; defaultMarket: string; hasMaps: boolean }) {
  const [market, setMarket] = useState(defaultMarket);
  const ok = market.trim().length >= 2;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="uc-market">Market</Label>
        <Input id="uc-market" value={market} onChange={(e) => setMarket(e.target.value)} maxLength={120} className="w-56" />
      </div>
      <StartRunButton
        input={{ kind: "use_case_definition", productId, market: market.trim() }}
        disabled={!ok}
        variant={hasMaps ? "outline" : "default"}
        label={hasMaps ? "Generate new use case map" : "Define use cases & ICP"}
      />
    </div>
  );
}
