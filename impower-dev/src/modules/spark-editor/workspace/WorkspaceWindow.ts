import { ScrolledEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import { SelectedEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import { DisableGameDebugMessage } from "@impower/spark-editor-protocol/src/protocols/game/DisableGameDebugMessage";
import { EnableGameDebugMessage } from "@impower/spark-editor-protocol/src/protocols/game/EnableGameDebugMessage";
import { PauseGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/PauseGameMessage";
import { StartGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StartGameMessage";
import { StepGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StepGameMessage";
import { StopGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StopGameMessage";
import { UnpauseGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/UnpauseGameMessage";
import { ChangedProjectStateMessage } from "@impower/spark-editor-protocol/src/protocols/window/ChangedProjectStateMessage";
import { DidCloseFileEditorMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidCloseFileEditorMessage";
import { DidCollapsePreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidCollapsePreviewPaneMessage";
import { DidExpandPreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidExpandPreviewPaneMessage";
import { DidOpenFileEditorMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenFileEditorMessage";
import { DidOpenPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenPaneMessage";
import { DidOpenPanelMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenPanelMessage";
import { DidOpenViewMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenViewMessage";
import { Range } from "@impower/spark-editor-protocol/src/types";
import { SparkProgram } from "../../../../../packages/sparkdown/src";
import SingletonPromise from "./SingletonPromise";
import { Workspace } from "./Workspace";
import { ReadOnly } from "./types/ReadOnly";
import { SyncState, WorkspaceState } from "./types/WorkspaceState";

const CURRENT_PROJECT_ID_LOOKUP = "project";

export default class WorkspaceWindow {
  protected _state: WorkspaceState;
  get state(): ReadOnly<WorkspaceState> {
    return this._state;
  }

  protected _loadProjectRef = new SingletonPromise(
    this._loadProject.bind(this)
  );

  constructor() {
    const cachedProjectId = localStorage.getItem(CURRENT_PROJECT_ID_LOOKUP);
    const id = cachedProjectId || Workspace.LOCAL_PROJECT_ID;
    this._state = {
      project: { id },
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

  protected cacheProjectId(id: string) {
    this._state.project.id = id;
    localStorage.setItem(CURRENT_PROJECT_ID_LOOKUP, id);
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

  async getActiveEditor(filename: string): Promise<
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
    const projectId = this._state.project.id;
    if (projectId) {
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
    }
    return undefined;
  }

  async getOpenEditor(
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
    const projectId = this._state.project.id;
    if (projectId) {
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

  unloadProject() {
    const id = Workspace.LOCAL_PROJECT_ID;
    this._state.project.id = id;
    this._state.project.name = undefined;
    this._state.project.syncState = "loading";
    this._state.project.canSync = false;
    this._state.project.editingName = false;
    this.emit(
      ChangedProjectStateMessage.method,
      ChangedProjectStateMessage.type.notification({
        props: ["id", "name", "syncState", "canSync", "editingName"],
      })
    );
  }

  loadNewProject(id: string) {
    this.cacheProjectId(id);
    location.reload();
  }

  async loadProject() {
    return this._loadProjectRef.get();
  }

  protected async _loadProject() {
    try {
      const id = this._state.project.id || Workspace.LOCAL_PROJECT_ID;
      if (id === Workspace.LOCAL_PROJECT_ID) {
        const name = await Workspace.fs.readProjectName(id);
        this._state.project.id = id;
        this._state.project.editingName = false;
        this._state.project.name = name;
        this._state.project.canSync = false;
        this._state.project.syncState = "cached";
        this.emit(
          ChangedProjectStateMessage.method,
          ChangedProjectStateMessage.type.notification({
            props: ["id", "name", "canSync", "syncState", "editingName"],
          })
        );
      } else {
        await this.syncProject();
      }
      this.cacheProjectId(id);
      return id;
    } catch (err) {
      console.warn(err);
      this.setSyncState("load_error");
    }
    return undefined;
  }

  async syncProject() {
    try {
      const id = this._state.project.id;
      if (id) {
        this.setSyncState("syncing");
        const files = await Workspace.fs.getFiles();
        // TODO: Bundle scripts before saving
        const filename = "main.script";
        const uri = Workspace.fs.getFileUri(id, filename);
        const localProjectFile = files[uri];
        let remoteProjectFile = await Workspace.sync.google.getFile(id);
        if (remoteProjectFile && remoteProjectFile.id) {
          const localName = await Workspace.fs.readProjectName(id);
          const localMetadata = await Workspace.fs.readProjectMetadata(id);
          const remoteProjectContent = remoteProjectFile.data;
          const remoteChanged =
            remoteProjectContent != null &&
            remoteProjectFile.headRevisionId !== localMetadata.headRevisionId;
          const localProjectContent = localProjectFile?.text;
          const localChanged =
            localProjectContent != null && !localMetadata.synced;
          if (remoteChanged && !localChanged) {
            await Workspace.fs.writeProjectContent(id, remoteProjectContent);
            const remoteName = remoteProjectFile.name!.split(".")[0]!;
            await Workspace.fs.writeProjectName(id, remoteName);
            await Workspace.fs.writeProjectMetadata(id, {
              headRevisionId: remoteProjectFile.headRevisionId,
              remoteModifiedTime: Date.parse(remoteProjectFile.modifiedTime!),
              localModifiedTime: Date.parse(remoteProjectFile.modifiedTime!),
              synced: true,
            });
            const canSync = Boolean(
              remoteProjectFile.capabilities?.canModifyContent
            );
            this._state.project.name = remoteName;
            this._state.project.canSync = canSync;
            this._state.project.syncState = canSync ? "saved" : "cached";
            this.setSyncState("saved");
            this.emit(
              ChangedProjectStateMessage.method,
              ChangedProjectStateMessage.type.notification({
                props: ["name", "canSync", "syncState"],
              })
            );
          } else if (!remoteChanged && localChanged) {
            remoteProjectFile = await Workspace.sync.google.updateProjectFile(
              id,
              `${localName}.sd`,
              localProjectContent
            );
            const remoteName = remoteProjectFile.name!.split(".")[0]!;
            await Workspace.fs.writeProjectName(id, remoteName);
            await Workspace.fs.writeProjectMetadata(id, {
              headRevisionId: remoteProjectFile.headRevisionId,
              remoteModifiedTime: Date.parse(remoteProjectFile.modifiedTime!),
              localModifiedTime: Date.parse(remoteProjectFile.modifiedTime!),
              synced: true,
            });
            const canSync = Boolean(
              remoteProjectFile.capabilities?.canModifyContent
            );
            this._state.project.name = remoteName;
            this._state.project.canSync = canSync;
            this._state.project.syncState = canSync ? "saved" : "cached";
            this.setSyncState("saved");
            this.emit(
              ChangedProjectStateMessage.method,
              ChangedProjectStateMessage.type.notification({
                props: ["name", "canSync", "syncState"],
              })
            );
          } else if (remoteChanged && localChanged) {
            const remoteName = remoteProjectFile.name!.split(".")[0]!;
            const remoteMetadata = {
              headRevisionId: remoteProjectFile.headRevisionId,
              remoteModifiedTime: Date.parse(remoteProjectFile.modifiedTime!),
              localModifiedTime: Date.parse(remoteProjectFile.modifiedTime!),
              synced: true,
            };
            this._state.project.name = localName || remoteName;
            this._state.project.conflict ??= {};
            this._state.project.conflict.remote = {
              name: remoteName,
              metadata: remoteMetadata,
              content: remoteProjectContent,
            };
            this._state.project.conflict.local = {
              name: localName,
              metadata: localMetadata,
              content: localProjectContent,
            };
            this.setSyncState("sync_conflict");
            this.emit(
              ChangedProjectStateMessage.method,
              ChangedProjectStateMessage.type.notification({
                props: ["syncState"],
              })
            );
          } else {
            const name = remoteProjectFile.name!.split(".")[0]!;
            const canSync = Boolean(
              remoteProjectFile.capabilities?.canModifyContent
            );
            this._state.project.name = name;
            this._state.project.canSync = canSync;
            this._state.project.syncState = canSync ? "saved" : "cached";
            await Workspace.fs.writeProjectName(id, name);
            await Workspace.fs.writeProjectMetadata(id, {
              headRevisionId: remoteProjectFile.headRevisionId,
              remoteModifiedTime: Date.parse(remoteProjectFile.modifiedTime!),
              localModifiedTime: Date.parse(remoteProjectFile.modifiedTime!),
              synced: true,
            });
            this.setSyncState("saved");
            this.emit(
              ChangedProjectStateMessage.method,
              ChangedProjectStateMessage.type.notification({
                props: ["name", "canSync", "syncState"],
              })
            );
          }
        } else {
          this.setSyncState("sync_error");
        }
      }
    } catch (err: any) {
      console.error(err);
      this.setSyncState("sync_error");
    }
  }

  async exportProject(folderId: string) {
    try {
      const projectId = this._state.project.id;
      if (projectId) {
        this.setSyncState("exporting");
        const projectName = await Workspace.fs.readProjectName(projectId);
        const projectContent = await Workspace.fs.readProjectContent(projectId);
        const projectFilename = `${projectName}.sd`;
        const remoteProjectFile = await Workspace.sync.google.createProjectFile(
          folderId,
          projectFilename,
          projectContent
        );
        if (remoteProjectFile && remoteProjectFile.id) {
          await Workspace.fs.writeProjectName(
            remoteProjectFile.id,
            projectName
          );
          await Workspace.fs.writeProjectMetadata(remoteProjectFile.id, {
            headRevisionId: remoteProjectFile.headRevisionId,
            remoteModifiedTime: Date.parse(remoteProjectFile.modifiedTime!),
            localModifiedTime: Date.parse(remoteProjectFile.modifiedTime!),
            synced: true,
          });
          this.loadNewProject(remoteProjectFile.id);
        } else {
          this.setSyncState("cached");
        }
      }
    } catch (err: any) {
      console.error(err);
      this.setSyncState("export_error");
    }
  }

  async requireProjectSync() {
    const projectId = this._state.project.id;
    const canSync = this._state.project.canSync;
    if (projectId && canSync) {
      this.setSyncState("unsaved");
      const metadata = await Workspace.fs.readProjectMetadata(projectId);
      metadata.localModifiedTime = Date.now();
      metadata.synced = false;
      await Workspace.fs.writeProjectMetadata(projectId, metadata);
    }
  }

  protected setSyncState(syncState: SyncState) {
    this._state.project.syncState = syncState;
    this.emit(
      ChangedProjectStateMessage.method,
      ChangedProjectStateMessage.type.notification({ props: ["syncState"] })
    );
  }

  startEditingProjectName() {
    this._state.project.editingName = true;
    this.emit(
      ChangedProjectStateMessage.method,
      ChangedProjectStateMessage.type.notification({
        props: ["editingName"],
      })
    );
  }

  async finishEditingProjectName(name: string) {
    const id = this._state.project.id;
    if (id) {
      this._state.project.editingName = false;
      this.emit(
        ChangedProjectStateMessage.method,
        ChangedProjectStateMessage.type.notification({
          props: ["editingName"],
        })
      );
      let changedName = name !== this._state.project.name;
      if (changedName) {
        await Workspace.fs.writeProjectName(id, name);
        this._state.project.name = name;
        this.emit(
          ChangedProjectStateMessage.method,
          ChangedProjectStateMessage.type.notification({
            props: ["name"],
          })
        );
        if (this._state.project.canSync) {
          await Workspace.window.syncProject();
        }
      }
      return changedName;
    }
    return false;
  }
}
