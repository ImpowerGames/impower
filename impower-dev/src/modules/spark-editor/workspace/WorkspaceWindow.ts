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
import {
  PaneType,
  PanelType,
  Range,
  WorkspaceCache,
} from "@impower/spark-editor-protocol/src/types";
import { SparkProgram } from "../../../../../packages/sparkdown/src";
import SingletonPromise from "./SingletonPromise";
import { Workspace } from "./Workspace";
import { WorkspaceConstants } from "./WorkspaceConstants";
import workspace from "./WorkspaceStore";
import { Storage } from "./types/StorageTypes";

export default class WorkspaceWindow {
  protected _loadProjectRef = new SingletonPromise(
    this._loadProject.bind(this)
  );

  constructor() {
    const cachedProjectId = localStorage.getItem(
      WorkspaceConstants.CURRENT_PROJECT_ID_LOOKUP
    );
    const id = cachedProjectId || WorkspaceConstants.LOCAL_PROJECT_ID;
    this.cacheProjectId(id);
    window.addEventListener(
      ScrolledEditorMessage.method,
      this.handleScrolledEditor
    );
    window.addEventListener(
      SelectedEditorMessage.method,
      this.handleSelectedEditor
    );
  }

  get store() {
    return workspace.current;
  }

  protected update(store: WorkspaceCache) {
    workspace.current = store;
  }

  protected cacheProjectId(id: string) {
    this.update({
      ...this.store,
      project: { ...this.store.project, id },
    });
    localStorage.setItem(WorkspaceConstants.CURRENT_PROJECT_ID_LOOKUP, id);
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
          this.update({
            ...this.store,
            panes: {
              ...this.store.panes,
              [pane]: {
                ...this.store.panes[pane],
                panels: {
                  ...this.store.panes[pane].panels,
                  [panel]: {
                    ...this.store.panes[pane].panels[panel],
                    activeEditor: {
                      ...this.store.panes[pane].panels[panel]!.activeEditor,
                      visibleRange,
                    },
                  },
                },
              },
            },
          });
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
          this.update({
            ...this.store,
            panes: {
              ...this.store.panes,
              [pane]: {
                ...this.store.panes[pane],
                panels: {
                  ...this.store.panes[pane].panels,
                  [panel]: {
                    ...this.store.panes[pane].panels[panel],
                    activeEditor: {
                      ...this.store.panes[pane].panels[panel]!.activeEditor,
                      selectedRange,
                    },
                  },
                },
              },
            },
          });
        }
      }
    }
  };

  getPaneState(pane: PaneType) {
    const paneState = this.store.panes[pane];
    if (!paneState) {
      throw new Error(`Pane type not recognized: ${pane}`);
    }
    return paneState;
  }

  getPanelState(pane: PaneType, panel: PanelType) {
    const paneState = this.getPaneState(pane);
    const panelState = paneState.panels[panel];
    if (!panelState) {
      throw new Error(`Panel type not recognized: ${panel}`);
    }
    return panelState;
  }

  getOpenedPanel(pane: PaneType) {
    const paneState = this.getPaneState(pane);
    return paneState.panel;
  }

  getOpenedPanelState(pane: PaneType) {
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
    const projectId = this.store.project.id;
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
    pane: PaneType,
    panel?: PanelType
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
    const projectId = this.store.project.id;
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

  openedPane(pane: PaneType) {
    this.update({
      ...this.store,
      pane,
    });
    this.emit(
      DidOpenPaneMessage.method,
      DidOpenPaneMessage.type.notification({ pane })
    );
  }

  openedPanel(pane: PaneType, panel: PanelType) {
    this.update({
      ...this.store,
      panes: {
        ...this.store.panes,
        [pane]: {
          ...this.store.panes[pane],
          panel,
        },
      },
    });
    this.emit(
      DidOpenPanelMessage.method,
      DidOpenPanelMessage.type.notification({ pane, panel })
    );
  }

  openedView(pane: PaneType, view: string) {
    this.update({
      ...this.store,
      panes: {
        ...this.store.panes,
        [pane]: {
          ...this.store.panes[pane],
          view,
        },
      },
    });
    this.emit(
      DidOpenViewMessage.method,
      DidOpenViewMessage.type.notification({ pane, view })
    );
  }

  openedFileEditor(filename: string) {
    const pane = this.getPaneType(filename);
    const panel = this.getPanelType(filename);
    if (pane && panel) {
      const activeEditor = this.store.panes[pane].panels[panel]?.activeEditor;
      const didFileChange = activeEditor && activeEditor.filename !== filename;
      const visibleRange = didFileChange
        ? {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          }
        : activeEditor?.visibleRange;
      const selectedRange = didFileChange
        ? undefined
        : activeEditor?.selectedRange;
      this.update({
        ...this.store,
        panes: {
          ...this.store.panes,
          [pane]: {
            ...this.store.panes[pane],
            panels: {
              ...this.store.panes[pane].panels,
              [panel]: {
                ...this.store.panes[pane].panels[panel],
                activeEditor: {
                  ...this.store.panes[pane].panels[panel]!.activeEditor,
                  open: true,
                  filename,
                  visibleRange,
                  selectedRange,
                },
              },
            },
          },
        },
      });
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
      this.update({
        ...this.store,
        panes: {
          ...this.store.panes,
          [pane]: {
            ...this.store.panes[pane],
            panels: {
              ...this.store.panes[pane].panels,
              [panel]: {
                ...this.store.panes[pane].panels[panel],
                activeEditor: {
                  ...this.store.panes[pane].panels[panel]!.activeEditor,
                  open: false,
                },
              },
            },
          },
        },
      });
      this.emit(
        DidCloseFileEditorMessage.method,
        DidCloseFileEditorMessage.type.notification({ pane, panel })
      );
    }
  }

  expandedPreviewPane() {
    this.update({
      ...this.store,
      preview: {
        ...this.store.preview,
        revealed: true,
      },
    });
    this.emit(
      DidExpandPreviewPaneMessage.method,
      DidExpandPreviewPaneMessage.type.notification({})
    );
  }

  collapsedPreviewPane() {
    this.update({
      ...this.store,
      preview: {
        ...this.store.preview,
        revealed: false,
      },
    });
    this.emit(
      DidCollapsePreviewPaneMessage.method,
      DidCollapsePreviewPaneMessage.type.notification({})
    );
  }

  startedEditingProjectName() {
    this.update({
      ...this.store,
      project: {
        ...this.store.project,
        editingName: true,
      },
    });
  }

  async finishedEditingProjectName(name: string) {
    const id = this.store.project.id;
    if (id) {
      this.update({
        ...this.store,
        project: {
          ...this.store.project,
          editingName: false,
        },
      });
      let changedName = name !== this.store.project.name;
      if (changedName) {
        await Workspace.fs.writeProjectName(id, name);
        this.update({
          ...this.store,
          project: {
            ...this.store.project,
            name,
          },
        });
        await this.updateModificationTime();
      }
      return changedName;
    }
    return false;
  }

  startGame() {
    this.update({
      ...this.store,
      preview: {
        ...this.store.preview,
        modes: {
          ...this.store.preview.modes,
          game: {
            ...this.store.preview.modes.game,
            running: true,
          },
        },
      },
    });
    this.emit(StartGameMessage.method, StartGameMessage.type.request({}));
    if (this.store.preview.modes.game.paused) {
      this.unpauseGame();
    }
  }

  stopGame() {
    this.update({
      ...this.store,
      preview: {
        ...this.store.preview,
        modes: {
          ...this.store.preview.modes,
          game: {
            ...this.store.preview.modes.game,
            running: false,
          },
        },
      },
    });
    this.emit(StopGameMessage.method, StopGameMessage.type.request({}));
  }

  pauseGame() {
    this.update({
      ...this.store,
      preview: {
        ...this.store.preview,
        modes: {
          ...this.store.preview.modes,
          game: {
            ...this.store.preview.modes.game,
            paused: true,
          },
        },
      },
    });
    this.emit(PauseGameMessage.method, PauseGameMessage.type.request({}));
  }

  unpauseGame() {
    this.update({
      ...this.store,
      preview: {
        ...this.store.preview,
        modes: {
          ...this.store.preview.modes,
          game: {
            ...this.store.preview.modes.game,
            paused: false,
          },
        },
      },
    });
    this.emit(UnpauseGameMessage.method, UnpauseGameMessage.type.request({}));
  }

  stepGame(deltaMS: number) {
    if (deltaMS < 0) {
      const paused = this.store.preview.modes.game.paused;
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
    if (this.store.preview.modes.game.running) {
      this.stopGame();
    } else {
      this.startGame();
    }
  }

  toggleGamePaused() {
    if (this.store.preview.modes.game.paused) {
      this.unpauseGame();
    } else {
      this.pauseGame();
    }
  }

  enableDebugging() {
    this.update({
      ...this.store,
      preview: {
        ...this.store.preview,
        modes: {
          ...this.store.preview.modes,
          game: {
            ...this.store.preview.modes.game,
            debugging: true,
          },
        },
      },
    });
    this.emit(
      EnableGameDebugMessage.method,
      EnableGameDebugMessage.type.request({})
    );
  }

  disableDebugging() {
    this.update({
      ...this.store,
      preview: {
        ...this.store.preview,
        modes: {
          ...this.store.preview.modes,
          game: {
            ...this.store.preview.modes.game,
            debugging: false,
          },
        },
      },
    });
    this.emit(
      DisableGameDebugMessage.method,
      DisableGameDebugMessage.type.request({})
    );
  }

  unloadProject() {
    const id = WorkspaceConstants.LOCAL_PROJECT_ID;
    this.update({
      ...this.store,
      project: {
        ...this.store.project,
        id,
        name: undefined,
        syncState: "loading",
        canModifyRemote: false,
        editingName: false,
      },
    });
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
      const id = this.store.project.id || WorkspaceConstants.LOCAL_PROJECT_ID;
      if (id === WorkspaceConstants.LOCAL_PROJECT_ID) {
        const name = await Workspace.fs.readProjectName(id);
        this.update({
          ...this.store,
          project: {
            ...this.store.project,
            id,
            name,
            syncState: "cached",
            canModifyRemote: false,
            editingName: false,
          },
        });
      } else {
        await this.syncProject(false);
      }
      this.cacheProjectId(id);
      return id;
    } catch (err) {
      console.error(err);
      this.update({
        ...this.store,
        project: {
          ...this.store.project,
          syncState: "load_error",
        },
      });
    }
    return undefined;
  }

  async syncProject(pushLocalChanges = true) {
    try {
      const id = this.store.project.id;
      if (id) {
        this.update({
          ...this.store,
          project: {
            ...this.store.project,
            syncState: "syncing",
          },
        });
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
            name: `${localProjectName}.project`,
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
              this.update({
                ...this.store,
                project: {
                  ...this.store.project,
                  name: localProjectName,
                  canModifyRemote,
                  syncState: "unsaved",
                },
              });
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
          console.error(`Could not fetch remote project file: ${id}`);
          const name = await Workspace.fs.readProjectName(id);
          this.update({
            ...this.store,
            project: {
              ...this.store.project,
              name,
              syncState: "offline",
            },
          });
        }
      }
    } catch (err: any) {
      console.error(err);
      this.update({
        ...this.store,
        project: {
          ...this.store.project,
          syncState: "sync_error",
        },
      });
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
    this.update({
      ...this.store,
      project: {
        ...this.store.project,
        name: remoteName,
        canModifyRemote,
        syncState: canModifyRemote ? "synced" : "cached",
      },
    });
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
    this.update({
      ...this.store,
      project: {
        ...this.store.project,
        name: remoteProjectName,
        canModifyRemote,
        syncState: canModifyRemote ? "synced" : "cached",
        pulledAt: new Date().toISOString(),
      },
    });
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
    this.update({
      ...this.store,
      project: {
        ...this.store.project,
        name: localProjectName || remoteProjectName,
        conflict: {
          local: {
            name: localProjectName,
            content: localProjectFile.text!,
            modifiedTime: localProjectFile.modifiedTime!,
          },
          remote: {
            name: remoteProjectName,
            content: remoteProjectFile.text!,
            modifiedTime: remoteProjectFile.modifiedTime!,
          },
        },
        syncState: "sync_conflict",
      },
    });
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
    this.update({
      ...this.store,
      project: {
        ...this.store.project,
        name: remoteProjectName,
        canModifyRemote,
        syncState: canModifyRemote ? "synced" : "cached",
      },
    });
  }

  async exportProject(folderId: string) {
    try {
      const projectId = this.store.project.id;
      if (projectId) {
        this.update({
          ...this.store,
          project: {
            ...this.store.project,
            syncState: "exporting",
          },
        });
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
          this.update({
            ...this.store,
            project: {
              ...this.store.project,
              syncState: "cached",
            },
          });
        }
      }
    } catch (err: any) {
      console.error(err);
      this.update({
        ...this.store,
        project: {
          ...this.store.project,
          syncState: "export_error",
        },
      });
    }
  }

  async updateModificationTime() {
    const projectId = this.store.project.id;
    const canModifyRemote = this.store.project.canModifyRemote;
    if (projectId) {
      const metadata = await Workspace.fs.readProjectMetadata(projectId);
      metadata.modifiedTime = new Date().toISOString();
      metadata.synced = false;
      await Workspace.fs.writeProjectMetadata(projectId, metadata);
      this.update({
        ...this.store,
        project: {
          ...this.store.project,
          syncState: canModifyRemote ? "unsaved" : "cached",
        },
      });
    }
  }
}
