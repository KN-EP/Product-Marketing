import { getActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";
import { jsonRoute } from "@/server/http/route";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return jsonRoute(async () => tenantDb(await getActor(), getDb()).claims.getById(id));
}
