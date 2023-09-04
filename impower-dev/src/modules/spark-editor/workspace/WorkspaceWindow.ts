import { ScrolledEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import { SelectedEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import { DisableGameDebugMessage } from "@impower/spark-editor-protocol/src/protocols/game/DisableGameDebugMessage";
import { EnableGameDebugMessage } from "@impower/spark-editor-protocol/src/protocols/game/EnableGameDebugMessage";
import { PauseGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/PauseGameMessage";
import { StartGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StartGameMessage";
import { StepGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StepGameMessage";
import { StopGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StopGameMessage";
import { UnpauseGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/UnpauseGameMessage";
import { ChangedHeaderInfoMessage } from "@impower/spark-editor-protocol/src/protocols/window/ChangedHeaderInfoMessage";
import { DidCloseFileEditorMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidCloseFileEditorMessage";
import { DidCollapsePreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidCollapsePreviewPaneMessage";
import { DidEditProjectNameMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidEditProjectNameMessage";
import { DidExpandPreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidExpandPreviewPaneMessage";
import { DidOpenFileEditorMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenFileEditorMessage";
import { DidOpenPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenPaneMessage";
import { DidOpenPanelMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenPanelMessage";
import { DidOpenViewMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenViewMessage";
import { WillBlockInteractionsMessage } from "@impower/spark-editor-protocol/src/protocols/window/WillBlockInteractionsMessage";
import { WillEditProjectNameMessage } from "@impower/spark-editor-protocol/src/protocols/window/WillEditProjectNameMessage";
import { WillUnblockInteractionsMessage } from "@impower/spark-editor-protocol/src/protocols/window/WillUnblockInteractionsMessage";
import { Range } from "@impower/spark-editor-protocol/src/types";
import { SparkProgram } from "../../../../../packages/sparkdown/src";
import { Workspace } from "./Workspace";
import { ReadOnly } from "./types/ReadOnly";
import { WorkspaceState } from "./types/WorkspaceState";

export default class WorkspaceWindow {
  protected _state: WorkspaceState;
  get state(): ReadOnly<WorkspaceState> {
    return this._state;
  }

  constructor() {
    this._state = {
      header: { projectName: "", persistenceState: "" },
      pane: "setup",
      panes: {
        setup: {
          panel: "details",
          panels: {
            details: {
              activeEditor: {},
            },
            share: {},
            assets: {
              activeEditor: {},
            },
          },
        },
        audio: {
          view: "list",
          panel: "sounds",
          panels: {
            sounds: {
              scrollIndex: 0,
              activeEditor: {},
            },
            music: {
              scrollIndex: 0,
              activeEditor: {},
            },
          },
        },
        displays: {
          view: "list",
          panel: "widgets",
          panels: {
            widgets: {
              scrollIndex: 0,
              activeEditor: {},
            },
            views: {
              scrollIndex: 0,
              activeEditor: {},
            },
          },
        },
        graphics: {
          view: "list",
          panel: "sprites",
          panels: {
            sprites: {
              scrollIndex: 0,
              activeEditor: {},
            },
            maps: {
              scrollIndex: 0,
              activeEditor: {},
            },
          },
        },
        logic: {
          view: "list",
          panel: "main",
          panels: {
            main: {
              scrollIndex: 0,
              activeEditor: {
                open: true,
                filename: "main.script",
              },
            },
            scripts: {
              scrollIndex: 0,
              activeEditor: {},
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
        const { textDocument, visibleRange } = message.params;
        const uri = textDocument.uri;
        const filename = uri.split("/").slice(-1).join("");
        const pane = this.getPaneType(filename);
        const panel = this.getPanelType(filename);
        if (pane && panel) {
          const panelState = this.getPanelState(pane, panel);
          panelState.activeEditor ??= {};
          panelState.activeEditor.visibleRange = JSON.parse(
            JSON.stringify(visibleRange)
          );
        }
      }
    }
  };

  protected handleSelectedEditor = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (SelectedEditorMessage.type.isNotification(message)) {
        const { textDocument, selectedRange } = message.params;
        const uri = textDocument.uri;
        const filename = uri.split("/").slice(-1).join("");
        const pane = this.getPaneType(filename);
        const panel = this.getPanelType(filename);
        if (pane && panel) {
          const panelState = this.getPanelState(pane, panel);
          panelState.activeEditor ??= {};
          panelState.activeEditor.selectedRange = JSON.parse(
            JSON.stringify(selectedRange)
          );
        }
      }
    }
  };

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

  getPaneType(filename: string) {
    const [, ext] = filename.split(".");
    if (ext === "sound" || ext === "music") {
      return "audio";
    }
    if (ext === "widget" || ext === "view") {
      return "displays";
    }
    if (ext === "sprite" || ext === "map") {
      return "graphics";
    }
    if (ext === "script") {
      return "logic";
    }
    return null;
  }

  getPanelType(filename: string) {
    const [, ext] = filename.split(".");
    if (filename === "main.script") {
      return "main";
    }
    if (ext === "sound") {
      return "sounds";
    }
    if (ext === "music") {
      return "music";
    }
    if (ext === "widget") {
      return "widgets";
    }
    if (ext === "view") {
      return "views";
    }
    if (ext === "sprite") {
      return "sprites";
    }
    if (ext === "map") {
      return "maps";
    }
    if (ext === "script") {
      return "scripts";
    }
    return null;
  }

  async getActiveEditor(
    projectId: string,
    filename: string
  ): Promise<
    | {
        uri: string;
        name: string;
        src: string;
        ext: string;
        type: string;
        version: number;
        text?: string | undefined;
        program?: SparkProgram | undefined;
        visibleRange: Range | undefined;
        selectedRange: Range | undefined;
      }
    | undefined
  > {
    const pane = this.getPaneType(filename);
    const panel = this.getPanelType(filename);
    if (pane && panel) {
      const panelState = this.getPanelState(pane, panel);
      if (
        panelState.activeEditor &&
        panelState.activeEditor.filename === filename
      ) {
        const files = await Workspace.fs.getFiles();
        const uri = Workspace.fs.getFileUri(projectId, filename);
        const file = files[uri]!;
        return {
          visibleRange: panelState.activeEditor.visibleRange,
          selectedRange: panelState.activeEditor.selectedRange,
          ...file,
          uri,
        };
      }
    }
    return undefined;
  }

  async getOpenEditor(
    projectId: string,
    pane: string,
    panel?: string
  ): Promise<
    | {
        uri: string;
        name: string;
        src: string;
        ext: string;
        type: string;
        version: number;
        text?: string | undefined;
        program?: SparkProgram | undefined;
        visibleRange: Range | undefined;
        selectedRange: Range | undefined;
      }
    | undefined
  > {
    const paneState = this.getPaneState(pane);
    const openEditor = panel
      ? this.getPanelState(pane, panel).activeEditor
      : Object.values(paneState.panels)
          .map((p) => p.activeEditor)
          .find((e) => e && e.open);
    if (openEditor?.open && openEditor?.filename) {
      const files = await Workspace.fs.getFiles();
      const uri = Workspace.fs.getFileUri(projectId, openEditor.filename);
      const file = files[uri]!;
      return {
        visibleRange: openEditor.visibleRange,
        selectedRange: openEditor.selectedRange,
        ...file,
        uri,
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

  openedPane(pane: string) {
    this.getPaneState(pane);
    this._state.pane = pane;
    this.emit(
      DidOpenPaneMessage.method,
      DidOpenPaneMessage.type.notification({ pane })
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

  openedFileEditor(filename: string) {
    const pane = this.getPaneType(filename);
    const panel = this.getPanelType(filename);
    if (pane && panel) {
      const panelState = this.getPanelState(pane, panel);
      panelState.activeEditor ??= {};
      panelState.activeEditor.open = true;
      if (panelState.activeEditor.filename !== filename) {
        panelState.activeEditor.filename = filename;
        panelState.activeEditor.visibleRange = {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        };
        panelState.activeEditor.selectedRange = undefined;
      }
      this.emit(
        DidOpenFileEditorMessage.method,
        DidOpenFileEditorMessage.type.notification({ pane, panel, filename })
      );
    }
  }

  closedFileEditor(filename: string) {
    const pane = this.getPaneType(filename);
    const panel = this.getPanelType(filename);
    if (pane && panel) {
      const panelState = this.getPanelState(pane, panel);
      if (panelState.activeEditor) {
        panelState.activeEditor.open = false;
      }
      this.emit(
        DidCloseFileEditorMessage.method,
        DidCloseFileEditorMessage.type.notification({ pane, panel })
      );
    }
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

  enableDebugging() {
    this._state.panes.preview.panels.game.debugging = true;
    this.emit(
      EnableGameDebugMessage.method,
      EnableGameDebugMessage.type.request({})
    );
  }

  disableDebugging() {
    this._state.panes.preview.panels.game.debugging = false;
    this.emit(
      DisableGameDebugMessage.method,
      DisableGameDebugMessage.type.request({})
    );
  }

  changePersistenceState(state: string) {
    this._state.header.persistenceState = state;
    this.emit(
      ChangedHeaderInfoMessage.method,
      ChangedHeaderInfoMessage.type.notification({})
    );
  }

  async unloadedProject() {
    this._state.header.editingProjectName = false;
    this._state.header.projectName = undefined;
    this.emit(
      ChangedHeaderInfoMessage.method,
      ChangedHeaderInfoMessage.type.notification({})
    );
  }

  async loadedProject(projectId: string) {
    const name = await Workspace.fs.readProjectName(projectId);
    this._state.header.editingProjectName = false;
    this._state.header.projectName = name;
    this.emit(
      ChangedHeaderInfoMessage.method,
      ChangedHeaderInfoMessage.type.notification({ name })
    );
  }

  startEditingProjectName() {
    this._state.header.editingProjectName = true;
    this.emit(
      WillEditProjectNameMessage.method,
      WillEditProjectNameMessage.type.notification({})
    );
  }

  async finishEditingProjectName(projectId: string, name: string) {
    this._state.header.editingProjectName = false;
    this._state.header.projectName = name;
    await Workspace.fs.writeProjectName(projectId, name);
    this.emit(
      DidEditProjectNameMessage.method,
      DidEditProjectNameMessage.type.notification({ name })
    );
  }

  blockInteractions() {
    this.emit(
      WillBlockInteractionsMessage.method,
      WillBlockInteractionsMessage.type.request({})
    );
  }

  unblockInteractions() {
    this.emit(
      WillUnblockInteractionsMessage.method,
      WillUnblockInteractionsMessage.type.request({})
    );
  }
}
