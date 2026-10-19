import { ClassificationBlockedError } from "./errors";

/** Mirrors the Prisma enum DataClassification. */
export type DataClassification = "public" | "internal" | "confidential" | "restricted";

const RANK: Record<DataClassification, number> = { public: 0, internal: 1, confidential: 2, restricted: 3 };

/** Tenant settings (Tenant.externalModelsApproved / maxExternalModelClass). */
export interface ExternalModelPolicy {
  tenantId: string;
  externalModelsApproved: boolean;
  maxExternalModelClass: DataClassification;
}

/**
 * Classification of a prompt's data. Prompts always contain tenant knowledge
 * (claims, product facts), so the floor is "internal" even if every source is public.
 */
export function promptClassification(sourceClasses: Iterable<DataClassification>): DataClassification {
  let max: DataClassification = "internal";
  for (const c of sourceClasses) if (RANK[c] > RANK[max]) max = c;
  return max;
}

/**
 * Gate before ANY external model call. Blocks when the tenant has not approved
 * external models or the data exceeds the tenant's maxExternalModelClass.
 * Restricted data therefore never leaves the server unless an admin raised
 * maxExternalModelClass to "restricted".
 */
export function assertExternalCallAllowed(policy: ExternalModelPolicy, data: DataClassification): void {
  if (!policy.externalModelsApproved) {
    throw new ClassificationBlockedError("External models are not approved for this tenant.");
  }
  if (RANK[data] > RANK[policy.maxExternalModelClass]) {
    throw new ClassificationBlockedError(
      `Data classified "${data}" exceeds the tenant's limit for external models ("${policy.maxExternalModelClass}").`,
    );
  }
}
