import { useComputed } from "@preact/signals";
import { isScriptPath } from "../utils/scriptFiles";
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
        : isScriptPath(uri) && !uri.endsWith("/main.sd");
      if (!matches) continue;
      errors += counts.errors;
      warnings += counts.warnings;
    }
    if (errors > 0) return "text-error-strong";
    if (warnings > 0) return "text-warning-strong";
    return "";
  }).value;
}
