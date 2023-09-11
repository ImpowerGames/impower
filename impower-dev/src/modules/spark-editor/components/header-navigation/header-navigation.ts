import { WorkspaceStore } from "@impower/spark-editor-protocol/src/types";
import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";
import spec from "./_header-navigation";

export default class HeaderNavigation extends Component(spec) {
  get doneButtonEl() {
    return this.getElementById("done-button")!;
  }

  get previewButtonEl() {
    return this.getElementById("preview-button")!;
  }

  get syncButtonEl() {
    return this.getElementById("sync-button")!;
  }

  override onConnected(): void {
    this.syncButtonEl.addEventListener("click", this.handleClickSyncButton);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("editor/focused", this.handleEditorFocused);
    window.addEventListener("editor/unfocused", this.handleEditorUnfocused);
    window.addEventListener("input/focused", this.handleInputFocused);
    window.addEventListener("input/unfocused", this.handleInputUnfocused);
  }

  override onDisconnected(): void {
    this.syncButtonEl.removeEventListener("click", this.handleClickSyncButton);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("editor/focused", this.handleEditorFocused);
    window.removeEventListener("editor/unfocused", this.handleEditorUnfocused);
    window.removeEventListener("input/focused", this.handleInputFocused);
    window.removeEventListener("input/unfocused", this.handleInputUnfocused);
  }

  override onUpdate(store: WorkspaceStore) {
    const projectId = store.project.id;
    const syncState = store.project.syncState;
    if (!projectId || projectId === WorkspaceConstants.LOCAL_PROJECT_ID) {
      this.syncButtonEl.hidden = true;
    } else {
      this.syncButtonEl.hidden = false;
      if (
        syncState === "load_error" ||
        syncState === "import_error" ||
        syncState === "export_error" ||
        syncState === "sync_error"
      ) {
        this.syncButtonEl.removeAttribute("animation");
        this.syncButtonEl.removeAttribute("disabled");
        this.syncButtonEl.setAttribute("color", "red");
        this.syncButtonEl.hidden = false;
      } else if (syncState === "sync_conflict") {
        // TODO: Replace sync button with conflict resolution buttons
        this.syncButtonEl.removeAttribute("animation");
        this.syncButtonEl.setAttribute("disabled", "");
        this.syncButtonEl.setAttribute("color", "yellow");
      } else if (syncState === "syncing") {
        this.syncButtonEl.setAttribute("animation", "spin");
        this.syncButtonEl.setAttribute("disabled", "");
        this.syncButtonEl.setAttribute("color", "fg");
      } else if (syncState === "saved") {
        this.syncButtonEl.removeAttribute("animation");
        this.syncButtonEl.removeAttribute("disabled");
        this.syncButtonEl.setAttribute("color", "fg");
      } else if (syncState === "unsaved") {
        this.syncButtonEl.removeAttribute("animation");
        this.syncButtonEl.removeAttribute("disabled");
        this.syncButtonEl.setAttribute("color", "primary");
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
    this.doneButtonEl.hidden = false;
    this.previewButtonEl.hidden = true;
  }

  finishEditing() {
    this.doneButtonEl.hidden = true;
    this.previewButtonEl.hidden = false;
  }
}
