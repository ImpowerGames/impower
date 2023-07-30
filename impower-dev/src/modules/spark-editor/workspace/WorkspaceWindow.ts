import { ScrolledEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import { DidCloseFileEditorMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidCloseFileEditorMessage";
import { DidCollapsePreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidCollapsePreviewPaneMessage";
import { DidExpandPreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidExpandPreviewPaneMessage";
import { DidOpenFileEditorMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenFileEditorMessage";
import { DidOpenPanelMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenPanelMessage";
import { DidOpenViewMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenViewMessage";
import { DidScrollPanelMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidScrollPanelMessage";
import { Range } from "@impower/spark-editor-protocol/src/types";
import WorkspaceFileSystem from "./WorkspaceFileSystem";
import { ReadOnly } from "./types/ReadOnly";
import { WorkspaceState } from "./types/WorkspaceState";

export default class WorkspaceWindow {
  protected _fs: WorkspaceFileSystem;

  protected _state: WorkspaceState;
  get state(): ReadOnly<WorkspaceState> {
    return this._state;
  }

  constructor(fs: WorkspaceFileSystem) {
    this._fs = fs;
    this._state = {
      setup: {
        panel: "details",
        panels: {
          details: {},
          share: {},
          assets: {},
        },
      },
      audio: {
        view: "list",
        panel: "sounds",
        panels: {
          sounds: {
            openFilePath: "",
          },
          music: {
            openFilePath: "",
          },
        },
      },
      displays: {
        view: "list",
        panel: "widgets",
        panels: {
          widgets: {
            openFilePath: "",
          },
          views: {
            openFilePath: "",
          },
        },
      },
      graphics: {
        view: "list",
        panel: "sprites",
        panels: {
          sprites: {
            openFilePath: "",
          },
          maps: {
            openFilePath: "",
          },
        },
      },
      logic: {
        view: "list",
        panel: "main",
        panels: {
          main: {
            openFilePath: "logic/main.sd",
          },
          scripts: {
            openFilePath: "",
          },
        },
      },
      preview: {
        panel: "game",
        panels: {
          game: {},
          screenplay: {},
          file: {},
        },
      },
    };
    window.addEventListener(
      ScrolledEditorMessage.method,
      this.handleScrolledEditor
    );
  }

  protected emit<T>(eventName: string, detail?: T): boolean {
    return window.dispatchEvent(
      new CustomEvent(eventName, {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail,
      })
    );
  }

  protected handleScrolledEditor = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (ScrolledEditorMessage.type.isNotification(message)) {
        const { textDocument, range } = message.params;
        const uri = textDocument.uri;
        const pane = this.getPaneFromUri(uri);
        const panel = this.getPanelFromUri(uri);
        this.scrolledPanel(pane, panel, range);
      }
    }
  };

  getFilePathFromUri(uri: string) {
    return uri.replace(this._fs.getWorkspaceUri() + "/", "");
  }

  getPaneFromUri(uri: string) {
    const filePath = this.getFilePathFromUri(uri);
    const uriParts = filePath.split("/");
    return uriParts[0] || "";
  }

  getPanelFromUri(uri: string) {
    const filePath = this.getFilePathFromUri(uri);
    const uriParts = filePath.split("/");
    const panel = uriParts[1];
    return panel?.split(".")?.[0] || "";
  }

  getPaneState(pane: string) {
    const paneState = this._state[pane];
    if (!paneState) {
      throw new Error(`Pane type not recognized: ${pane}`);
    }
    return paneState;
  }

  getPanelState(pane: string, panel: string) {
    const paneState = this.getPaneState(pane);
    const panelState = paneState.panels[panel];
    if (!panelState) {
      throw new Error(`Panel type not recognized: ${panel}`);
    }
    return panelState;
  }

  getOpenedPanel(pane: string) {
    const paneState = this.getPaneState(pane);
    return paneState.panel;
  }

  getActiveScriptEditor(): { uri: string; visibleRange?: Range } {
    const pane = "logic";
    const panel = this.getOpenedPanel(pane);
    const panelState = this.getPanelState(pane, panel);
    const filePath = panelState.openFilePath || "";
    const uri = this._fs.getWorkspaceUri(filePath);
    return { uri, visibleRange: panelState.visibleRange };
  }

  expandedPreviewPane() {
    this._state.preview.revealed = true;
    this.emit(
      DidExpandPreviewPaneMessage.method,
      DidExpandPreviewPaneMessage.type.notification({})
    );
  }

  collapsedPreviewPane() {
    this._state.preview.revealed = false;
    this.emit(
      DidCollapsePreviewPaneMessage.method,
      DidCollapsePreviewPaneMessage.type.notification({})
    );
  }

  openedPanel(pane: string, panel: string) {
    const paneState = this.getPaneState(pane);
    this.getPanelState(pane, panel);
    paneState.panel = panel;
    this.emit(
      DidOpenPanelMessage.method,
      DidOpenPanelMessage.type.notification({ pane, panel })
    );
  }

  scrolledPanel(pane: string, panel: string, range: Range) {
    const panelState = this.getPanelState(pane, panel);
    panelState.visibleRange = JSON.parse(JSON.stringify(range));
    this.emit(
      DidScrollPanelMessage.method,
      DidScrollPanelMessage.type.notification({ pane, panel, range })
    );
  }

  openedView(pane: string, view: string) {
    const paneState = this.getPaneState(pane);
    paneState.view = view;
    this.emit(
      DidOpenViewMessage.method,
      DidOpenViewMessage.type.notification({ pane, view })
    );
  }

  openedFileEditor(pane: string, panel: string, filePath: string) {
    const panelState = this.getPanelState(pane, panel);
    panelState.openFilePath = filePath;
    panelState.visibleRange = {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    };
    this.emit(
      DidOpenFileEditorMessage.method,
      DidOpenFileEditorMessage.type.notification({ pane, panel, filePath })
    );
  }

  closedFileEditor(pane: string, panel: string) {
    const panelState = this.getPanelState(pane, panel);
    panelState.openFilePath = "";
    panelState.visibleRange = undefined;
    this.emit(
      DidCloseFileEditorMessage.method,
      DidCloseFileEditorMessage.type.notification({ pane, panel })
    );
  }
}
