/** Persistent notice for demo tenants. */
export function SyntheticBanner() {
  return (
    <div
      role="note"
      aria-label="Synthetic data notice"
      className="border-b border-amber-300 bg-amber-50 px-4 py-1.5 text-center text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-50"
    >
      <strong>SYNTHETIC DATA — not a DataGuard product.</strong> &ldquo;DataGuard Demo – Unofficial&rdquo; contains
      demonstration data only and implies no review or approval by DataGuard.
    </div>
  );
}
