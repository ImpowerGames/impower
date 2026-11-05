import type { DebugState } from "@impower/spark-editor-protocol/src/types";

export function problemCountOf(summary: DebugState["diagnosticsSummary"]): {
  errors: number;
  total: number;
} {
  let errors = 0;
  let warnings = 0;
  for (const counts of Object.values(summary ?? {})) {
    errors += counts.errors;
    warnings += counts.warnings;
  }
  return { errors, total: errors + warnings };
}
