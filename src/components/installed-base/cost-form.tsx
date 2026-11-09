"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveCostComparisonAction } from "@/app/actions/installed-base";
import { actionErrorText } from "@/components/review/action-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BASIS_LABEL, COST_FIELD_KEYS, COST_FIELDS, InputBasis, SCENARIO_LABEL, type CostField, type ScenarioKind } from "@/domain/installed-base/cost";

type Option = { id: string; label: string };
type Unit = Option & { productId: string };
type Cell = { value: string; basis: string };

const selectClass =
  "h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

const empty = (): Record<CostField, Cell> => Object.fromEntries(COST_FIELD_KEYS.map((k) => [k, { value: k === "investmentEur" ? "0" : "", basis: "customer_input" }])) as Record<CostField, Cell>;

/**
 * Cost-per-part calculator (M18). People enter the inputs and their basis; the
 * server computes the result. Inputs marked "benchmark" or "illustrative" make the
 * result say that it contains assumptions.
 */
export function CostForm({ products, units, preselectUnit }: { products: Option[]; units: Unit[]; preselectUnit?: string }) {
  const router = useRouter();
  const pre = units.find((u) => u.id === preselectUnit);
  const [productId, setProductId] = useState(pre?.productId ?? products[0]?.id ?? "");
  const [unitId, setUnitId] = useState(pre?.id ?? "");
  const [title, setTitle] = useState(pre ? `${pre.label}: retrofit or new machine` : "");
  const [kinds, setKinds] = useState<ScenarioKind[]>(["as_is", "retrofit"]);
  const [cells, setCells] = useState<Record<ScenarioKind, Record<CostField, Cell>>>({ as_is: empty(), retrofit: empty(), new_machine: empty() });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = (k: ScenarioKind, f: CostField, patch: Partial<Cell>) => setCells((c) => ({ ...c, [k]: { ...c[k], [f]: { ...c[k][f], ...patch } } }));
  const filled = kinds.every((k) => COST_FIELD_KEYS.every((f) => cells[k][f].value.trim() !== "" && Number.isFinite(Number(cells[k][f].value.replace(",", ".")))));
  const valid = productId && title.trim().length >= 3 && filled;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || pending) return;
    setError(null);
    start(async () => {
      const res = await saveCostComparisonAction({
        productId,
        unitId,
        title: title.trim(),
        scenarios: kinds.map((k) => ({
          kind: k,
          values: Object.fromEntries(COST_FIELD_KEYS.map((f) => [f, { value: Number(cells[k][f].value.replace(",", ".")), basis: cells[k][f].basis }])),
        })),
      });
      if (res.ok) router.push(`/installed-base/calculator/${res.data.comparisonId}`);
      else setError(actionErrorText(res));
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cc-product">Product</Label>
          <select
            id="cc-product"
            className={selectClass}
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setUnitId("");
            }}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cc-unit">Installed unit (optional)</Label>
          <select id="cc-unit" className={selectClass} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            <option value="">None</option>
            {units
              .filter((u) => u.productId === productId)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cc-title">Title</Label>
          <Input id="cc-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={kinds.includes("new_machine")}
          onChange={(e) => setKinds(e.target.checked ? ["as_is", "retrofit", "new_machine"] : ["as_is", "retrofit"])}
        />
        Also compare with a new machine
      </label>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th scope="col" className="p-2 font-medium">
                Input
              </th>
              {kinds.map((k) => (
                <th key={k} scope="col" className="p-2 font-medium">
                  {SCENARIO_LABEL[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COST_FIELD_KEYS.map((f) => (
              <tr key={f} className="border-b last:border-0">
                <th scope="row" className="p-2 text-left font-normal">
                  {COST_FIELDS[f].label}
                </th>
                {kinds.map((k) => (
                  <td key={k} className="p-2 align-top">
                    <div className="flex flex-col gap-1">
                      <Input
                        aria-label={`${SCENARIO_LABEL[k]} — ${COST_FIELDS[f].label}`}
                        inputMode="decimal"
                        value={cells[k][f].value}
                        onChange={(e) => set(k, f, { value: e.target.value })}
                        className="h-8"
                      />
                      <select
                        aria-label={`${SCENARIO_LABEL[k]} — ${COST_FIELDS[f].label} — basis`}
                        className="h-7 rounded-md border bg-background px-1 text-xs"
                        value={cells[k][f].basis}
                        onChange={(e) => set(k, f, { basis: e.target.value })}
                      >
                        {InputBasis.options.map((b) => (
                          <option key={b} value={b}>
                            {BASIS_LABEL[b]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!valid || pending}>
          {pending ? "Calculating…" : "Calculate and save"}
        </Button>
        {!filled ? <span className="text-sm text-muted-foreground">Fill in every input (0 is a value).</span> : null}
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      </div>
    </form>
  );
}
