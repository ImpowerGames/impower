import {
  Button,
  Dialog,
  DialogActions,
  DialogTitle,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import workspace from "../../workspace/WorkspaceStore";
import Account from "../account/Account";

export default function SettingsDialog() {
  const open = useComputed(
    () =>
      !!workspace.state.value.screen?.settingsOpen &&
      !workspace.state.value.screen?.pickingResource,
  ).value;

  const close = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.closeSettings();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          void close();
        }
      }}
      size="md"
      flush
    >
      <DialogTitle class="px-6 pt-5 pb-3">Settings</DialogTitle>
      <div class="flex max-h-[70vh] min-h-0 flex-col overflow-y-auto">
        <Account />
      </div>
      <DialogActions class="border-t border-edge px-6 py-3">
        <Button onClick={() => void close()}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
