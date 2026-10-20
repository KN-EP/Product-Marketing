"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/server/db";
import { isCredentialsLoginEnabled, isDemoSwitcherEnabled } from "@/server/auth/demo-mode";
import { authenticateDemoUser, demoIdentityForUser, type LoginIdentity } from "@/server/auth/login";
import { getSession } from "@/server/auth/session";
import { HttpError } from "@/server/errors";
import { enforceRateLimit } from "@/server/http/rate-limit";

/** Best-effort client IP (first X-Forwarded-For hop when behind a proxy). */
async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  } catch {
    return "local";
  }
}

export interface LoginState {
  error?: string;
}

const LoginInput = z.object({
  email: z.string().trim().min(3).max(320),
  password: z.string().min(1).max(512),
});

async function startSession(identity: LoginIdentity): Promise<void> {
  const session = await getSession();
  session.userId = identity.userId;
  session.tenantId = identity.tenantId; // from Membership, never from input
  await session.save();
}

/** Credentials login — seeded demo users only, DEMO_MODE=true only. */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (!isCredentialsLoginEnabled()) return { error: "Login is disabled." };
  const parsed = LoginInput.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Invalid e-mail or password." };
  try {
    enforceRateLimit("login", `${await clientIp()}:${parsed.data.email.toLowerCase()}`);
  } catch (e) {
    if (e instanceof HttpError) return { error: "Too many sign-in attempts. Please wait a few minutes and try again." };
    throw e;
  }
  const identity = await authenticateDemoUser(getDb(), parsed.data.email, parsed.data.password);
  if (!identity) return { error: "Invalid e-mail or password." };
  await startSession(identity);
  redirect("/dashboard");
}

/**
 * Dev-only demo identity switcher. Hard-disabled when NODE_ENV=production.
 * The input selects a demo USER; the tenant is derived from that user's Membership.
 */
export async function switchDemoUserAction(formData: FormData): Promise<void> {
  if (!isDemoSwitcherEnabled()) throw new Error("Demo identity switcher is disabled.");
  const userId = z.string().min(1).max(64).safeParse(formData.get("userId"));
  if (!userId.success) throw new Error("Invalid demo user.");
  const identity = await demoIdentityForUser(getDb(), userId.data);
  if (!identity) throw new Error("Invalid demo user.");
  await startSession(identity);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}
