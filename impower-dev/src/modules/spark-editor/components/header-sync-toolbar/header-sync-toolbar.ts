import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_header-sync-toolbar";

export default class HeaderSyncConflictToolbar extends Component(spec) {
  override onConnected() {
    this.refs.syncButton?.addEventListener("click", this.handleClickSyncButton);
  }

  override onDisconnected() {
    this.refs.syncButton?.removeEventListener(
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
    const syncStatus = store?.sync?.status;
    const syncButton = this.refs.syncButton;
    if (syncButton) {
      if (
        syncStatus === "load_error" ||
        syncStatus === "import_error" ||
        syncStatus === "export_error" ||
        syncStatus === "sync_error"
      ) {
        this.refs.syncButton.removeAttribute("animation");
        this.refs.syncButton.removeAttribute("disabled");
        this.refs.syncButton.setAttribute("color", "red");
      } else if (
        syncStatus === "syncing" ||
        syncStatus === "loading" ||
        syncStatus === "importing" ||
        syncStatus === "exporting"
      ) {
        this.refs.syncButton.setAttribute("animation", "spin");
        this.refs.syncButton.setAttribute("disabled", "");
        this.refs.syncButton.setAttribute("color", "fg");
      } else if (syncStatus === "synced") {
        this.refs.syncButton.removeAttribute("animation");
        this.refs.syncButton.removeAttribute("disabled");
        this.refs.syncButton.setAttribute("color", "fg");
      } else if (syncStatus === "offline") {
        this.refs.syncButton.removeAttribute("animation");
        this.refs.syncButton.removeAttribute("disabled");
        this.refs.syncButton.setAttribute("color", "yellow");
      } else if (syncStatus === "unsynced") {
        this.refs.syncButton.removeAttribute("animation");
        this.refs.syncButton.removeAttribute("disabled");
        this.refs.syncButton.setAttribute("color", "primary");
      }
    }
  }

  handleClickSyncButton = async () => {
    await Workspace.window.syncProject();
  };
}
