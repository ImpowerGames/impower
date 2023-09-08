import { ScrolledEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import { SelectedEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import { DisableGameDebugMessage } from "@impower/spark-editor-protocol/src/protocols/game/DisableGameDebugMessage";
import { EnableGameDebugMessage } from "@impower/spark-editor-protocol/src/protocols/game/EnableGameDebugMessage";
import { PauseGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/PauseGameMessage";
import { StartGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StartGameMessage";
import { StepGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StepGameMessage";
import { StopGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StopGameMessage";
import { UnpauseGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/UnpauseGameMessage";
import { DidCloseFileEditorMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidCloseFileEditorMessage";
import { DidCollapsePreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidCollapsePreviewPaneMessage";
import { DidExpandPreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidExpandPreviewPaneMessage";
import { DidOpenFileEditorMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenFileEditorMessage";
import { DidOpenPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenPaneMessage";
import { DidOpenPanelMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenPanelMessage";
import { DidOpenViewMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenViewMessage";
import { DidChangeProjectStateMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeProjectStateMessage";
import {
  Range,
  WorkspaceState,
} from "@impower/spark-editor-protocol/src/types";
import { SparkProgram } from "../../../../../packages/sparkdown/src";
import SingletonPromise from "./SingletonPromise";
import { Workspace } from "./Workspace";
import { ReadOnly } from "./types/ReadOnly";
import { Storage } from "./types/StorageTypes";

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
    this._state.project.canModifyRemote = false;
    this._state.project.editingName = false;
    this.emit(
      DidChangeProjectStateMessage.method,
      DidChangeProjectStateMessage.type.notification({
        changed: ["id", "name", "syncState", "canModifyRemote", "editingName"],
        state: this._state.project,
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
        this._state.project.canModifyRemote = false;
        this._state.project.syncState = "cached";
        this.emit(
          DidChangeProjectStateMessage.method,
          DidChangeProjectStateMessage.type.notification({
            changed: [
              "id",
              "name",
              "canModifyRemote",
              "syncState",
              "editingName",
            ],
            state: this._state.project,
          })
        );
      } else {
        await this.syncProject(false);
      }
      this.cacheProjectId(id);
      return id;
    } catch (err) {
      console.warn(err);
      this._state.project.syncState = "load_error";
      this.emit(
        DidChangeProjectStateMessage.method,
        DidChangeProjectStateMessage.type.notification({
          changed: ["syncState"],
          state: this._state.project,
        })
      );
    }
    return undefined;
  }

  async syncProject(pushLocalChanges = true) {
    try {
      const id = this._state.project.id;
      if (id) {
        this._state.project.syncState = "syncing";
        this.emit(
          DidChangeProjectStateMessage.method,
          DidChangeProjectStateMessage.type.notification({
            changed: ["syncState"],
            state: this._state.project,
          })
        );
        const files = await Workspace.fs.getFiles();
        // TODO: Bundle scripts before saving
        const filename = "main.script";
        const uri = Workspace.fs.getFileUri(id, filename);
        const localProjectData = files[uri];
        const remoteProjectFile = await Workspace.sync.google.getFile(id);
        if (remoteProjectFile) {
          const localProjectName = await Workspace.fs.readProjectName(id);
          const localMetadata = await Workspace.fs.readProjectMetadata(id);
          const remoteProjectContent = remoteProjectFile.text;
          const remoteChanged =
            remoteProjectContent != null &&
            remoteProjectFile.headRevisionId !== localMetadata.headRevisionId;
          const localProjectContent = localProjectData?.text;
          const localChanged =
            localProjectContent != null && !localMetadata.synced;
          const localProjectFile = {
            id,
            name: `${localProjectName}.pkg`,
            text: localProjectContent,
            headRevisionId: localMetadata.headRevisionId,
            modifiedTime: localMetadata.modifiedTime,
          };
          if (!remoteChanged && localChanged) {
            const canModifyRemote = Boolean(
              remoteProjectFile.capabilities?.canModifyContent
            );
            if (canModifyRemote && pushLocalChanges) {
              await this.pushLocalChanges(localProjectFile);
            } else {
              this._state.project.name = localProjectName;
              this._state.project.canModifyRemote = canModifyRemote;
              this._state.project.syncState = "unsaved";
              this.emit(
                DidChangeProjectStateMessage.method,
                DidChangeProjectStateMessage.type.notification({
                  changed: ["name", "canModifyRemote", "syncState"],
                  state: this._state.project,
                })
              );
            }
          } else if (remoteChanged && !localChanged) {
            await this.pullRemoteChanges(remoteProjectFile);
          } else if (remoteChanged && localChanged) {
            await this.requireConflictResolution(
              localProjectFile,
              remoteProjectFile
            );
          } else {
            await this.setupProject(localProjectFile, remoteProjectFile);
          }
        } else {
          this._state.project.syncState = "sync_error";
          this.emit(
            DidChangeProjectStateMessage.method,
            DidChangeProjectStateMessage.type.notification({
              changed: ["syncState"],
              state: this._state.project,
            })
          );
        }
        this._state.project.syncedAt = new Date().toISOString();
        this.emit(
          DidChangeProjectStateMessage.method,
          DidChangeProjectStateMessage.type.notification({
            changed: ["syncedAt"],
            state: this._state.project,
          })
        );
      }
    } catch (err: any) {
      console.error(err);
      this._state.project.syncState = "sync_error";
      this.emit(
        DidChangeProjectStateMessage.method,
        DidChangeProjectStateMessage.type.notification({
          changed: ["syncState"],
          state: this._state.project,
        })
      );
    }
  }

  async pushLocalChanges(
    localProjectFile: Storage.File & {
      text?: string | undefined;
    }
  ) {
    const id = localProjectFile.id!;
    const remoteProjectFile = await Workspace.sync.google.updateProjectFile(
      id,
      localProjectFile.name!,
      localProjectFile.text!
    );
    const remoteName = remoteProjectFile.name!.split(".")[0]!;
    await Workspace.fs.writeProjectName(id, remoteName);
    await Workspace.fs.writeProjectMetadata(id, {
      headRevisionId: remoteProjectFile.headRevisionId!,
      modifiedTime: remoteProjectFile.modifiedTime!,
      synced: true,
    });
    const canModifyRemote = Boolean(
      remoteProjectFile.capabilities?.canModifyContent
    );
    this._state.project.name = remoteName;
    this._state.project.canModifyRemote = canModifyRemote;
    this._state.project.syncState = canModifyRemote ? "saved" : "cached";
    this.emit(
      DidChangeProjectStateMessage.method,
      DidChangeProjectStateMessage.type.notification({
        changed: ["name", "canModifyRemote", "syncState"],
        state: this._state.project,
      })
    );
    return remoteProjectFile;
  }

  async pullRemoteChanges(
    remoteProjectFile: Storage.File & {
      text?: string | undefined;
    }
  ) {
    const id = remoteProjectFile.id!;
    await Workspace.fs.writeProjectContent(id, remoteProjectFile.text || "");
    const remoteProjectName = remoteProjectFile.name!.split(".")[0]!;
    await Workspace.fs.writeProjectName(id, remoteProjectName);
    await Workspace.fs.writeProjectMetadata(id, {
      headRevisionId: remoteProjectFile.headRevisionId!,
      modifiedTime: remoteProjectFile.modifiedTime!,
      synced: true,
    });
    const canModifyRemote = Boolean(
      remoteProjectFile.capabilities?.canModifyContent
    );
    this._state.project.name = remoteProjectName;
    this._state.project.canModifyRemote = canModifyRemote;
    this._state.project.syncState = canModifyRemote ? "saved" : "cached";
    this.emit(
      DidChangeProjectStateMessage.method,
      DidChangeProjectStateMessage.type.notification({
        changed: ["name", "canModifyRemote", "syncState"],
        state: this._state.project,
      })
    );
  }

  async requireConflictResolution(
    localProjectFile: Storage.File & {
      text?: string | undefined;
    },
    remoteProjectFile: Storage.File & {
      text?: string | undefined;
    }
  ) {
    const localProjectName = localProjectFile.name!.split(".")[0]!;
    const remoteProjectName = remoteProjectFile.name!.split(".")[0]!;
    this._state.project.name = localProjectName || remoteProjectName;
    this._state.project.conflict ??= {};
    this._state.project.conflict.local = {
      name: localProjectName,
      content: localProjectFile.text!,
      modifiedTime: localProjectFile.modifiedTime!,
    };
    this._state.project.conflict.remote = {
      name: remoteProjectName,
      content: remoteProjectFile.text!,
      modifiedTime: remoteProjectFile.modifiedTime!,
    };
    this._state.project.syncState = "sync_conflict";
    console.log(
      this._state.project.conflict.local,
      this._state.project.conflict.remote
    );
    this.emit(
      DidChangeProjectStateMessage.method,
      DidChangeProjectStateMessage.type.notification({
        changed: ["syncState"],
        state: this._state.project,
      })
    );
  }

  async setupProject(
    localProjectFile: Storage.File & {
      text?: string | undefined;
    },
    remoteProjectFile: Storage.File & {
      text?: string | undefined;
    }
  ) {
    const id = remoteProjectFile.id!;
    const localProjectName = localProjectFile.name!.split(".")[0]!;
    const remoteProjectName = remoteProjectFile.name!.split(".")[0]!;
    const canModifyRemote = Boolean(
      remoteProjectFile.capabilities?.canModifyContent
    );
    if (localProjectName !== remoteProjectName) {
      await Workspace.fs.writeProjectName(id, remoteProjectName);
    }
    if (localProjectFile.headRevisionId !== remoteProjectFile.headRevisionId) {
      await Workspace.fs.writeProjectMetadata(id, {
        headRevisionId: remoteProjectFile.headRevisionId!,
        modifiedTime: remoteProjectFile.modifiedTime!,
        synced: true,
      });
    }
    this._state.project.name = remoteProjectName;
    this._state.project.canModifyRemote = canModifyRemote;
    this._state.project.syncState = canModifyRemote ? "saved" : "cached";
    this.emit(
      DidChangeProjectStateMessage.method,
      DidChangeProjectStateMessage.type.notification({
        changed: ["name", "canModifyRemote", "syncState"],
        state: this._state.project,
      })
    );
  }

  async exportProject(folderId: string) {
    try {
      const projectId = this._state.project.id;
      if (projectId) {
        this._state.project.syncState = "exporting";
        this.emit(
          DidChangeProjectStateMessage.method,
          DidChangeProjectStateMessage.type.notification({
            changed: ["syncState"],
            state: this._state.project,
          })
        );
        const projectName = await Workspace.fs.readProjectName(projectId);
        const projectContent = await Workspace.fs.readProjectContent(projectId);
        const projectFilename = `${projectName}.project`;
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
            modifiedTime: remoteProjectFile.modifiedTime!,
            synced: true,
          });
          this.loadNewProject(remoteProjectFile.id);
        } else {
          this._state.project.syncState = "cached";
          this.emit(
            DidChangeProjectStateMessage.method,
            DidChangeProjectStateMessage.type.notification({
              changed: ["syncState"],
              state: this._state.project,
            })
          );
        }
      }
    } catch (err: any) {
      console.error(err);
      this._state.project.syncState = "export_error";
      this.emit(
        DidChangeProjectStateMessage.method,
        DidChangeProjectStateMessage.type.notification({
          changed: ["syncState"],
          state: this._state.project,
        })
      );
    }
  }

  async updateModificationTime() {
    const projectId = this._state.project.id;
    const canModifyRemote = this._state.project.canModifyRemote;
    if (projectId) {
      const metadata = await Workspace.fs.readProjectMetadata(projectId);
      metadata.modifiedTime = new Date().toISOString();
      metadata.synced = false;
      await Workspace.fs.writeProjectMetadata(projectId, metadata);
      this._state.project.syncState = canModifyRemote ? "unsaved" : "cached";
      this.emit(
        DidChangeProjectStateMessage.method,
        DidChangeProjectStateMessage.type.notification({
          changed: ["syncState"],
          state: this._state.project,
        })
      );
    }
  }

  startEditingProjectName() {
    this._state.project.editingName = true;
    this.emit(
      DidChangeProjectStateMessage.method,
      DidChangeProjectStateMessage.type.notification({
        changed: ["editingName"],
        state: this._state.project,
      })
    );
  }

  async finishEditingProjectName(name: string) {
    const id = this._state.project.id;
    if (id) {
      this._state.project.editingName = false;
      this.emit(
        DidChangeProjectStateMessage.method,
        DidChangeProjectStateMessage.type.notification({
          changed: ["editingName"],
          state: this._state.project,
        })
      );
      let changedName = name !== this._state.project.name;
      if (changedName) {
        await Workspace.fs.writeProjectName(id, name);
        this._state.project.name = name;
        this.emit(
          DidChangeProjectStateMessage.method,
          DidChangeProjectStateMessage.type.notification({
            changed: ["name"],
            state: this._state.project,
          })
        );
        await this.updateModificationTime();
      }
      return changedName;
    }
    return false;
  }
}
