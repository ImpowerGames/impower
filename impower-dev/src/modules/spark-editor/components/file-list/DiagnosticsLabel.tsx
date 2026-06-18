import type { ComponentChildren } from "preact";
import { cn } from "../../../../../../packages/impower-ui/src/utils/cn";
import { useDiagnosticColor } from "../../workspace/useDiagnosticColor";

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
 * the legacy `<se-logic-diagnostics-label>`.
 */
export default function DiagnosticsLabel({
  filename,
  children,
}: DiagnosticsLabelProps) {
  const colorClass = useDiagnosticColor(filename);
  return (
    <div class={cn("flex flex-1 flex-row items-center", colorClass)}>
      {children}
    </div>
  );
}
