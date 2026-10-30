import { Button, Refresh } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";
import workspace from "../../workspace/WorkspaceStore";
import HeaderSyncConflictToolbar from "../header-sync-conflict-toolbar/HeaderSyncConflictToolbar";

export const propDefaults = {};
export type HeaderSyncToolbarProps = Partial<typeof propDefaults>;

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
