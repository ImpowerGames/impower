import type { ComponentChildren } from "preact";
import { cn } from "../../../../../../packages/impower-ui/src/utils/cn";
import { useDiagnosticColor } from "../../workspace/useDiagnosticColor";

export type DiagnosticsLabelProps = {
  filename?: string;
  children?: ComponentChildren;
};

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
