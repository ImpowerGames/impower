import { useComputed } from "@preact/signals";
import workspace from "./WorkspaceStore";

export function useDiagnosticColor(filename?: string): string {
  return useComputed(() => {
    const summary = workspace.state.value.debug?.diagnosticsSummary;
    if (!summary) return "";
    let errors = 0;
    let warnings = 0;
    for (const [uri, counts] of Object.entries(summary)) {
      const matches = filename
        ? uri.endsWith("/" + filename)
        : !uri.endsWith("/main.sd");
      if (!matches) continue;
      errors += counts.errors;
      warnings += counts.warnings;
    }
    if (errors > 0) return "text-danger-500";
    if (warnings > 0) return "text-warning-500";
    return "";
  }).value;
}
