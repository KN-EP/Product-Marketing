/**
 * Acceptance test H — tenant isolation against a REAL Postgres (TEST_DATABASE_URL).
 *
 * Only the cookie layer is replaced (an in-memory session jar instead of the
 * sealed cookie). getActor(), Membership lookup, tenantDb(), the route
 * handlers, the page and the server actions all run for real against the DB.
 */
import { randomBytes } from "node:crypto";
import { getAccessFallbackHTTPStatus, isHTTPAccessFallbackError } from "next/dist/client/components/http-access-fallback/http-access-fallback";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({}) as { userId?: string; tenantId?: string });
vi.mock("@/server/auth/session", () => ({
  getSession: async () => {
    const s = {
      userId: jar.userId,
      tenantId: jar.tenantId,
      async save() {
        jar.userId = s.userId;
        jar.tenantId = s.tenantId;
      },
      destroy() {
        delete jar.userId;
        delete jar.tenantId;
      },
    };
    return s;
  },
}));

import { loginAction, switchDemoUserAction } from "@/app/actions/auth";
import { GET as getAssetRoute } from "@/app/api/assets/[id]/route";
import { GET as getClaimRoute } from "@/app/api/claims/[id]/route";
import { GET as getSourceRoute } from "@/app/api/sources/[id]/route";
import AssetPage from "@/app/assets/[id]/page";
import { DEMO_TENANT_ID, OTHER_TENANT_ID } from "@/demo/fixtures";
import type { Role } from "@/domain/actor";
import { getActorOrNull } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { createPrismaClient, type Db } from "@/server/db/client";
import { tenantDb } from "@/server/db/tenant-scope";
import { NotFoundError } from "@/server/errors";
import { SEED_IDS, seed, seedUserEmail } from "../../prisma/seed";

const ROLES: Role[] = ["editor", "reviewer", "admin"];
const PASSWORD = randomBytes(18).toString("base64url");
const KINDS = ["asset", "claim", "source"] as const;
type Kind = (typeof KINDS)[number];

const ROUTES: Record<Kind, typeof getAssetRoute> = {
  asset: getAssetRoute,
  claim: getClaimRoute,
  source: getSourceRoute,
};

const TENANTS = [
  { name: "A (DataGuard Demo)", id: DEMO_TENANT_ID, idx: 0 as const, userPrefix: "usr_demo", other: OTHER_TENANT_ID },
  { name: "B (Other Demo)", id: OTHER_TENANT_ID, idx: 1 as const, userPrefix: "usr_other", other: DEMO_TENANT_ID },
];

let seedDb: Db;

function signInAs(userId: string, tenantId: string) {
  jar.userId = userId;
  jar.tenantId = tenantId;
}

const callRoute = (kind: Kind, id: string) =>
  ROUTES[kind](new Request(`http://localhost/api/${kind}s/${id}`), { params: Promise.resolve({ id }) });

async function pageOutcome(id: string): Promise<{ status: number } | { redirect: true } | { rendered: true }> {
  try {
    await AssetPage({ params: Promise.resolve({ id }) });
    return { rendered: true };
  } catch (e) {
    if (isHTTPAccessFallbackError(e)) return { status: getAccessFallbackHTTPStatus(e) };
    if (isRedirectError(e)) return { redirect: true };
    throw e;
  }
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeAll(async () => {
  seedDb = createPrismaClient(process.env.TEST_DATABASE_URL!);
  await seed(seedDb, { password: PASSWORD });
});

afterAll(async () => {
  await seedDb?.$disconnect();
  await getDb().$disconnect();
});

beforeEach(() => {
  delete jar.userId;
  delete jar.tenantId;
  vi.unstubAllEnvs();
  vi.stubEnv("DEMO_MODE", "true");
});

describe.each(TENANTS)("user of tenant $name requesting the other tenant's ids", (t) => {
  const foreign = SEED_IDS[t.other as keyof typeof SEED_IDS];
  const own = SEED_IDS[t.id as keyof typeof SEED_IDS];

  describe.each(ROLES)("as %s", (role) => {
    beforeEach(() => signInAs(`${t.userPrefix}_${role}`, t.id));

    it("getActor() resolves this user's own tenant and role from Membership", async () => {
      expect(await getActorOrNull()).toEqual({ kind: "human", userId: `${t.userPrefix}_${role}`, tenantId: t.id, role });
    });

    it.each(KINDS)("tenantDb().%ss.getById(foreign id) → NotFoundError", async (kind) => {
      const actor = (await getActorOrNull())!;
      const repo = tenantDb(actor, getDb())[`${kind}s`];
      await expect(repo.getById(foreign[kind])).rejects.toBeInstanceOf(NotFoundError);
    });

    it.each(KINDS)("GET /api/%ss/[foreign id] → 404 without leaking data", async (kind) => {
      const res = await callRoute(kind, foreign[kind]);
      expect(res.status).toBe(404);
      const body = await res.text();
      expect(JSON.parse(body)).toEqual({ error: "not_found" });
      expect(body).not.toContain(foreign[kind]);
    });

    it.each(KINDS)("GET /api/%ss/[own id] → 200 (positive control)", async (kind) => {
      const res = await callRoute(kind, own[kind]);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string; tenantId: string };
      expect(body.id).toBe(own[kind]);
      expect(body.tenantId).toBe(t.id);
    });

    it("/assets/[foreign id] page → 404", async () => {
      expect(await pageOutcome(foreign.asset)).toEqual({ status: 404 });
    });

    it("/assets/[own id] page renders (positive control)", async () => {
      expect(await pageOutcome(own.asset)).toEqual({ rendered: true });
    });
  });
});

describe("no existence leaks and no tenant from input", () => {
  it("a foreign id and a non-existent id produce identical 404 responses", async () => {
    signInAs("usr_other_admin", OTHER_TENANT_ID);
    for (const kind of KINDS) {
      const foreign = await callRoute(kind, SEED_IDS[DEMO_TENANT_ID][kind]);
      const missing = await callRoute(kind, `does_not_exist_${kind}`);
      expect([foreign.status, await foreign.text()]).toEqual([missing.status, await missing.text()]);
    }
  });

  it("unauthenticated: routes → 401, page → redirect to /login", async () => {
    for (const kind of KINDS) expect((await callRoute(kind, SEED_IDS[DEMO_TENANT_ID][kind])).status).toBe(401);
    expect(await pageOutcome(SEED_IDS[DEMO_TENANT_ID].asset)).toEqual({ redirect: true });
  });

  it("a session naming a tenant the user has no Membership in resolves to no actor", async () => {
    signInAs("usr_other_admin", DEMO_TENANT_ID);
    expect(await getActorOrNull()).toBeNull();
    for (const kind of KINDS) expect((await callRoute(kind, SEED_IDS[DEMO_TENANT_ID][kind])).status).toBe(401);
    expect(await pageOutcome(SEED_IDS[DEMO_TENANT_ID].asset)).toEqual({ redirect: true });
  });
});

describe("server actions", () => {
  it("loginAction: tenant B user gets tenant B session; injected tenantId is ignored", async () => {
    const fd = form({ email: seedUserEmail(1, "editor"), password: PASSWORD, tenantId: DEMO_TENANT_ID });
    const err = await loginAction({}, fd).catch((e: unknown) => e);
    expect(isRedirectError(err)).toBe(true);
    expect(jar).toEqual({ userId: "usr_other_editor", tenantId: OTHER_TENANT_ID });
    for (const kind of KINDS) expect((await callRoute(kind, SEED_IDS[DEMO_TENANT_ID][kind])).status).toBe(404);
  });

  it("loginAction: wrong password and unknown user are rejected with the same message", async () => {
    const wrong = await loginAction({}, form({ email: seedUserEmail(1, "editor"), password: "wrong-password" }));
    const unknown = await loginAction({}, form({ email: "nobody@other-demo.example", password: PASSWORD }));
    expect(wrong).toEqual({ error: "Invalid e-mail or password." });
    expect(unknown).toEqual(wrong);
    expect(jar).toEqual({});
  });

  it("loginAction: disabled when DEMO_MODE is not true", async () => {
    vi.stubEnv("DEMO_MODE", "false");
    expect(await loginAction({}, form({ email: seedUserEmail(1, "editor"), password: PASSWORD }))).toEqual({
      error: "Login is disabled.",
    });
    expect(jar).toEqual({});
  });

  it("switchDemoUserAction: tenant derived from Membership; injected tenantId is ignored", async () => {
    const err = await switchDemoUserAction(form({ userId: "usr_other_reviewer", tenantId: DEMO_TENANT_ID })).catch(
      (e: unknown) => e,
    );
    expect(isRedirectError(err)).toBe(true);
    expect(jar).toEqual({ userId: "usr_other_reviewer", tenantId: OTHER_TENANT_ID });
  });

  it("switchDemoUserAction: hard-disabled when NODE_ENV=production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(switchDemoUserAction(form({ userId: "usr_other_reviewer" }))).rejects.toThrow(/disabled/);
    expect(jar).toEqual({});
  });
});
