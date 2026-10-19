/** Human-readable text for a failed action result (no server internals). */
export function actionErrorText(r: { status: number; error: string; message?: string }): string {
  switch (r.error) {
    case "not_found":
      return "Not found or no access.";
    case "unauthenticated":
      return "Your session has expired. Please sign in again.";
    case "forbidden":
      return r.message ?? "You do not have permission for this action.";
    default:
      return r.message ?? `Request failed (${r.error}).`;
  }
}
