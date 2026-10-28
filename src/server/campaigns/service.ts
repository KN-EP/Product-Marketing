import { hasRole, type Actor } from "../../domain/actor";
import { CampaignInput } from "../../domain/campaigns/campaign";
import type { Db } from "../db/client";
import { withTenantTx } from "../db/tenant-scope";
import { HttpError } from "../errors";

const day = (d: string | undefined) => (d ? new Date(`${d}T00:00:00Z`) : null);

/**
 * Creates a campaign briefing (M8). Editors only. The tenant comes from the
 * actor; product and persona ids are resolved through the tenant-scoped DAL,
 * so a foreign id ends in 404 exactly like a missing one. Audited with ids
 * and the campaign type only (no objective text).
 */
export async function createCampaign(actor: Actor, db: Db, raw: unknown): Promise<{ campaignId: string }> {
  if (!hasRole(actor, "editor")) throw new HttpError(403, "forbidden", "Editor role required.");
  const parsed = CampaignInput.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(400, "invalid_input", "Invalid campaign.", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  const c = parsed.data;
  return withTenantTx(actor, db, async (t) => {
    const [product, persona] = await Promise.all([t.products.getById(c.productId), t.personas.getById(c.personaId)]);
    const { id } = await t.campaigns.create({
      name: c.name,
      type: c.type,
      objective: c.objective,
      productId: product.id,
      personaId: persona.id,
      market: c.market,
      channels: c.channels,
      startsOn: day(c.startsOn),
      endsOn: day(c.endsOn),
      budgetEur: c.budgetEur ?? null,
    });
    await t.audit.record({
      actorId: actor.userId,
      action: "campaign.created",
      entityType: "Campaign",
      entityId: id,
      metadata: { type: c.type, productId: product.id, personaId: persona.id, channels: c.channels.length },
    });
    return { campaignId: id };
  });
}
