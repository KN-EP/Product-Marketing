import type { z } from "zod";
import { ASSET_SCHEMAS, type AssetType } from "./agents";

/**
 * Postgres jsonb does not keep object key order (it stores shorter keys
 * first), so stored content comes back as e.g. body → format → headline. For
 * reading and export, object keys are put back into the order in which the
 * asset's Zod schema declares them. Keys the schema does not know keep their
 * relative order after the known ones.
 */

type Def = { type?: string; shape?: Record<string, z.ZodType>; element?: z.ZodType; innerType?: z.ZodType };
const def = (s: z.ZodType): Def => (s as unknown as { _zod: { def: Def } })._zod.def;

function collectKeys(schema: z.ZodType, out: string[], seen = new Set<z.ZodType>()): void {
  if (seen.has(schema)) return;
  seen.add(schema);
  const d = def(schema);
  if (d.type === "object" && d.shape) {
    for (const [k, child] of Object.entries(d.shape)) {
      if (!out.includes(k)) out.push(k);
      collectKeys(child, out, seen);
    }
  } else if (d.type === "array" && d.element) {
    collectKeys(d.element, out, seen);
  } else if (d.innerType) {
    collectKeys(d.innerType, out, seen); // optional, default, nullable, …
  }
}

const RANKS = new Map<string, Map<string, number>>();

/** Key → position for one asset type (first declaration wins, depth-first). */
export function keyRanks(assetType: string): Map<string, number> {
  let ranks = RANKS.get(assetType);
  if (!ranks) {
    const keys: string[] = [];
    const schema = ASSET_SCHEMAS[assetType as AssetType];
    if (schema) collectKeys(schema, keys);
    ranks = new Map(keys.map((k, i) => [k, i]));
    RANKS.set(assetType, ranks);
  }
  return ranks;
}

/** Object entries in schema order (stable for unknown keys). */
export function orderedEntries(value: Record<string, unknown>, assetType: string | undefined): [string, unknown][] {
  const entries = Object.entries(value);
  if (!assetType) return entries;
  const ranks = keyRanks(assetType);
  const rank = (k: string) => ranks.get(k) ?? Number.MAX_SAFE_INTEGER;
  return entries.map((e, i) => ({ e, i })).sort((a, b) => rank(a.e[0]) - rank(b.e[0]) || a.i - b.i).map((x) => x.e);
}
