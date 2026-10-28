"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createKpiTreeAction, importKpiCsvAction, updateKpiAction } from "@/app/actions/kpi";
import { actionErrorText } from "@/components/review/action-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { KPI_AGGREGATION_LABEL, KPI_DIRECTION_LABEL, KPI_UNIT_LABEL, sampleCsv } from "@/lib/kpis";

const selectClass =
  "h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export interface EditableKpi {
  id: string;
  name: string;
  funnelStage: string;
  definition: string;
  dataSource: string;
  unit: string;
  direction: string;
  aggregation: string;
  target: number | null;
  baseline: number | null;
}

const toNum = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

/** "Create KPI tree from the approved plan" (only offered when the plan is approved). */
export function CreateKpiTreeButton({ campaignId, planVersion }: { campaignId: string; planVersion: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await createKpiTreeAction(campaignId);
            if (res.ok) router.refresh();
            else setError(actionErrorText(res));
          })
        }
      >
        {pending ? "Creating…" : `Create KPI tree from approved plan v${planVersion}`}
      </Button>
      <span role="status" aria-live="polite" className="text-sm text-destructive">
        {error}
      </span>
    </div>
  );
}

/** One editable KPI row: numeric target and baseline are human decisions (the plan only proposes). */
function KpiRow({ kpi, canEdit }: { kpi: EditableKpi; canEdit: boolean }) {
  const router = useRouter();
  const [target, setTarget] = useState(kpi.target === null ? "" : String(kpi.target));
  const [baseline, setBaseline] = useState(kpi.baseline === null ? "" : String(kpi.baseline));
  const [unit, setUnit] = useState(kpi.unit);
  const [direction, setDirection] = useState(kpi.direction);
  const [aggregation, setAggregation] = useState(kpi.aggregation);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const t = toNum(target);
  const b = toNum(baseline);
  const valid = (t === null || Number.isFinite(t)) && (b === null || Number.isFinite(b));
  const dirty =
    t !== kpi.target || b !== kpi.baseline || unit !== kpi.unit || direction !== kpi.direction || aggregation !== kpi.aggregation;
  const id = `kpi-${kpi.id}`;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || !dirty || pending) return;
    setMsg(null);
    start(async () => {
      const res = await updateKpiAction({ kpiId: kpi.id, target: t, baseline: b, unit, direction, aggregation });
      if (res.ok) {
        setMsg("Saved.");
        router.refresh();
      } else setMsg(actionErrorText(res));
    });
  }

  return (
    <li className="rounded-md border p-3">
      <form onSubmit={save} className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium">{kpi.name}</p>
          <p className="text-xs text-muted-foreground">
            {kpi.funnelStage} · {kpi.definition} · Source: {kpi.dataSource}
          </p>
        </div>
        <fieldset disabled={!canEdit || pending} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-target`} className="text-xs">
              Target
            </Label>
            <Input id={`${id}-target`} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="not set" aria-invalid={t !== null && !Number.isFinite(t)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-baseline`} className="text-xs">
              Baseline
            </Label>
            <Input id={`${id}-baseline`} inputMode="decimal" value={baseline} onChange={(e) => setBaseline(e.target.value)} placeholder="not set" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-unit`} className="text-xs">
              Unit
            </Label>
            <select id={`${id}-unit`} className={selectClass} value={unit} onChange={(e) => setUnit(e.target.value)}>
              {Object.entries(KPI_UNIT_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-direction`} className="text-xs">
              Direction
            </Label>
            <select id={`${id}-direction`} className={selectClass} value={direction} onChange={(e) => setDirection(e.target.value)}>
              {Object.entries(KPI_DIRECTION_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-aggregation`} className="text-xs">
              Aggregation
            </Label>
            <select id={`${id}-aggregation`} className={selectClass} value={aggregation} onChange={(e) => setAggregation(e.target.value)}>
              {Object.entries(KPI_AGGREGATION_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </fieldset>
        {canEdit ? (
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" variant="outline" disabled={!valid || !dirty || pending} aria-label={`Save KPI ${kpi.name}`}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <span role="status" aria-live="polite" className="text-xs text-muted-foreground">
              {msg}
            </span>
          </div>
        ) : null}
      </form>
    </li>
  );
}

export function KpiTreeEditor({ kpis, canEdit }: { kpis: EditableKpi[]; canEdit: boolean }) {
  const stages = [...new Set(kpis.map((k) => k.funnelStage))];
  return (
    <div className="flex flex-col gap-4">
      {stages.map((stage) => (
        <div key={stage} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold capitalize">{stage}</h3>
          <ul className="flex flex-col gap-2">
            {kpis
              .filter((k) => k.funnelStage === stage)
              .map((k) => (
                <KpiRow key={k.id} kpi={k} canEdit={canEdit} />
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** CSV import: file or pasted text → server action. Rejected rows come back with line and reason. */
export function CsvImport({ campaignId, kpiNames, startsOn, today }: { campaignId: string; kpiNames: string[]; startsOn: string | null; today: string }) {
  const router = useRouter();
  const [fileName, setFileName] = useState("pasted.csv");
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [rejected, setRejected] = useState<{ line: number; reason: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setCsv(await f.text());
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!csv.trim() || pending) return;
    setError(null);
    setResult(null);
    setRejected([]);
    start(async () => {
      const res = await importKpiCsvAction({ campaignId, fileName, csv });
      if (res.ok) {
        setResult(`Imported ${res.data.accepted} of ${res.data.rowCount} row(s).`);
        setRejected(res.data.rejected);
        router.refresh();
      } else setError(actionErrorText(res));
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Columns <code>kpi</code>, <code>date</code> (YYYY-MM-DD or DD.MM.YYYY), <code>value</code>; separator “,” or “;”. A value for the same KPI and date
        replaces the earlier one.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="csv-file" className="sr-only">
          CSV file
        </Label>
        <Input id="csv-file" type="file" accept=".csv,text/csv" onChange={onFile} className="max-w-xs" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setFileName("sample-synthetic.csv");
            setCsv(sampleCsv(kpiNames.map((name) => ({ name })), startsOn, today));
          }}
        >
          Fill with synthetic sample data
        </Button>
      </div>
      <Label htmlFor="csv-text">CSV content</Label>
      <Textarea id="csv-text" rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} className="font-mono text-xs" placeholder={"kpi,date,value\n..."} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!csv.trim() || pending}>
          {pending ? "Importing…" : "Import measurements"}
        </Button>
        <span role="status" aria-live="polite" className="text-sm">
          {result}
        </span>
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      </div>
      {rejected.length ? (
        <ul aria-label="Rejected rows" className="list-disc pl-5 text-xs text-destructive">
          {rejected.map((r) => (
            <li key={r.line}>
              Line {r.line}: {r.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
