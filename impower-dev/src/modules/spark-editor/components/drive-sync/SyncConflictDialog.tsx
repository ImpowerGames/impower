import {
  Button,
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
} from "@impower/impower-ui/components";
import workspace from "../../workspace/WorkspaceStore";

type Keep = "device" | "drive";

const withWindow = async (
  act: (
    win: (typeof import("../../workspace/Workspace"))["Workspace"]["window"],
  ) => unknown,
) => {
  const { Workspace } = await import("../../workspace/Workspace");
  await act(Workspace.window);
};

export default function SyncConflictDialog() {
  const open = workspace.syncConflictOpen.value;

  const close = () => void withWindow((win) => win.closeSyncConflict());
  const keep = (choice: Keep) =>
    void withWindow((win) => win.resolveSyncConflict(choice));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          close();
        }
      }}
      size="lg"
      responsive
    >
      <DialogTitle>This project changed on Google Drive</DialogTitle>
      <DialogDescription class="mt-3">
        This device and Google Drive both have changes the other does not.
        Choose which version to keep.
      </DialogDescription>
      <dl class="mt-4 flex flex-col gap-3 text-sm">
        <div>
          <dt class="font-semibold text-ink">Keep this device's version</dt>
          <dd class="text-muted">
            Replaces the copy on Google Drive. The changes made on Drive are
            discarded.
          </dd>
        </div>
        <div>
          <dt class="font-semibold text-ink">Keep the Drive version</dt>
          <dd class="text-muted">
            Replaces this device's scripts and assets. The changes made on this
            device are discarded.
          </dd>
        </div>
      </dl>
      <DialogActions class="mt-6 flex-wrap">
        <Button variant="quiet" onClick={close}>
          Cancel
        </Button>
        <Button onClick={() => keep("drive")}>Keep the Drive version</Button>
        <Button onClick={() => keep("device")}>
          Keep this device's version
        </Button>
      </DialogActions>
    </Dialog>
  );
}
