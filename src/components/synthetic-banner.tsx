/** Persistent notice for demo tenants; names the CURRENT tenant (no hardcoded tenant names). */
export function SyntheticBanner({ tenantName }: { tenantName?: string }) {
  return (
    <div
      role="note"
      aria-label="Synthetic data notice"
      className="border-b border-amber-300 bg-amber-50 px-4 py-1.5 text-center text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-50"
    >
      <strong>SYNTHETIC DATA</strong> —{" "}
      {tenantName ? <>&ldquo;{tenantName}&rdquo; contains</> : "Demo tenants contain"} demonstration data only. It does not describe a real
      product and implies no review or approval by any company named in it.
    </div>
  );
}
