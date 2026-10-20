import type { Finding } from "@/domain/quality-gates/gates";

export interface FindingGroup {
  gate: Finding["gate"];
  severity: Finding["severity"];
  path: string;
  message: string;
  /** Source the finding is about, parsed from the gate message (null if none). */
  sourceId: string | null;
  count: number;
}

const SOURCE_PATTERNS = [/source reference: ([\w-]+)/i, /stored source ([\w-]+)/i, /\bSource ([\w-]+) is\b/];

export function sourceOfFinding(message: string): string | null {
  for (const re of SOURCE_PATTERNS) {
    const m = re.exec(message);
    if (m) return m[1]!;
  }
  return null;
}

/**
 * Display-only grouping: identical findings for the same (gate, statement
 * path, source) collapse into one line with a count. The stored gate report
 * is never changed — it stays the audit record.
 */
export function groupFindings(findings: readonly Finding[]): FindingGroup[] {
  const groups = new Map<string, FindingGroup>();
  for (const f of findings) {
    const sourceId = sourceOfFinding(f.message);
    const key = [f.gate, f.severity, f.path, sourceId ?? "", f.message].join("\u0000");
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { gate: f.gate, severity: f.severity, path: f.path, message: f.message, sourceId, count: 1 });
  }
  return [...groups.values()];
}

/** Groups items by a key, keeping first-seen order. */
export function groupBy<T>(items: readonly T[], key: (t: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const it of items) m.set(key(it), [...(m.get(key(it)) ?? []), it]);
  return [...m.entries()];
}
