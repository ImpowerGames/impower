import { ChangedProjectStateMessage } from "@impower/spark-editor-protocol/src/protocols/window/ChangedProjectStateMessage";
import { DidWriteFileMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidWriteFileMessage";
import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
import component from "./_header-navigation";

export default class HeaderNavigation extends SEElement {
  static override async define(
    tag = "se-header-navigation",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }

  get doneButtonEl() {
    return this.getElementById("done-button")!;
  }

  get previewButtonEl() {
    return this.getElementById("preview-button")!;
  }

  get syncButtonEl() {
    return this.getElementById("sync-button")!;
  }

  protected override onConnected(): void {
    this.syncButtonEl.addEventListener("click", this.handleClickSyncButton);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener(
      ChangedProjectStateMessage.method,
      this.handleChangedProjectState
    );
    window.addEventListener(
      DidWriteFileMessage.method,
      this.handleDidWriteFile
    );
    window.addEventListener("editor/focused", this.handleEditorFocused);
    window.addEventListener("editor/unfocused", this.handleEditorUnfocused);
    window.addEventListener("input/focused", this.handleInputFocused);
    window.addEventListener("input/unfocused", this.handleInputUnfocused);
  }

  protected override onDisconnected(): void {
    this.syncButtonEl.removeEventListener("click", this.handleClickSyncButton);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener(
      ChangedProjectStateMessage.method,
      this.handleChangedProjectState
    );
    window.removeEventListener(
      DidWriteFileMessage.method,
      this.handleDidWriteFile
    );
    window.removeEventListener("editor/focused", this.handleEditorFocused);
    window.removeEventListener("editor/unfocused", this.handleEditorUnfocused);
    window.removeEventListener("input/focused", this.handleInputFocused);
    window.removeEventListener("input/unfocused", this.handleInputUnfocused);
  }

  handleClickSyncButton = async () => {
    if (Workspace.window.state.project.canSync) {
      await Workspace.window.syncProject();
    }
  };

  handleKeyDown = async (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === "s") {
      e.preventDefault();
      if (Workspace.window.state.project.canSync) {
        await Workspace.window.syncProject();
      }
    }
  };

  handleChangedProjectState = () => {
    const syncState = Workspace.window.state.project.syncState;
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
      this.syncButtonEl.hidden = false;
    } else if (syncState === "syncing") {
      this.syncButtonEl.setAttribute("animation", "spin");
      this.syncButtonEl.setAttribute("disabled", "");
      this.syncButtonEl.setAttribute("color", "fg");
      this.syncButtonEl.hidden = false;
    } else if (syncState === "saved") {
      this.syncButtonEl.removeAttribute("animation");
      this.syncButtonEl.removeAttribute("disabled");
      this.syncButtonEl.setAttribute("color", "fg");
      this.syncButtonEl.hidden = false;
    } else if (syncState === "unsaved") {
      this.syncButtonEl.removeAttribute("animation");
      this.syncButtonEl.removeAttribute("disabled");
      this.syncButtonEl.setAttribute("color", "primary");
      this.syncButtonEl.hidden = false;
    } else {
      this.syncButtonEl.hidden = true;
    }
  };

  handleDidWriteFile = async (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidWriteFileMessage.type.isNotification(message)) {
        const { file } = message.params;
        const projectId = Workspace.window.state.project.id;
        const canSync = Workspace.window.state.project.canSync;
        if (
          projectId &&
          canSync &&
          file.ext !== "metadata" &&
          file.ext !== "name"
        ) {
          await Workspace.window.requireProjectSync();
        }
      }
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
