import { DidCloseFileEditorMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidCloseFileEditorMessage";
import { DidCollapsePreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidCollapsePreviewPaneMessage";
import { DidExpandPreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidExpandPreviewPaneMessage";
import { DidOpenFileEditorMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenFileEditorMessage";
import { DidOpenPanelMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenPanelMessage";
import { DidOpenViewMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenViewMessage";
import { ReadOnly } from "./types/ReadOnly";
import { WorkspaceState } from "./types/WorkspaceState";

export default class WorkspaceWindow {
  protected _state: WorkspaceState;
  get state(): ReadOnly<WorkspaceState> {
    return this._state;
  }

  constructor() {
    this._state = {
      setup: {
        panel: "details",
        panels: {
          details: {
            scrollIndex: 0,
          },
          share: {
            scrollIndex: 0,
          },
          assets: {
            scrollIndex: 0,
          },
        },
      },
      audio: {
        view: "list",
        panel: "sounds",
        panels: {
          sounds: {
            scrollIndex: 0,
            openFilePath: "",
          },
          music: {
            scrollIndex: 0,
            openFilePath: "",
          },
        },
      },
      displays: {
        view: "list",
        panel: "widgets",
        panels: {
          widgets: {
            scrollIndex: 0,
            openFilePath: "",
          },
          views: {
            scrollIndex: 0,
            openFilePath: "",
          },
        },
      },
      graphics: {
        view: "list",
        panel: "sprites",
        panels: {
          sprites: {
            scrollIndex: 0,
            openFilePath: "",
          },
          maps: {
            scrollIndex: 0,
            openFilePath: "",
          },
        },
      },
      logic: {
        view: "list",
        panel: "main",
        panels: {
          main: {
            scrollIndex: 0,
          },
          scripts: {
            scrollIndex: 0,
            openFilePath: "",
          },
        },
      },
      preview: {
        panel: "game",
        panels: {
          game: {},
          screenplay: {
            scrollIndex: 0,
          },
          file: {},
        },
      },
    };
    window.addEventListener(
      DidOpenPanelMessage.method,
      this.handleDidOpenPanel
    );
    window.addEventListener(DidOpenViewMessage.method, this.handleDidOpenView);
    window.addEventListener(
      DidExpandPreviewPaneMessage.method,
      this.handleDidExpandPreviewPane
    );
    window.addEventListener(
      DidCollapsePreviewPaneMessage.method,
      this.handleDidCollapsePreviewPane
    );
    window.addEventListener(
      DidOpenFileEditorMessage.method,
      this.handleDidOpenFileEditor
    );
    window.addEventListener(
      DidCloseFileEditorMessage.method,
      this.handleDidCloseFileEditor
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
    }
  };

  handleDidOpenView = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidOpenViewMessage.type.isNotification(message)) {
        const { pane, view } = message.params;
        const paneState = this._state[pane];
        if (!paneState) {
          throw new Error(`Pane type not recognized: ${pane}`);
        }
        paneState.view = view;
      }
    }
  };

  handleDidExpandPreviewPane = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidExpandPreviewPaneMessage.type.isNotification(message)) {
        this._state.preview.revealed = true;
      }
    }
  };

  handleDidCollapsePreviewPane = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidCollapsePreviewPaneMessage.type.isNotification(message)) {
        this._state.preview.revealed = false;
      }
    }
  };

  handleDidOpenFileEditor = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidOpenFileEditorMessage.type.isNotification(message)) {
        const { pane, panel, filePath } = message.params;
        const paneState = this._state[pane];
        if (!paneState) {
          throw new Error(`Pane type not recognized: ${pane}`);
        }
        const panelState = paneState.panels[panel];
        if (!panelState) {
          throw new Error(`Panel type not recognized: ${panel}`);
        }
        panelState.openFilePath = filePath;
      }
    }
  };

  handleDidCloseFileEditor = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidCloseFileEditorMessage.type.isNotification(message)) {
        const { pane, panel } = message.params;
        const paneState = this._state[pane];
        if (!paneState) {
          throw new Error(`Pane type not recognized: ${pane}`);
        }
        const panelState = paneState.panels[panel];
        if (!panelState) {
          throw new Error(`Panel type not recognized: ${panel}`);
        }
        panelState.openFilePath = "";
      }
    }
  };
}
