import { useComputed } from "@preact/signals";
import { isScriptPath } from "../utils/scriptFiles";
import { projectPath } from "./problems/problemEntries";
import problems from "./problems/ProblemsStore";

const MAIN_SCRIPT = "main.sd";

export function useDiagnosticColor(filename?: string): string {
  return useComputed(() => {
    const summary = problems.summary.value;
    let errors = 0;
    let warnings = 0;
    for (const [uri, counts] of Object.entries(summary)) {
      const path = projectPath(uri);
      const matches = filename
        ? path === filename
        : isScriptPath(uri) && path !== MAIN_SCRIPT;
      if (!matches) continue;
      errors += counts.errors;
      warnings += counts.warnings;
    }
    if (errors > 0) return "text-error-strong";
    if (warnings > 0) return "text-warning-strong";
    return "";
  }).value;
}
