"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { importInstalledBaseAction } from "@/app/actions/installed-base";
import { actionErrorText } from "@/components/review/action-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SAMPLE_UNITS_CSV } from "@/domain/installed-base/installed-base";

/** Installed-base import (M18): file or pasted text → server action; rejected rows come back with line and reason. */
export function UnitsImport({ productNames }: { productNames: string[] }) {
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
      const res = await importInstalledBaseAction({ fileName, csv });
      if (res.ok) {
        setResult(`Imported ${res.data.created} new and updated ${res.data.updated} unit(s) from ${res.data.rowCount} row(s).`);
        setRejected(res.data.rejected);
        router.refresh();
      } else setError(actionErrorText(res));
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Required columns <code>product</code>, <code>unit</code>, <code>account</code> (pseudonymised), <code>region</code>, <code>application</code>, <code>installed</code> (year or date).
        Optional: <code>service_contract</code>, <code>spare_part_orders_12m</code>, <code>material_change</code>, <code>regulated</code>, <code>last_service</code>. German headers work too
        (Baureihe, Seriennummer, Kunde, Anwendung, Baujahr, Servicevertrag …). The product must match a product name here. A unit imported again is updated, not duplicated.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="ib-file" className="sr-only">
          CSV file
        </Label>
        <Input id="ib-file" type="file" accept=".csv,text/csv" onChange={onFile} className="max-w-xs" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={productNames.length === 0}
          onClick={() => {
            setFileName("sample-fictional.csv");
            setCsv(SAMPLE_UNITS_CSV.replaceAll("Series A", productNames[0] ?? "Series A"));
          }}
        >
          Fill with a fictional sample
        </Button>
      </div>
      <Label htmlFor="ib-csv">CSV content</Label>
      <Textarea id="ib-csv" rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} className="font-mono text-xs" placeholder={"product;unit;account;region;application;installed\n..."} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!csv.trim() || pending}>
          {pending ? "Importing…" : "Import installed base"}
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
