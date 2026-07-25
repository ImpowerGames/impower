import { useComputed } from "@preact/signals";
import workspace from "../../workspace/WorkspaceStore";

export const propDefaults = {};
export type ImportProgressBarProps = Partial<typeof propDefaults>;

/**
 * A 2px determinate progress bar for asset imports, overlaying the header's
 * bottom divider. Driven by the transient workspace `importProgress` signal
 * (set by the upload/drop entry points via `runImport`): the fill tracks files
 * read, then holds full during the batched OPFS write. Renders nothing when no
 * import is running.
 */
export default function ImportProgressBar(_p: ImportProgressBarProps) {
  const progress = useComputed(() => workspace.importProgress.value).value;
  if (!progress) {
    return null;
  }
  const pct =
    progress.total > 0
      ? Math.round((progress.loaded / progress.total) * 100)
      : 0;
  return (
    <div
      class="absolute inset-x-0 bottom-0 z-[3] h-0.5 overflow-hidden bg-primary/20"
      role="progressbar"
      aria-label="Importing files"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div
        class="h-full bg-primary transition-[width] duration-200 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
