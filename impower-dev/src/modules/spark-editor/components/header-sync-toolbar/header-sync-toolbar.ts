import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_header-sync-toolbar";

export default class HeaderSyncConflictToolbar extends Component(spec) {
  override onConnected() {
    this.ref.syncButton?.addEventListener("click", this.handleClickSyncButton);
  }

  override onDisconnected() {
    this.ref.syncButton?.removeEventListener(
      "click",
      this.handleClickSyncButton
    );
  }

  override onInit() {
    this.setup();
  }

  override onStoreUpdate() {
    this.setup();
  }

  setup() {
    const store = this.stores.workspace.current;
    const syncState = store?.project?.syncState;
    const syncButton = this.ref.syncButton;
    if (syncButton) {
      if (
        syncState === "load_error" ||
        syncState === "import_error" ||
        syncState === "export_error" ||
        syncState === "sync_error"
      ) {
        this.ref.syncButton.removeAttribute("animation");
        this.ref.syncButton.removeAttribute("disabled");
        this.ref.syncButton.setAttribute("color", "red");
      } else if (
        syncState === "syncing" ||
        syncState === "loading" ||
        syncState === "importing" ||
        syncState === "exporting"
      ) {
        this.ref.syncButton.setAttribute("animation", "spin");
        this.ref.syncButton.setAttribute("disabled", "");
        this.ref.syncButton.setAttribute("color", "fg");
      } else if (syncState === "synced") {
        this.ref.syncButton.removeAttribute("animation");
        this.ref.syncButton.removeAttribute("disabled");
        this.ref.syncButton.setAttribute("color", "fg");
      } else if (syncState === "offline") {
        this.ref.syncButton.removeAttribute("animation");
        this.ref.syncButton.removeAttribute("disabled");
        this.ref.syncButton.setAttribute("color", "yellow");
      } else if (syncState === "unsynced") {
        this.ref.syncButton.removeAttribute("animation");
        this.ref.syncButton.removeAttribute("disabled");
        this.ref.syncButton.setAttribute("color", "primary");
      }
    }
  }

  handleClickSyncButton = async () => {
    await Workspace.window.syncProject();
  };
}
