import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { LlmModeBanner } from "@/components/llm-mode-banner";
import { SyntheticBanner } from "@/components/synthetic-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const actor = await requirePageActor();
  const tdb = tenantDb(actor, getDb());
  const [tenant, counts, assets, claims, sources] = await Promise.all([
    tdb.tenant.get(),
    tdb.counts(),
    tdb.assets.list(),
    tdb.claims.list(),
    tdb.sources.list(),
  ]);

  return (
    <>
      <SyntheticBanner />
      <LlmModeBanner />
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{tenant.name}</h1>
            <p className="text-sm text-muted-foreground">Signed in as {actor.role}</p>
          </div>
          <form action={logoutAction}>
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(["assets", "claims", "sources"] as const).map((k) => (
            <Card key={k}>
              <CardHeader>
                <CardTitle className="capitalize">{k}</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-semibold">{counts[k]}</CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {assets.map((a) => (
                <li key={a.id}>
                  <Link href={`/assets/${a.id}`} className="underline">
                    {a.title}
                  </Link>{" "}
                  <span className="text-sm text-muted-foreground">
                    · {a.type} · {a.state}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Claims</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm">
              {claims.map((c) => (
                <li key={c.id}>
                  {c.text} <span className="text-muted-foreground">· {c.state}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm">
              {sources.map((s) => (
                <li key={s.id}>
                  {s.title} <span className="text-muted-foreground">· {s.status}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
