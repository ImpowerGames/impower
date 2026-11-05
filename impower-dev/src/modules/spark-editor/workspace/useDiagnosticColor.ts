import { useComputed } from "@preact/signals";
import { isScriptPath } from "../utils/scriptFiles";
import workspace from "./WorkspaceStore";

const MAIN_SCRIPT = "main.sd";

const projectPath = (uri: string) => {
  const scheme = uri.indexOf("://");
  const root = scheme < 0 ? -1 : uri.indexOf("/", scheme + 3);
  return root < 0 ? undefined : uri.slice(root + 1);
};

export function useDiagnosticColor(filename?: string): string {
  return useComputed(() => {
    const summary = workspace.state.value.debug?.diagnosticsSummary;
    if (!summary) return "";
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
