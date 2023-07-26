import { NotificationMessage } from "@impower/spark-editor-protocol/src/types";
import { ReadOnly } from "./types/ReadOnly";
import { WorkspaceState } from "./types/WorkspaceState";
import DEFAULT_WORKSPACE_STATE from "./workspace.json";

export default class WorkspaceWindow {
  protected _state: WorkspaceState;
  get state(): ReadOnly<WorkspaceState> {
    return this._state;
  }

  constructor() {
    this._state = DEFAULT_WORKSPACE_STATE;
  }

  async sendNotification<M extends string, P>(
    notification: NotificationMessage<M, P>
  ): Promise<void> {
    window.postMessage(notification);
  }

  openPanel(pane: string, panel: string) {
    const paneState = this._state[pane];
    if (!paneState) {
      throw new Error(`Pane not recognized: ${pane}`);
    }
    const panelsState = paneState.panels[panel];
    if (!panelsState) {
      throw new Error(`Panel not recognized: ${panel}`);
    }
    paneState.panel = panel;
  }
}
