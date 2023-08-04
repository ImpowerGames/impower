import { ScrolledEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import { SelectedEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import { PauseGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/PauseGameMessage";
import { StartGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StartGameMessage";
import { StepGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StepGameMessage";
import { StopGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StopGameMessage";
import { UnpauseGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/UnpauseGameMessage";
import { DidCloseFileEditorMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidCloseFileEditorMessage";
import { DidCollapsePreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidCollapsePreviewPaneMessage";
import { DidEditProjectNameMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidEditProjectNameMessage";
import { DidExpandPreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidExpandPreviewPaneMessage";
import { DidLoadProjectMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidLoadProjectMessage";
import { DidOpenFileEditorMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenFileEditorMessage";
import { DidOpenPanelMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenPanelMessage";
import { DidOpenViewMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenViewMessage";
import { WillEditProjectNameMessage } from "@impower/spark-editor-protocol/src/protocols/window/WillEditProjectNameMessage";
import { Range } from "@impower/spark-editor-protocol/src/types";
import { Workspace } from "./Workspace";
import { ReadOnly } from "./types/ReadOnly";
import { WorkspaceState } from "./types/WorkspaceState";

const FILENAME_SANITIZER_REGEX = /[\\/:"*?<>|`=]/g;

export default class WorkspaceWindow {
  protected _state: WorkspaceState;
  get state(): ReadOnly<WorkspaceState> {
    return this._state;
  }

  constructor() {
    this._state = {
      header: { projectName: "" },
      panes: {
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
            page: {},
            game: {},
            screenplay: {},
            file: {},
          },
        },
      },
    };
    window.addEventListener(
      ScrolledEditorMessage.method,
      this.handleScrolledEditor
    );
    window.addEventListener(
      SelectedEditorMessage.method,
      this.handleSelectedEditor
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
        const panelState = this.getPanelState(pane, panel);
        panelState.visibleRange = JSON.parse(JSON.stringify(range));
      }
    }
  };

  protected handleSelectedEditor = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (SelectedEditorMessage.type.isNotification(message)) {
        const { textDocument, range } = message.params;
        const uri = textDocument.uri;
        const pane = this.getPaneFromUri(uri);
        const panel = this.getPanelFromUri(uri);
        const panelState = this.getPanelState(pane, panel);
        panelState.selectedRange = JSON.parse(JSON.stringify(range));
      }
    }
  };

  getFilePathFromUri(uri: string) {
    return uri.replace(Workspace.fs.getWorkspaceUri() + "/", "");
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
    const paneState = this._state.panes[pane];
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

  getOpenedPanelState(pane: string) {
    const panel = this.getOpenedPanel(pane);
    const panelState = this.getPanelState(pane, panel);
    return panelState;
  }

  getActiveEditor(
    pane: string
  ): { uri: string; visibleRange?: Range; selectedRange?: Range } | undefined {
    const panelState = this.getOpenedPanelState(pane);
    const filePath = panelState.openFilePath;
    if (filePath) {
      const uri = Workspace.fs.getWorkspaceUri(filePath);
      return {
        uri,
        visibleRange: panelState.visibleRange,
        selectedRange: panelState.selectedRange,
      };
    }
    return undefined;
  }

  expandedPreviewPane() {
    this._state.panes.preview.revealed = true;
    this.emit(
      DidExpandPreviewPaneMessage.method,
      DidExpandPreviewPaneMessage.type.notification({})
    );
  }

  collapsedPreviewPane() {
    this._state.panes.preview.revealed = false;
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

  startGame() {
    this._state.panes.preview.panels.game.running = true;
    this.emit(StartGameMessage.method, StartGameMessage.type.request({}));
    if (this._state.panes.preview.panels.game.paused) {
      this.unpauseGame();
    }
  }

  stopGame() {
    this._state.panes.preview.panels.game.running = false;
    this.emit(StopGameMessage.method, StopGameMessage.type.request({}));
  }

  pauseGame() {
    this._state.panes.preview.panels.game.paused = true;
    this.emit(PauseGameMessage.method, PauseGameMessage.type.request({}));
  }

  unpauseGame() {
    this._state.panes.preview.panels.game.paused = false;
    this.emit(UnpauseGameMessage.method, UnpauseGameMessage.type.request({}));
  }

  stepGame(deltaMS: number) {
    if (deltaMS < 0) {
      const paused = this._state.panes.preview.panels.game.paused;
      if (!paused) {
        this.pauseGame();
      }
    }
    this.emit(
      StepGameMessage.method,
      StepGameMessage.type.request({ deltaMS })
    );
  }

  toggleGameRunning() {
    if (this._state.panes.preview.panels.game.running) {
      this.stopGame();
    } else {
      this.startGame();
    }
  }

  toggleGamePaused() {
    if (this._state.panes.preview.panels.game.paused) {
      this.unpauseGame();
    } else {
      this.pauseGame();
    }
  }

  loadProject(project: { id: string; name: string }) {
    const validName = project.name.replace(FILENAME_SANITIZER_REGEX, "");
    this._state.header.projectName = validName;
    this.emit(
      DidLoadProjectMessage.method,
      DidLoadProjectMessage.type.notification(project)
    );
  }

  startEditingProjectName() {
    this._state.header.editingProjectName = true;
    this.emit(
      WillEditProjectNameMessage.method,
      WillEditProjectNameMessage.type.notification({})
    );
  }

  async finishEditingProjectName(name: string) {
    const validName = name.replace(FILENAME_SANITIZER_REGEX, "");
    this._state.header.editingProjectName = false;
    this._state.header.projectName = validName;
    await Workspace.fs.updateProjectName(validName);
    this.emit(
      DidEditProjectNameMessage.method,
      DidEditProjectNameMessage.type.notification({ name: validName })
    );
  }
}
