import { llmBanner } from "@/server/llm";

/** Visible whenever the app runs in simulated mode (acceptance test I). */
export function LlmModeBanner() {
  const text = llmBanner();
  if (!text) return null;
  return (
    <div
      role="note"
      aria-label="Simulated mode notice"
      className="border-b border-sky-300 bg-sky-50 px-4 py-1.5 text-center text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-50"
    >
      <strong>SIMULATED MODE</strong> — {text}
    </div>
  );
}
