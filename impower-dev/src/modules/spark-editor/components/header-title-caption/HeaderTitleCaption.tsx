import { useComputed } from "@preact/signals";
import workspace from "../../workspace/WorkspaceStore";

export const propDefaults = {};
export type HeaderTitleCaptionProps = Partial<typeof propDefaults>;

/**
 * Tiny sync-status caption under the project title in the top header.
 * Reads `workspace.project.name` and `workspace.sync.status` reactively;
 * shows a skeleton placeholder until both are non-empty (post first
 * load). Color encodes severity:
 *   - `text-primary` for unsynced (the user has local changes to push)
 *   - `text-danger-500` for load/import/export/sync errors
 *   - `text-warning-500` for sync_conflict / offline
 *   - `text-foreground/60` for everything else (steady-state).
 */
export default function HeaderTitleCaption(_p: HeaderTitleCaptionProps) {
  const name = useComputed(
    () => workspace.state.value.project?.name || "",
  ).value;
  const syncState = useComputed(
    () => workspace.state.value.sync?.status || "",
  ).value;
  // An in-flight asset import takes precedence over the steady sync status:
  // show a live "Importing N of M..." count (the bar in the header divider
  // gives the matching visual).
  const importProgress = useComputed(() => workspace.importProgress.value).value;

  const info = importProgress
    ? `Importing ${importProgress.loaded} of ${importProgress.total}...`
    : syncStateInfo(syncState);
  const color = importProgress ? "text-primary" : syncStateColor(syncState);

  const showSkeleton = !name || !info;

  return (
    <div
      // Live region so assistive tech announces status changes — notably the
      // "Importing N of M..." import feedback (polite coalesces the rapid count
      // updates to whatever's current at a graceful pause, so it doesn't flood).
      role="status"
      aria-live="polite"
      class={`-mt-0.5 mb-0.5 flex flex-row items-center text-sm font-medium select-none ${color}`}
    >
      {showSkeleton ? (
        /* `<s-skeleton>` shape: pill (rounded-full) + `skeleton-sheen`
           animated gradient; transparent text just sizes the pill. */
        <span class="skeleton-sheen rounded-full text-transparent">
          Saved in cache
        </span>
      ) : (
        info
      )}
    </div>
  );
}

function syncStateInfo(s: string): string {
  switch (s) {
    case "cached": return "Saved in cache";
    case "loading": return "Loading...";
    case "importing": return "Importing...";
    case "exporting": return "Exporting...";
    case "syncing": return "Syncing...";
    case "unsynced": return "Unsynced changes";
    case "synced": return "Synced online ✓";
    case "offline": return "Cannot sync while offline";
    case "load_error": return "Error: Could not load project";
    case "import_error": return "Error: Could not import project";
    case "export_error": return "Error: Could not export project";
    case "sync_error": return "Error: Could not sync project";
    case "sync_conflict": return "Sync conflict detected";
    default: return "";
  }
}

function syncStateColor(s: string): string {
  if (s === "unsynced") return "text-primary";
  if (
    s === "load_error" ||
    s === "import_error" ||
    s === "export_error" ||
    s === "sync_error"
  )
    return "text-danger-500";
  if (s === "sync_conflict" || s === "offline") return "text-warning-500";
  return "text-foreground/60";
}
