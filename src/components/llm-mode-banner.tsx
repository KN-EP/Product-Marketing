import { llmBanner } from "@/server/llm";

/** Visible whenever the app runs in simulated mode (acceptance test I). */
export function LlmModeBanner() {
  const text = llmBanner();
  if (!text) return null;
  return (
    <div role="status" className="border-b bg-sky-50 px-4 py-2 text-center text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-100">
      {text}
    </div>
  );
}
