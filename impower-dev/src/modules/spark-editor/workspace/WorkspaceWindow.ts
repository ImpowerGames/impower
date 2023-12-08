import { RevealEditorRangeMessage } from "@impower/spark-editor-protocol/src/protocols/editor/RevealEditorRangeMessage";
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
  PreviewMode,
  Range,
  SyncState,
  WorkspaceCache,
} from "@impower/spark-editor-protocol/src/types";
import SingletonPromise from "./SingletonPromise";
import { Workspace } from "./Workspace";
import { WorkspaceConstants } from "./WorkspaceConstants";
import workspace from "./WorkspaceStore";
import { RemoteStorage } from "./types/RemoteStorageTypes";
import createTextFile from "./utils/createTextFile";
import createZipFile from "./utils/createZipFile";

const FIRST_TIME_AUDIO_LOAD_WAIT = 1000;

export default class WorkspaceWindow {
  protected _loadProjectRef = new SingletonPromise(
    this._loadProject.bind(this)
  );

  protected _audioContextReady = false;

  protected _audioContext?: AudioContext;

  protected _audioStartedLoadingAt = 0;

  protected _audioLoadingTimeout = 0;

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

  getPaneType(filenameOrUri: string) {
    const [, ext] = filenameOrUri.split(".");
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

  getPanelType(filenameOrUri: string) {
    const [, ext] = filenameOrUri.split(".");
    if (filenameOrUri === "main.script") {
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

  getActiveEditorForFile(filenameOrUri: string):
    | {
        uri: string;
        visibleRange: Range | undefined;
        selectedRange: Range | undefined;
      }
    | undefined {
    const projectId = this.store.project.id;
    if (projectId) {
      const pane = this.getPaneType(filenameOrUri);
      const panel = this.getPanelType(filenameOrUri);
      if (pane && panel) {
        const panelState = this.getPanelState(pane, panel);
        if (
          panelState.activeEditor &&
          panelState.activeEditor.filename === filenameOrUri
        ) {
          const uri = Workspace.fs.getFileUri(projectId, filenameOrUri);
          return {
            visibleRange: panelState.activeEditor.visibleRange,
            selectedRange: panelState.activeEditor.selectedRange,
            uri,
          };
        }
      }
    }
    return undefined;
  }

  getActiveEditorForPane(pane: PaneType):
    | {
        projectId: string;
        uri: string;
        visibleRange: Range | undefined;
        selectedRange: Range | undefined;
      }
    | undefined {
    const projectId = this.store.project.id;
    if (projectId) {
      const paneState = this.getPaneState(pane);
      const currentPanelState = paneState.panels[paneState.panel];
      const openEditor = currentPanelState?.activeEditor?.open
        ? currentPanelState.activeEditor
        : Object.values(paneState.panels).find((p) => p.activeEditor?.open)
            ?.activeEditor;
      if (openEditor?.open && openEditor?.filename) {
        const uri = Workspace.fs.getFileUri(projectId, openEditor.filename);
        return {
          projectId,
          uri,
          visibleRange: openEditor.visibleRange,
          selectedRange: openEditor.selectedRange,
        };
      }
    }
    return undefined;
  }

  revealEditorRange(uri: string, visibleRange: Range, select: boolean) {
    const filename = Workspace.fs.getFilename(uri);
    const pane = this.getPaneType(filename);
    const panel = this.getPanelType(filename);
    if (pane && panel) {
      const activeEditor =
        this.store?.panes?.[pane]?.panels?.[panel]?.activeEditor;
      if (activeEditor?.open && activeEditor?.filename === filename) {
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
                    ...this.store.panes[pane].panels[panel]?.activeEditor,
                    visibleRange,
                    selectedRange: select
                      ? { ...visibleRange }
                      : this.store.panes[pane].panels[panel]?.activeEditor
                          ?.selectedRange,
                  },
                },
              },
            },
          },
        });
      }
    }
    this.emit(
      RevealEditorRangeMessage.method,
      RevealEditorRangeMessage.type.request({
        textDocument: { uri },
        visibleRange,
        select,
      })
    );
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

  changedPreviewMode(mode: PreviewMode) {
    this.update({
      ...this.store,
      preview: {
        ...this.store.preview,
        mode,
      },
    });
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
        await Workspace.fs.writeProjectMetadata(id, "name", name);
        this.update({
          ...this.store,
          project: {
            ...this.store.project,
            name,
          },
        });
        await this.requireTextSync();
      }
      return changedName;
    }
    return false;
  }

  startedPickingProjectResource() {
    this.update({
      ...this.store,
      project: {
        ...this.store.project,
        pickingResource: true,
      },
    });
  }

  finishedPickingProjectResource() {
    this.update({
      ...this.store,
      project: {
        ...this.store.project,
        pickingResource: false,
      },
    });
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
            loading: false,
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
            loading: false,
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

  protected _toggleGameRunningNow() {
    if (this.store.preview.modes.game.running) {
      this.stopGame();
    } else {
      this.startGame();
    }
  }

  protected _toggleGameRunningAfterAudioContextReady() {
    if (this._audioLoadingTimeout) {
      // Cancel existing toggleGameRunning callback
      window.clearTimeout(this._audioLoadingTimeout);
    }
    // Calculate how much longer we have to wait
    const currentTime = performance.now();
    if (!this._audioStartedLoadingAt) {
      this._audioStartedLoadingAt = currentTime;
    }
    const timeElapsed = currentTime - this._audioStartedLoadingAt;
    const timeLeft = FIRST_TIME_AUDIO_LOAD_WAIT - timeElapsed;
    if (timeLeft > 0) {
      // Still need to wait some more before we toggle
      this._audioLoadingTimeout = window.setTimeout(() => {
        this._audioContextReady = true;
        this._toggleGameRunningNow();
      }, timeLeft);
    } else {
      // No need to wait, toggle immediately
      this._audioContextReady = true;
      this._toggleGameRunningNow();
    }
  }

  toggleGameRunning() {
    if (!this._audioContextReady) {
      if (!this._audioContext) {
        // Start loading audio context for the first time
        // (we only need to do this once for the web audio api to start preparing itself)
        this._audioContext = new AudioContext();
      }
      this.update({
        ...this.store,
        preview: {
          ...this.store.preview,
          modes: {
            ...this.store.preview.modes,
            game: {
              ...this.store.preview.modes.game,
              loading: true,
            },
          },
        },
      });
      this._toggleGameRunningAfterAudioContextReady();
    } else {
      this._toggleGameRunningNow();
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
        const name =
          (await Workspace.fs.readProjectMetadata(id, "name")) ||
          WorkspaceConstants.DEFAULT_PROJECT_NAME;
        this.update({
          ...this.store,
          project: {
            ...this.store.project,
            id,
            name,
            syncState: "cached",
            editingName: false,
          },
        });
      } else {
        await this.syncProject(false);
      }
      this.cacheProjectId(id);
      return id;
    } catch (err: any) {
      console.error(err, err.stack);
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
        const revisions = await Workspace.sync.google.getFileRevisions(id);
        if (revisions) {
          this.update({
            ...this.store,
            project: {
              ...this.store.project,
              revisions,
            },
          });
          const projectTextRevision = revisions.findLast(
            (r) => r.mimeType === "text/plain"
          );
          const projectZipRevision = revisions.findLast(
            (r) => r.mimeType === "application/zip"
          );
          const remoteProjectExists = projectTextRevision || projectZipRevision;
          const textSyncState = remoteProjectExists
            ? await this.syncText(id, projectTextRevision, pushLocalChanges)
            : "cached";
          const zipSyncState = remoteProjectExists
            ? await this.syncZip(id, projectZipRevision, pushLocalChanges)
            : "cached";
          const syncState =
            textSyncState === "unsynced" || zipSyncState === "unsynced"
              ? "unsynced"
              : textSyncState === "sync_conflict" ||
                zipSyncState === "sync_conflict"
              ? "sync_conflict"
              : textSyncState;
          const name =
            (await Workspace.fs.readProjectMetadata(id, "name")) ||
            WorkspaceConstants.DEFAULT_PROJECT_NAME;
          this.update({
            ...this.store,
            project: {
              ...this.store.project,
              name,
              syncState,
            },
          });
        } else {
          console.error(`Could not fetch remote project file: ${id}`);
          const name =
            (await Workspace.fs.readProjectMetadata(id, "name")) ||
            WorkspaceConstants.DEFAULT_PROJECT_NAME;
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

  async resolveConflictWithPull() {
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
        const revisions = await Workspace.sync.google.getFileRevisions(id);
        if (revisions) {
          const projectTextRevision = revisions.findLast(
            (r) => r.mimeType === "text/plain"
          );
          const projectZipRevision = revisions.findLast(
            (r) => r.mimeType === "application/zip"
          );
          if (projectTextRevision) {
            await this.pullRemoteTextChanges(id, projectTextRevision);
          }
          if (projectZipRevision) {
            await this.pullRemoteZipChanges(id, projectZipRevision);
          }
          const name =
            (await Workspace.fs.readProjectMetadata(id, "name")) ||
            WorkspaceConstants.DEFAULT_PROJECT_NAME;
          this.update({
            ...this.store,
            project: {
              ...this.store.project,
              name,
              syncState:
                projectTextRevision && projectZipRevision ? "synced" : "cached",
            },
          });
        } else {
          console.error(`Could not fetch remote project file: ${id}`);
          const name =
            (await Workspace.fs.readProjectMetadata(id, "name")) ||
            WorkspaceConstants.DEFAULT_PROJECT_NAME;
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

  async resolveConflictWithPush() {
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
        await this.pushLocalTextChanges(id);
        await this.pushLocalZipChanges(id);
        const name =
          (await Workspace.fs.readProjectMetadata(id, "name")) ||
          WorkspaceConstants.DEFAULT_PROJECT_NAME;
        this.update({
          ...this.store,
          project: {
            ...this.store.project,
            name,
            syncState: "synced",
          },
        });
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

  protected async syncText(
    fileId: string,
    projectTextRevision: RemoteStorage.Revision | undefined,
    pushLocalChanges: boolean
  ): Promise<SyncState> {
    const textRevisionId = await Workspace.fs.readProjectMetadata(
      fileId,
      "textRevisionId"
    );
    const textSynced = await Workspace.fs.readProjectMetadata(
      fileId,
      "textSynced"
    );
    const remoteTextChanged =
      projectTextRevision?.id && projectTextRevision?.id !== textRevisionId;
    const localTextChanged = textSynced === "false";
    if (!remoteTextChanged && localTextChanged) {
      if (pushLocalChanges) {
        await this.pushLocalTextChanges(fileId);
        return "synced";
      }
      return "unsynced";
    }
    if (remoteTextChanged && !localTextChanged) {
      await this.pullRemoteTextChanges(fileId, projectTextRevision);
      return "synced";
    }
    if (remoteTextChanged && localTextChanged) {
      return "sync_conflict";
    }
    return "synced";
  }

  protected async pushLocalTextChanges(fileId: string) {
    const projectName =
      (await Workspace.fs.readProjectMetadata(fileId, "name")) ||
      WorkspaceConstants.DEFAULT_PROJECT_NAME;
    const content = await Workspace.fs.readProjectTextContent(fileId);
    const filename = Workspace.sync.google.getProjectFilename(projectName);
    const remoteProjectFile = await Workspace.sync.google.updateProjectFile(
      fileId,
      createTextFile(filename, content)
    );
    const remoteProjectName = remoteProjectFile.name!.split(".")[0]!;
    await Promise.all([
      Workspace.fs.writeProjectMetadata(fileId, "name", remoteProjectName),
      Workspace.fs.writeProjectMetadata(
        fileId,
        "textRevisionId",
        remoteProjectFile.headRevisionId!
      ),
      Workspace.fs.writeProjectMetadata(fileId, "textSynced", String(true)),
    ]);
    return remoteProjectFile;
  }

  async pullRemoteTextChanges(
    fileId: string,
    revision: RemoteStorage.Revision
  ) {
    const remoteProjectTextContent =
      await Workspace.sync.google.getFileRevision(fileId, revision.id!, "text");
    const remoteProjectName = revision.originalFilename!.split(".")[0]!;
    await Workspace.fs.writeProjectTextContent(
      fileId,
      remoteProjectTextContent || ""
    );
    await Promise.all([
      Workspace.fs.writeProjectMetadata(fileId, "name", remoteProjectName),
      Workspace.fs.writeProjectMetadata(fileId, "textRevisionId", revision.id!),
      Workspace.fs.writeProjectMetadata(fileId, "textSynced", String(true)),
    ]);
    this.update({
      ...this.store,
      project: {
        ...this.store.project,
        textPulledAt: revision.modifiedTime,
      },
    });
  }

  protected async syncZip(
    fileId: string,
    projectZipRevision: RemoteStorage.Revision | undefined,
    pushLocalChanges: boolean
  ): Promise<SyncState> {
    const zipRevisionId = await Workspace.fs.readProjectMetadata(
      fileId,
      "zipRevisionId"
    );
    const zipSynced = await Workspace.fs.readProjectMetadata(
      fileId,
      "zipSynced"
    );
    const remoteZipChanged =
      projectZipRevision?.id && projectZipRevision?.id !== zipRevisionId;
    const localZipChanged = zipSynced === "false";
    if (!remoteZipChanged && localZipChanged) {
      if (pushLocalChanges) {
        await this.pushLocalZipChanges(fileId);
        return "synced";
      }
      return "unsynced";
    }
    if (remoteZipChanged && !localZipChanged) {
      await this.pullRemoteZipChanges(fileId, projectZipRevision);
      return "synced";
    }
    if (remoteZipChanged && localZipChanged) {
      return "sync_conflict";
    }
    return "synced";
  }

  async pushLocalZipChanges(fileId: string) {
    const projectName =
      (await Workspace.fs.readProjectMetadata(fileId, "name")) ||
      WorkspaceConstants.DEFAULT_PROJECT_NAME;
    const content = await Workspace.fs.readProjectZipContent(fileId);
    const filename = Workspace.sync.google.getProjectFilename(projectName);
    const remoteProjectFile = await Workspace.sync.google.updateProjectFile(
      fileId,
      createZipFile(filename, content)
    );
    const remoteProjectName =
      remoteProjectFile?.name?.split(".")[0] || projectName;
    await Promise.all([
      Workspace.fs.writeProjectMetadata(fileId, "name", remoteProjectName),
      Workspace.fs.writeProjectMetadata(
        fileId,
        "zipRevisionId",
        remoteProjectFile.headRevisionId!
      ),
      Workspace.fs.writeProjectMetadata(fileId, "zipSynced", String(true)),
    ]);
    return remoteProjectFile;
  }

  protected async pullRemoteZipChanges(
    fileId: string,
    revision: RemoteStorage.Revision
  ) {
    const remoteProjectZipContent = await Workspace.sync.google.getFileRevision(
      fileId,
      revision.id!,
      "arraybuffer"
    );
    const remoteProjectName = revision.originalFilename!.split(".")[0]!;
    await Workspace.fs.writeProjectZipContent(fileId, remoteProjectZipContent);
    await Promise.all([
      Workspace.fs.writeProjectMetadata(fileId, "name", remoteProjectName),
      Workspace.fs.writeProjectMetadata(fileId, "zipRevisionId", revision.id!),
      Workspace.fs.writeProjectMetadata(fileId, "zipSynced", String(true)),
    ]);
    this.update({
      ...this.store,
      project: {
        ...this.store.project,
        zipPulledAt: revision.modifiedTime,
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
        const projectName =
          (await Workspace.fs.readProjectMetadata(projectId, "name")) ||
          WorkspaceConstants.DEFAULT_PROJECT_NAME;
        const projectTextContent = await Workspace.fs.readProjectTextContent(
          projectId
        );
        const projectZipContent = await Workspace.fs.readProjectZipContent(
          projectId
        );
        const filename = Workspace.sync.google.getProjectFilename(projectName);
        const remoteProjectZipFile =
          await Workspace.sync.google.createProjectFile(
            folderId,
            createZipFile(filename, projectZipContent)
          );
        const projectFileId = remoteProjectZipFile?.id;
        if (projectFileId) {
          const remoteProjectTextFile =
            await Workspace.sync.google.updateProjectFile(
              projectFileId,
              createTextFile(filename, projectTextContent)
            );
          await Promise.all([
            Workspace.fs.writeProjectMetadata(
              projectFileId,
              "name",
              projectName
            ),
            Workspace.fs.writeProjectMetadata(
              projectFileId,
              "textRevisionId",
              remoteProjectTextFile.headRevisionId!
            ),
            Workspace.fs.writeProjectMetadata(
              projectFileId,
              "textSynced",
              String(true)
            ),
            Workspace.fs.writeProjectMetadata(
              projectFileId,
              "zipRevisionId",
              remoteProjectZipFile.headRevisionId!
            ),
            Workspace.fs.writeProjectMetadata(
              projectFileId,
              "zipSynced",
              String(true)
            ),
          ]);
          this.loadNewProject(projectFileId);
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

  async requireTextSync() {
    const projectId = this.store.project.id;
    if (projectId) {
      await Workspace.fs.writeProjectMetadata(
        projectId,
        "textSynced",
        String(false)
      );
      this.update({
        ...this.store,
        project: {
          ...this.store.project,
          syncState: "unsynced",
        },
      });
    }
  }

  async requireZipSync() {
    const projectId = this.store.project.id;
    if (projectId) {
      await Workspace.fs.writeProjectMetadata(
        projectId,
        "zipSynced",
        String(false)
      );
      this.update({
        ...this.store,
        project: {
          ...this.store.project,
          syncState: "unsynced",
        },
      });
    }
  }
}
