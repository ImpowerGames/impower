import { Button, CloudIcon, RefreshIcon } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";
import workspace from "../../workspace/WorkspaceStore";
import useSaveStatus from "./useSaveStatus";

const BUSY = new Set(["syncing", "loading", "importing", "exporting"]);

export default function SyncButton() {
  const projectId = useComputed(() => workspace.signals.projectId.value).value;
  const syncStatus = useComputed(
    () => workspace.signals.syncStatus.value ?? "",
  ).value;
  const signedIn = !!workspace.signals.account.value;
  const status = useSaveStatus();

  const onDrive =
    !!projectId && projectId !== WorkspaceConstants.LOCAL_PROJECT_ID;

  if (onDrive) {
    const busy = BUSY.has(syncStatus);
    return (
      <Button
        variant="quiet"
        size="icon"
        aria-label="Sync now"
        title={status ? `Sync now · ${status.text}` : "Sync now"}
        disabled={busy}
        onClick={async () => {
          const { Workspace } = await import("../../workspace/Workspace");
          await Workspace.window.syncProject();
        }}
      >
        <RefreshIcon class={busy ? "motion-safe:animate-spin" : undefined} />
      </Button>
    );
  }

  if (signedIn && projectId) {
    return (
      <Button
        variant="quiet"
        size="icon"
        aria-label="Save to Google Drive"
        title="Save to Google Drive"
        onClick={async () => {
          const { Workspace } = await import("../../workspace/Workspace");
          await Workspace.window.saveProjectToDrive();
        }}
      >
        <CloudIcon />
      </Button>
    );
  }

  return null;
}
