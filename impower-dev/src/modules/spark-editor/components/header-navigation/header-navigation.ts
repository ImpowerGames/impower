import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";
import spec from "./_header-navigation";

export default class HeaderNavigation extends Component(spec) {
  override onConnected() {
    this.ref.syncButton.addEventListener("click", this.handleClickSyncButton);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("editor/focused", this.handleEditorFocused);
    window.addEventListener("editor/unfocused", this.handleEditorUnfocused);
    window.addEventListener("input/focused", this.handleInputFocused);
    window.addEventListener("input/unfocused", this.handleInputUnfocused);
  }

  override onDisconnected() {
    this.ref.syncButton.removeEventListener(
      "click",
      this.handleClickSyncButton
    );
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("editor/focused", this.handleEditorFocused);
    window.removeEventListener("editor/unfocused", this.handleEditorUnfocused);
    window.removeEventListener("input/focused", this.handleInputFocused);
    window.removeEventListener("input/unfocused", this.handleInputUnfocused);
  }

  override onInit() {
    this.setup();
  }

  override onStoreUpdate() {
    this.setup();
  }

  setup() {
    const store = this.stores.workspace.current;
    const projectId = store?.project?.id;
    const syncState = store?.project?.syncState;
    if (!projectId || projectId === WorkspaceConstants.LOCAL_PROJECT_ID) {
      this.ref.syncButton.hidden = true;
    } else {
      this.ref.syncButton.hidden = false;
      if (
        syncState === "load_error" ||
        syncState === "import_error" ||
        syncState === "export_error" ||
        syncState === "sync_error"
      ) {
        this.ref.syncButton.removeAttribute("animation");
        this.ref.syncButton.removeAttribute("disabled");
        this.ref.syncButton.setAttribute("color", "red");
        this.ref.syncButton.hidden = false;
      } else if (syncState === "sync_conflict") {
        // TODO: Replace sync button with conflict resolution buttons
        this.ref.syncButton.removeAttribute("animation");
        this.ref.syncButton.setAttribute("disabled", "");
        this.ref.syncButton.setAttribute("color", "yellow");
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

  handleKeyDown = async (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === "s") {
      e.preventDefault();
      await Workspace.window.syncProject();
    }
  };

  handleEditorFocused = () => {
    this.startEditing();
  };

  handleEditorUnfocused = () => {
    this.finishEditing();
  };

  handleInputFocused = () => {
    this.startEditing();
  };

  handleInputUnfocused = () => {
    this.finishEditing();
  };

  startEditing() {
    this.ref.previewButton.hidden = true;
    this.ref.doneButton.hidden = false;
  }

  async finishEditing() {
    if (this.ref.previewButton.hidden) {
      this.ref.previewButton.hidden = false;
    }
    if (!this.ref.doneButton.hidden) {
      this.ref.doneButton.hidden = true;
      await Workspace.window.syncProject();
    }
  }
}
