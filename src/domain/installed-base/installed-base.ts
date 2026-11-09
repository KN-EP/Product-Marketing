import { z } from "zod";
import { splitCsvLine, parseDay, parseValue, CsvFormatError } from "../kpis/csv";
import { containsContactData } from "../research/win-loss";

/**
 * M18 installed base. A machine builder's revenue after the sale lives in the
 * machines already at customers: service contracts, spare parts, retrofits,
 * upgrades, replacement. Everything here is DETERMINISTIC: which unit has which
 * trigger, its score, the suggested offer and the hand-over deadline are computed
 * in code from facts a person imported — never by a model.
 */

export const HandoverOffer = z.enum(["service_contract", "spare_parts", "retrofit", "upgrade", "replacement"]);
export type HandoverOffer = z.infer<typeof HandoverOffer>;
export const OFFER_LABEL: Record<HandoverOffer, string> = {
  service_contract: "Service contract",
  spare_parts: "Spare-parts package",
  retrofit: "Retrofit",
  upgrade: "Upgrade",
  replacement: "Replacement (new machine)",
};

export const HandoverStatus = z.enum(["open", "contacted", "offered", "won", "lost", "no_decision"]);
export type HandoverStatus = z.infer<typeof HandoverStatus>;
export const STATUS_LABEL: Record<HandoverStatus, string> = {
  open: "Open",
  contacted: "Customer contacted",
  offered: "Offer sent",
  won: "Won",
  lost: "Lost",
  no_decision: "No decision",
};
export const CLOSED_STATUSES: readonly HandoverStatus[] = ["won", "lost", "no_decision"];

/** Sales contacts the customer within this many days of the finding. */
export const HANDOVER_SLA_DAYS = 5;

/** Allowed moves. Closing is possible from any open state; nothing reopens. */
const NEXT: Record<HandoverStatus, readonly HandoverStatus[]> = {
  open: ["contacted", "lost", "no_decision"],
  contacted: ["offered", "lost", "no_decision"],
  offered: ["won", "lost", "no_decision"],
  won: [],
  lost: [],
  no_decision: [],
};
export const canMove = (from: HandoverStatus, to: HandoverStatus) => NEXT[from].includes(to);

export interface UnitFacts {
  installedOn: Date | string;
  serviceContract: boolean;
  sparePartOrders12m: number;
  materialChangePlanned: boolean;
  regulatedApplication: boolean;
  lastServiceOn: Date | string | null;
}

export type TriggerId = "age_10y" | "age_20y" | "no_service_contract" | "frequent_spare_parts" | "material_change" | "regulated_application" | "no_service_12m";
export const TRIGGER_LABEL: Record<TriggerId, string> = {
  age_10y: "Older than 10 years",
  age_20y: "Older than 20 years",
  no_service_contract: "No service contract",
  frequent_spare_parts: "Frequent spare-part orders (≥ 3 in 12 months)",
  material_change: "Material change planned",
  regulated_application: "Regulated application",
  no_service_12m: "No service visit in 12 months",
};
const WEIGHT: Record<TriggerId, number> = {
  age_10y: 3,
  age_20y: 2,
  no_service_contract: 2,
  frequent_spare_parts: 2,
  material_change: 2,
  regulated_application: 1,
  no_service_12m: 1,
};
export const FREQUENT_SPARE_PARTS = 3;

const toDay = (d: Date | string) => (typeof d === "string" ? new Date(`${d.slice(0, 10)}T00:00:00Z`) : d);
/** Whole years between two days (UTC). */
export function ageInYears(installedOn: Date | string, today: Date): number {
  const a = toDay(installedOn);
  let years = today.getUTCFullYear() - a.getUTCFullYear();
  if (today.getUTCMonth() < a.getUTCMonth() || (today.getUTCMonth() === a.getUTCMonth() && today.getUTCDate() < a.getUTCDate())) years--;
  return Math.max(0, years);
}

export interface Assessment {
  ageYears: number;
  triggers: TriggerId[];
  score: number;
  suggestedOffer: HandoverOffer;
}

/**
 * Triggers, score and suggested offer of one unit. The offer rule is simple on
 * purpose, so a person can follow it: a planned material change or an old unit
 * that wears → retrofit; very old and worn → replacement; no contract → service
 * contract; otherwise spare parts.
 */
export function assessUnit(u: UnitFacts, today: Date): Assessment {
  const ageYears = ageInYears(u.installedOn, today);
  const t: TriggerId[] = [];
  if (ageYears >= 10) t.push("age_10y");
  if (ageYears >= 20) t.push("age_20y");
  if (!u.serviceContract) t.push("no_service_contract");
  if (u.sparePartOrders12m >= FREQUENT_SPARE_PARTS) t.push("frequent_spare_parts");
  if (u.materialChangePlanned) t.push("material_change");
  if (u.regulatedApplication) t.push("regulated_application");
  const last = u.lastServiceOn ? toDay(u.lastServiceOn) : null;
  if (!last || today.getTime() - last.getTime() > 365 * 86_400_000) t.push("no_service_12m");
  const score = t.reduce((s, id) => s + WEIGHT[id], 0);
  const worn = t.includes("frequent_spare_parts");
  const suggestedOffer: HandoverOffer = t.includes("age_20y") && worn
    ? "replacement"
    : t.includes("material_change") || (t.includes("age_10y") && worn)
      ? "retrofit"
      : !u.serviceContract
        ? "service_contract"
        : "spare_parts";
  return { ageYears, triggers: t, score, suggestedOffer };
}

/** Due day of a hand-over: reported day + SLA (calendar days, UTC). */
export function handoverDueOn(reportedAt: Date, slaDays = HANDOVER_SLA_DAYS): Date {
  return new Date(Date.UTC(reportedAt.getUTCFullYear(), reportedAt.getUTCMonth(), reportedAt.getUTCDate() + slaDays));
}
/** Still open after its due day. */
export function isOverdue(h: { status: HandoverStatus; dueOn: Date | string }, today: Date): boolean {
  const due = toDay(h.dueOn);
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return h.status === "open" && t > due.getTime();
}

const Id = z.string().trim().min(1).max(64);
const NO_CONTACT = "Remove e-mail addresses and phone numbers";

/** A finding from field service (editors). Strict: unknown keys are rejected. */
export const FindingInput = z.strictObject({
  unitId: Id,
  offer: HandoverOffer,
  finding: z.string().trim().min(10).max(1000).refine((s) => !containsContactData(s), NO_CONTACT),
});

/** Moving a hand-over. Closing as lost / no decision needs at least one reason code. */
export const HandoverUpdateInput = z
  .strictObject({
    handoverId: Id,
    status: HandoverStatus,
    reasons: z.array(z.string().trim().min(1).max(40)).max(5).default([]),
    note: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().trim().max(1000).refine((s) => !containsContactData(s), NO_CONTACT).optional()),
  })
  .refine((h) => !["lost", "no_decision"].includes(h.status) || h.reasons.length > 0, { message: "Give at least one reason", path: ["reasons"] });

// ── CSV import ──

export interface UnitRow {
  line: number;
  product: string;
  unitRef: string;
  accountLabel: string;
  region: string;
  application: string;
  installedOn: string;
  serviceContract: boolean;
  sparePartOrders12m: number;
  materialChangePlanned: boolean;
  regulatedApplication: boolean;
  lastServiceOn: string | null;
}
export interface ParsedUnits {
  rowCount: number;
  accepted: UnitRow[];
  rejected: { line: number; reason: string }[];
}

type Col = "product" | "unit" | "account" | "region" | "application" | "installed" | "contract" | "spares" | "material" | "regulated" | "lastService";
const HEADER: Record<string, Col> = {
  product: "product", baureihe: "product", series: "product", model: "product", modell: "product",
  unit: "unit", unit_ref: "unit", serial: "unit", serial_number: "unit", seriennummer: "unit", maschinennummer: "unit", anlage: "unit",
  account: "account", customer: "account", kunde: "account",
  region: "region",
  application: "application", anwendung: "application",
  installed_on: "installed", installed: "installed", installation: "installed", baujahr: "installed", year: "installed", inbetriebnahme: "installed",
  service_contract: "contract", servicevertrag: "contract",
  spare_part_orders_12m: "spares", spare_parts_12m: "spares", ersatzteilbestellungen: "spares", ersatzteile_12m: "spares",
  material_change: "material", materialwechsel: "material",
  regulated: "regulated", reguliert: "regulated",
  last_service: "lastService", last_service_on: "lastService", letzter_service: "lastService",
};
const REQUIRED: Col[] = ["product", "unit", "account", "region", "application", "installed"];

export const UNITS_CSV_LIMITS = { maxBytes: 500 * 1024, maxRows: 10_000 } as const;

/** "ja/nein", "yes/no", "true/false", "1/0", "x/" → boolean; null if unclear. */
export function parseFlag(raw: string): boolean | null {
  const s = raw.trim().toLowerCase();
  if (s === "") return false;
  if (["ja", "j", "yes", "y", "true", "1", "x", "wahr"].includes(s)) return true;
  if (["nein", "n", "no", "false", "0", "falsch", "-"].includes(s)) return false;
  return null;
}
/** A year ("2011") is read as 1 July of that year; full dates as dates. */
export function parseInstalled(raw: string): string | null {
  const s = raw.trim();
  if (/^(19|20)\d{2}$/.test(s)) return `${s}-07-01`;
  return parseDay(s);
}

/** A sample file for the import form (fictional). */
export const SAMPLE_UNITS_CSV = [
  "product;unit;account;region;application;installed;service_contract;spare_part_orders_12m;material_change;regulated;last_service",
  "Series A;A-1001;Packaging manufacturer 1;DACH;Food trays;2011;nein;4;ja;ja;2025-03-14",
  "Series A;A-1002;Packaging manufacturer 2;DACH;Cups;2016;ja;1;nein;ja;2026-06-02",
].join("\n");

/**
 * Parses the installed-base export. Header names in English or German; ";" or ","
 * as separator. The account must be pseudonymised (no e-mail, no phone). Rejected
 * rows are reported by line number and reason only.
 */
export function parseUnitsCsv(text: string, today: Date): ParsedUnits {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.trim() !== "");
  if (headerIdx < 0) throw new CsvFormatError("The file is empty");
  const headerLine = lines[headerIdx]!;
  const sep = headerLine.includes(";") ? ";" : ",";
  const header = splitCsvLine(headerLine, sep).map((h) => HEADER[h.toLowerCase().replace(/[\s-]+/g, "_")]);
  const col = (c: Col) => header.indexOf(c);
  const missing = REQUIRED.filter((c) => col(c) < 0);
  if (missing.length) throw new CsvFormatError(`Header must contain: product, unit, account, region, application, installed (missing: ${missing.join(", ")})`);

  const accepted: UnitRow[] = [];
  const rejected: { line: number; reason: string }[] = [];
  const seen = new Set<string>();
  let rowCount = 0;
  const todayIso = today.toISOString().slice(0, 10);
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.trim() === "") continue;
    rowCount++;
    if (rowCount > UNITS_CSV_LIMITS.maxRows) throw new CsvFormatError(`More than ${UNITS_CSV_LIMITS.maxRows} data rows`);
    const line = i + 1;
    let f: string[];
    try {
      f = splitCsvLine(raw, sep);
    } catch {
      rejected.push({ line, reason: "Unclosed quote" });
      continue;
    }
    const get = (c: Col) => (col(c) >= 0 ? (f[col(c)] ?? "").trim() : "");
    const reject = (reason: string) => rejected.push({ line, reason });
    const product = get("product");
    const unitRef = get("unit");
    const accountLabel = get("account");
    if (!product || !unitRef || !accountLabel || !get("region") || !get("application")) {
      reject("A required field is empty");
      continue;
    }
    if (unitRef.length > 80 || accountLabel.length > 120 || product.length > 120) {
      reject("A field is too long");
      continue;
    }
    if ([accountLabel, get("region"), get("application"), unitRef].some(containsContactData)) {
      reject("Contact data (e-mail or phone) — pseudonymise the account");
      continue;
    }
    const installedOn = parseInstalled(get("installed"));
    if (!installedOn || installedOn > todayIso) {
      reject("Installation date missing, invalid or in the future");
      continue;
    }
    const flags = { contract: parseFlag(get("contract")), material: parseFlag(get("material")), regulated: parseFlag(get("regulated")) };
    if (Object.values(flags).some((v) => v === null)) {
      reject("A yes/no field is not yes or no");
      continue;
    }
    const sparesRaw = get("spares");
    const spares = sparesRaw === "" ? 0 : parseValue(sparesRaw);
    if (spares === null || spares < 0 || !Number.isInteger(spares) || spares > 10_000) {
      reject("Spare-part orders must be a whole number ≥ 0");
      continue;
    }
    const lastRaw = get("lastService");
    const lastServiceOn = lastRaw === "" ? null : parseDay(lastRaw);
    if (lastRaw !== "" && (!lastServiceOn || lastServiceOn > todayIso)) {
      reject("Last service date invalid or in the future");
      continue;
    }
    const key = `${product.toLowerCase()}|${unitRef.toLowerCase()}`;
    if (seen.has(key)) {
      reject("Duplicate unit in this file");
      continue;
    }
    seen.add(key);
    accepted.push({
      line,
      product,
      unitRef,
      accountLabel,
      region: get("region").slice(0, 80),
      application: get("application").slice(0, 120),
      installedOn,
      serviceContract: flags.contract!,
      sparePartOrders12m: spares,
      materialChangePlanned: flags.material!,
      regulatedApplication: flags.regulated!,
      lastServiceOn,
    });
  }
  return { rowCount, accepted, rejected };
}
