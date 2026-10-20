import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { NavShell } from "@/components/app/nav";
import { LlmModeBanner } from "@/components/llm-mode-banner";
import { SyntheticBanner } from "@/components/synthetic-banner";
import { Button } from "@/components/ui/button";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";

export const dynamic = "force-dynamic";

/**
 * Shell for every signed-in page: persistent banners, navigation, identity.
 * Pages still resolve the actor themselves — a layout is not an auth boundary.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor();
  const tdb = tenantDb(actor, getDb());
  const [tenant, names] = await Promise.all([tdb.tenant.get(), tdb.memberNames([actor.userId!])]);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <div className="z-40 md:sticky md:top-0">
        {tenant.isDemo ? <SyntheticBanner tenantName={tenant.name} /> : null}
        <LlmModeBanner />
      </div>
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="relative border-b bg-sidebar px-3 py-3 md:w-56 md:shrink-0 md:border-r md:border-b-0 md:py-4">
          <div className="mb-2 px-2 md:mb-4">
            <Link href="/dashboard" className="text-sm font-semibold">
              Product Marketing OS
            </Link>
            <p className="mt-1 truncate pr-20 text-xs text-muted-foreground md:pr-0" title={tenant.name}>
              {tenant.name}
            </p>
          </div>
          <NavShell
            footer={
              <div className="mt-6 border-t px-2 pt-4 text-xs text-muted-foreground">
                <p>{names.get(actor.userId!) ?? "Signed in"}</p>
                <p>Role: {actor.role}</p>
                <form action={logoutAction} className="mt-2">
                  <Button type="submit" variant="outline" size="sm">
                    Sign out
                  </Button>
                </form>
              </div>
            }
          />
        </aside>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 outline-none md:px-8">
          <div className="mx-auto flex max-w-6xl flex-col gap-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
