import { DidCollapsePreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidCollapsePreviewPaneMessage";
import { DidExpandPreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidExpandPreviewPaneMessage";
import { DidOpenPanelMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenPanelMessage";
import { DEFAULT_WORKSPACE_STATE } from "./DEFAULT_WORKSPACE_STATE";
import { ReadOnly } from "./types/ReadOnly";
import { WorkspaceState } from "./types/WorkspaceState";

export default class WorkspaceWindow {
  protected _state: WorkspaceState;
  get state(): ReadOnly<WorkspaceState> {
    return this._state;
  }

  constructor() {
    this._state = DEFAULT_WORKSPACE_STATE;
    window.addEventListener(
      DidOpenPanelMessage.method,
      this.handleDidOpenPanel
    );
  }

  handleDidOpenPanel = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidOpenPanelMessage.type.isNotification(message)) {
        const { pane, panel } = message.params;
        const paneState = this._state[pane];
        if (!paneState) {
          throw new Error(`Pane type not recognized: ${pane}`);
        }
        const panelState = paneState.panels[panel];
        if (!panelState) {
          throw new Error(`Panel type not recognized: ${panel}`);
        }
        paneState.panel = panel;
      }
      if (DidExpandPreviewPaneMessage.type.isNotification(message)) {
        this._state.preview.revealed = true;
      }
      if (DidCollapsePreviewPaneMessage.type.isNotification(message)) {
        this._state.preview.revealed = false;
      }
    }
  };
}
