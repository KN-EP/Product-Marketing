import { hasRole, type Actor } from "../../domain/actor";
import { ReleaseInput } from "../../domain/releases/release";
import type { Db } from "../db/client";
import { withTenantTx } from "../db/tenant-scope";
import { HttpError } from "../errors";

const day = (d: string | undefined) => (d ? new Date(`${d}T00:00:00Z`) : null);

/**
 * Creates a release briefing (M12, station "Release & update"). Editors only.
 * The tenant comes from the actor; the product id is resolved through the
 * tenant-scoped DAL, so a foreign id ends in 404 exactly like a missing one.
 * Audited with ids, type and counts only (no free text).
 */
export async function createRelease(actor: Actor, db: Db, raw: unknown): Promise<{ releaseId: string }> {
  if (!hasRole(actor, "editor")) throw new HttpError(403, "forbidden", "Editor role required.");
  const parsed = ReleaseInput.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(400, "invalid_input", "Invalid release.", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  const r = parsed.data;
  return withTenantTx(actor, db, async (t) => {
    const product = await t.products.getById(r.productId);
    const { id } = await t.releases.create({
      productId: product.id,
      name: r.name,
      version: r.version,
      type: r.type,
      plannedOn: day(r.plannedOn),
      summary: r.summary,
      changes: r.changes,
      audiences: r.audiences,
      communicationChannels: r.communicationChannels,
      salesChannels: r.salesChannels,
    });
    await t.audit.record({
      actorId: actor.userId,
      action: "release.created",
      entityType: "Release",
      entityId: id,
      metadata: { type: r.type, productId: product.id, changes: r.changes.length, audiences: r.audiences },
    });
    return { releaseId: id };
  });
}
