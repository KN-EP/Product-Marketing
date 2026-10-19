import { switchDemoUserAction } from "@/app/actions/auth";
import { SyntheticBanner } from "@/components/synthetic-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/server/db";
import { isCredentialsLoginEnabled, isDemoSwitcherEnabled } from "@/server/auth/demo-mode";
import { listDemoUsers } from "@/server/auth/login";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const loginEnabled = isCredentialsLoginEnabled();
  const switcher = isDemoSwitcherEnabled() ? await listDemoUsers(getDb()) : null;

  return (
    <>
      <SyntheticBanner />
      <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Seeded demo users only.</CardDescription>
          </CardHeader>
          <CardContent>
            {loginEnabled ? <LoginForm /> : <p className="text-sm">Login is disabled (DEMO_MODE is off).</p>}
          </CardContent>
        </Card>

        {switcher ? (
          <Card>
            <CardHeader>
              <CardTitle>Demo identity switcher</CardTitle>
              <CardDescription>Development only — disabled when NODE_ENV=production.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {switcher.map((m) => (
                <form key={m.user.id} action={switchDemoUserAction}>
                  <input type="hidden" name="userId" value={m.user.id} />
                  <Button type="submit" variant="outline" className="w-full justify-between">
                    <span>{m.tenant.name}</span>
                    <span className="text-muted-foreground">{m.role}</span>
                  </Button>
                </form>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </main>
    </>
  );
}
