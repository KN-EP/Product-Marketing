import { describe, expect, it } from "vitest";
import { isCredentialsLoginEnabled, isDemoSwitcherEnabled } from "@/server/auth/demo-mode";
import { DUMMY_HASH, hashPassword, verifyPassword } from "@/server/auth/password";

describe("demo mode", () => {
  it("switcher is hard-disabled when NODE_ENV=production, even with DEMO_MODE=true", () => {
    expect(isDemoSwitcherEnabled({ NODE_ENV: "production", DEMO_MODE: "true" })).toBe(false);
  });
  it("switcher requires DEMO_MODE=true outside production", () => {
    expect(isDemoSwitcherEnabled({ NODE_ENV: "development", DEMO_MODE: "true" })).toBe(true);
    expect(isDemoSwitcherEnabled({ NODE_ENV: "development", DEMO_MODE: "false" })).toBe(false);
    expect(isDemoSwitcherEnabled({ NODE_ENV: "development" })).toBe(false);
  });
  it("credentials login requires DEMO_MODE=true", () => {
    expect(isCredentialsLoginEnabled({ DEMO_MODE: "true" })).toBe(true);
    expect(isCredentialsLoginEnabled({})).toBe(false);
  });
});

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
  it("never verifies against the dummy hash or garbage", async () => {
    expect(await verifyPassword("", DUMMY_HASH)).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });
});
