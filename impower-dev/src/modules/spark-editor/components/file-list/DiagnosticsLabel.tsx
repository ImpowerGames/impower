import { useComputed } from "@preact/signals";
import type { ComponentChildren } from "preact";
import workspace from "../../workspace/WorkspaceStore";
import { cn } from "../../../../../../packages/impower-ui/src/utils/cn";

export type DiagnosticsLabelProps = {
  /**
   * If set, look at diagnostics for this specific filename. If omitted,
   * aggregate diagnostics across all non-main scripts (matches the legacy
   * behavior where the Logic > Scripts tab itself wanted a count for "any
   * script other than main").
   */
  filename?: string;
  children?: ComponentChildren;
};

/**
 * Colors its children red (severity 1 = Error) or yellow (severity 2 =
 * Warning) based on the LSP diagnostics in the workspace cache. Mirrors
 * the legacy `<se-logic-diagnostics-label>` — same lookup semantics, just
 * as a plain Preact component instead of a custom element.
 */
export default function DiagnosticsLabel({
  filename,
  children,
}: DiagnosticsLabelProps) {
  // Diagnostics live in the workspace cache; we only care about the worst
  // severity across the relevant files. useComputed recomputes only when
  // the diagnostics slice changes.
  const colorClass = useComputed(() => {
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
  });

  return (
    <div class={cn("flex flex-1 flex-row items-center", colorClass.value)}>
      {children}
    </div>
  );
}
