/**
 * Statement paths use the same format as collectStatements() and the gate
 * findings: "$", ".key" for object keys, "[i]" for array indices,
 * e.g. "$.pillars[0].proofPoints[1]".
 */
export type PathSegment = string | number;

export function parsePath(path: string): PathSegment[] {
  if (!path.startsWith("$")) throw new Error(`Invalid path: ${path}`);
  const out: PathSegment[] = [];
  const re = /\.([A-Za-z_$][\w$]*)|\[(\d+)\]/g;
  let pos = 1;
  for (let m = re.exec(path); m; m = re.exec(path)) {
    if (m.index !== pos) throw new Error(`Invalid path: ${path}`);
    out.push(m[1] !== undefined ? m[1] : Number(m[2]));
    pos = re.lastIndex;
  }
  if (pos !== path.length) throw new Error(`Invalid path: ${path}`);
  return out;
}

export function childPath(parent: string, key: string | number): string {
  return typeof key === "number" ? `${parent}[${key}]` : `${parent}.${key}`;
}

/** Stable, URL-safe DOM id for a statement path. */
export function statementAnchor(path: string): string {
  return `stmt${path.replace(/^\$/, "").replace(/[^A-Za-z0-9]+/g, "-")}`.replace(/-+$/, "");
}

/** Returns a deep copy of `root` with `field` of the object at `path` set to `value`. */
export function setAtPath<T>(root: T, path: string, field: string, value: unknown): T {
  const copy = structuredClone(root);
  let node: unknown = copy;
  for (const seg of parsePath(path)) {
    if (node === null || typeof node !== "object") throw new Error(`Path not found: ${path}`);
    node = (node as Record<string | number, unknown>)[seg];
  }
  if (node === null || typeof node !== "object" || Array.isArray(node)) throw new Error(`Path not found: ${path}`);
  (node as Record<string, unknown>)[field] = value;
  return copy;
}

/** "positioningStatement" → "Positioning statement" */
export function humanise(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}
