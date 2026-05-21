import { Button, Refresh } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";
import workspace from "../../workspace/WorkspaceStore";
import HeaderSyncConflictToolbar from "../header-sync-conflict-toolbar/HeaderSyncConflictToolbar";

export const propDefaults = {};
export type HeaderSyncToolbarProps = Partial<typeof propDefaults>;

/**
 * Sync button in the top header. Hidden entirely for the local-only
 * project (nothing to sync to). Otherwise renders one of:
 *
 *   - The conflict resolution toolbar (push/pull) when
 *     `sync.status === "sync_conflict"`.
 *   - A refresh icon button whose color + animation reflects the
 *     current sync state:
 *       * spinning while loading/syncing/importing/exporting (disabled)
 *       * red on any error state
 *       * primary (sky) when there are unsynced local changes
 *       * warning (yellow) when offline
 *       * foreground (default) when synced or idle.
 *
 * Click triggers `Workspace.window.syncProject()`.
 */
export default function HeaderSyncToolbar(_p: HeaderSyncToolbarProps) {
  const projectId = useComputed(
    () => workspace.state.value.project?.id || "",
  ).value;
  const syncState = useComputed(
    () => workspace.state.value.sync?.status || "",
  ).value;

  const canSync = projectId && projectId !== WorkspaceConstants.LOCAL_PROJECT_ID;
  if (!canSync) return null;

  if (syncState === "sync_conflict") {
    return <HeaderSyncConflictToolbar />;
  }

  const isError =
    syncState === "load_error" ||
    syncState === "import_error" ||
    syncState === "export_error" ||
    syncState === "sync_error";
  const isBusy =
    syncState === "syncing" ||
    syncState === "loading" ||
    syncState === "importing" ||
    syncState === "exporting";

  const colorClass = isError
    ? "text-danger-500"
    : syncState === "offline"
      ? "text-warning-500"
      : syncState === "unsynced"
        ? "text-primary"
        : "text-foreground";

  const onClick = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    await Workspace.window.syncProject();
  };

  return (
    <Button
      variant="ghost"
      size="icon-lg"
      class={`size-14 ${colorClass}`}
      aria-label="Sync"
      disabled={isBusy}
      onClick={onClick}
    >
      <Refresh
        class={`size-5 ${isBusy ? "animate-spin" : ""}`}
      />
    </Button>
  );
}
