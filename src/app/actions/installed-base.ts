"use server";

import { getDb } from "@/server/db";
import { runAction } from "@/server/http/action";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { importInstalledBase, reportFinding, saveCostComparison, setIndustryProfile, updateHandover } from "@/server/installed-base/service";

/** Import the installed base (CSV, editors, M18). */
export async function importInstalledBaseAction(input: unknown) {
  return runAction((actor) => {
    enforceRateLimit("installedBaseWrite", `${actor.tenantId}:${actor.userId}`);
    return importInstalledBase(actor, getDb(), input);
  });
}

/** Report a field-service finding → hand-over to sales with a deadline (editors, M18). */
export async function reportFindingAction(input: unknown) {
  return runAction((actor) => {
    enforceRateLimit("installedBaseWrite", `${actor.tenantId}:${actor.userId}`);
    return reportFinding(actor, getDb(), input);
  });
}

/** Move a hand-over (contacted → offered → won / lost / no decision; editors, M18). */
export async function updateHandoverAction(input: unknown) {
  return runAction((actor) => {
    enforceRateLimit("installedBaseWrite", `${actor.tenantId}:${actor.userId}`);
    return updateHandover(actor, getDb(), input);
  });
}

/** Compute and store a cost-per-part comparison (editors, M18). */
export async function saveCostComparisonAction(input: unknown) {
  return runAction((actor) => {
    enforceRateLimit("installedBaseWrite", `${actor.tenantId}:${actor.userId}`);
    return saveCostComparison(actor, getDb(), input);
  });
}

/** Set the tenant's industry profile (admins, M18). */
export async function setIndustryProfileAction(input: unknown) {
  return runAction((actor) => {
    enforceRateLimit("installedBaseWrite", `${actor.tenantId}:${actor.userId}`);
    return setIndustryProfile(actor, getDb(), input);
  });
}
