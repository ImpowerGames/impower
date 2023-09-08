import { DidChangeProjectStateMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeProjectStateMessage";
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
      DidChangeProjectStateMessage.method,
      this.handleDidChangeProjectState
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
      DidChangeProjectStateMessage.method,
      this.handleDidChangeProjectState
    );
    window.removeEventListener("editor/focused", this.handleEditorFocused);
    window.removeEventListener("editor/unfocused", this.handleEditorUnfocused);
    window.removeEventListener("input/focused", this.handleInputFocused);
    window.removeEventListener("input/unfocused", this.handleInputUnfocused);
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

  handleDidChangeProjectState = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidChangeProjectStateMessage.type.isNotification(message)) {
        const params = message.params;
        const { state } = params;
        const projectId = state.id;
        if (!projectId || projectId === Workspace.LOCAL_PROJECT_ID) {
          this.syncButtonEl.hidden = true;
        } else {
          this.syncButtonEl.hidden = false;
          const syncState = state.syncState;
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
