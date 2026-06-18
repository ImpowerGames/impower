import { useComputed } from "@preact/signals";
import workspace from "./WorkspaceStore";

/**
 * Returns a Tailwind text-color class reflecting the worst diagnostic
 * severity present in the workspace cache for the given file scope:
 *
 *   - `"text-danger-500"`  — at least one Error (severity 1)
 *   - `"text-warning-500"` — at least one Warning (severity 2)
 *   - `""`                  — no diagnostics in that scope
 *
 * Scope:
 *   - `filename === "main.sd"` matches diagnostics whose uri ends with
 *     `/main.sd`.
 *   - any other `filename` matches diagnostics whose uri ends with
 *     `/<filename>`.
 *   - `filename` omitted aggregates diagnostics across all NON-main
 *     scripts (matches the legacy `<se-logic-diagnostics-label>`
 *     "any script other than main" semantics — used by the Scripts
 *     sub-tab).
 *
 * Returns a string (the unwrapped useComputed value) so callers can
 * pass it straight to a `color=` prop or use in `cn()`.
 */
export function useDiagnosticColor(filename?: string): string {
  return useComputed(() => {
    const diagnostics = workspace.state.value.debug?.diagnostics;
    if (!diagnostics) return "";
    let minSeverity = Infinity;
    let count = 0;
    for (const [uri, fileDiagnostics] of Object.entries(diagnostics)) {
      const matches = filename
        ? uri.endsWith("/" + filename)
        : !uri.endsWith("/main.sd");
      if (!matches) continue;
      for (const d of fileDiagnostics) {
        count += 1;
        if ((d.severity ?? Infinity) < minSeverity) {
          minSeverity = d.severity ?? Infinity;
        }
      }
    }
    if (count === 0) return "";
    if (minSeverity === 1) return "text-danger-500";
    if (minSeverity === 2) return "text-warning-500";
    return "";
  }).value;
}
