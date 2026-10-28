/**
 * KPI measurement import (M11): a small, strict CSV reader. Pure — the server
 * layer checks the byte size, resolves KPI names to ids and stores the rows.
 *
 * Format: a header row with the columns kpi, date and value (aliases: period /
 * period_start / datum, wert), separated by "," or ";". Dates are YYYY-MM-DD
 * or DD.MM.YYYY; values accept "1234.5", "1,234.5", "1.234,5" and "12,5"
 * (one comma without a dot = decimal comma). Rejected rows are reported by
 * line number and reason only — never with the row content.
 */

export const CSV_LIMITS = { maxBytes: 200 * 1024, maxRows: 5000 } as const;

export class CsvFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvFormatError";
  }
}

export interface AcceptedRow {
  line: number;
  kpiName: string;
  periodStart: string;
  value: number;
}
export interface RejectedRow {
  line: number;
  reason: string;
}
export interface ParsedImport {
  rowCount: number;
  accepted: AcceptedRow[];
  rejected: RejectedRow[];
}

/** Splits one CSV line; supports quoted fields with "" escapes. */
export function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (quoted) throw new CsvFormatError("Unclosed quote");
  out.push(cur);
  return out.map((f) => f.trim());
}

const HEADER: Record<string, "kpi" | "date" | "value"> = {
  kpi: "kpi",
  name: "kpi",
  date: "date",
  period: "date",
  period_start: "date",
  datum: "date",
  value: "value",
  wert: "value",
};

/** "2027-01-18" or "18.01.2027" → "2027-01-18"; null when not a real calendar date. */
export function parseDay(s: string): string | null {
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  let iso: string | null = null;
  if (m) iso = `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (m) iso = `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(iso) ? iso : null;
}

/** Locale-tolerant number parsing (see file header); null when ambiguous or invalid. */
export function parseValue(raw: string): number | null {
  const s = raw.replace(/\s/g, "").replace(/%$/, "");
  if (!/^-?[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  let norm: string;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    norm = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    norm = (s.match(/,/g) ?? []).length === 1 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if ((s.match(/\./g) ?? []).length > 1) {
    norm = s.replace(/\./g, "");
  } else norm = s;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parses the CSV and maps KPI names (case-insensitive) to the campaign's KPIs.
 * A (kpi, date) pair that appears twice is rejected on its second line.
 */
export function parseKpiCsv(text: string, kpiNames: readonly string[]): ParsedImport {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.trim() !== "");
  if (headerIdx < 0) throw new CsvFormatError("The file is empty");
  const headerLine = lines[headerIdx]!;
  const sep = headerLine.includes(";") && !headerLine.includes(",") ? ";" : ",";
  const header = splitCsvLine(headerLine, sep).map((h) => HEADER[h.toLowerCase()]);
  const col = (k: "kpi" | "date" | "value") => header.indexOf(k);
  if (col("kpi") < 0 || col("date") < 0 || col("value") < 0) {
    throw new CsvFormatError("Header must contain the columns kpi, date and value");
  }

  const byName = new Map(kpiNames.map((n) => [n.toLowerCase(), n]));
  const seen = new Set<string>();
  const accepted: AcceptedRow[] = [];
  const rejected: RejectedRow[] = [];
  let rowCount = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.trim() === "") continue;
    rowCount++;
    if (rowCount > CSV_LIMITS.maxRows) throw new CsvFormatError(`More than ${CSV_LIMITS.maxRows} data rows`);
    const line = i + 1;
    let f: string[];
    try {
      f = splitCsvLine(raw, sep);
    } catch {
      rejected.push({ line, reason: "Unclosed quote" });
      continue;
    }
    const name = byName.get((f[col("kpi")] ?? "").toLowerCase());
    if (!name) {
      rejected.push({ line, reason: "Unknown KPI (not in this campaign's KPI tree)" });
      continue;
    }
    const day = parseDay(f[col("date")] ?? "");
    if (!day) {
      rejected.push({ line, reason: "Invalid date (use YYYY-MM-DD or DD.MM.YYYY)" });
      continue;
    }
    const value = parseValue(f[col("value")] ?? "");
    if (value === null) {
      rejected.push({ line, reason: "Invalid number" });
      continue;
    }
    const key = `${name.toLowerCase()}|${day}`;
    if (seen.has(key)) {
      rejected.push({ line, reason: "Duplicate KPI and date in this file" });
      continue;
    }
    seen.add(key);
    accepted.push({ line, kpiName: name, periodStart: day, value });
  }
  return { rowCount, accepted, rejected };
}
