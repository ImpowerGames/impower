import { ChangedEditorBreakpointsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorBreakpointsMessage";
import { ScrolledEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import { SelectedEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import { SearchEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SearchEditorMessage";
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
import { ShowDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/window/ShowDocumentMessage";
import { UnfocusWindowMessage } from "@impower/spark-editor-protocol/src/protocols/window/UnfocusWindowMessage";
import {
  EditorState,
  PaneType,
  PanelType,
  PreviewMode,
  Range,
  SyncStatus,
  WorkspaceCache,
} from "@impower/spark-editor-protocol/src/types";
import SingletonPromise from "./SingletonPromise";
import { Workspace } from "./Workspace";
import { WorkspaceConstants } from "./WorkspaceConstants";
import workspace from "./WorkspaceStore";
import { RemoteStorage } from "./types/RemoteStorageTypes";
import createTextFile from "./utils/createTextFile";
import createZipFile from "./utils/createZipFile";
import { DidParseTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidParseTextDocumentMessage";

export default class WorkspaceWindow {
  protected _loadProjectRef = new SingletonPromise(
    this._loadProject.bind(this)
  );

  constructor() {
    const cachedProjectId = localStorage.getItem(
      WorkspaceConstants.LOADED_PROJECT_STORAGE_KEY
    );
    const id = cachedProjectId || WorkspaceConstants.LOCAL_PROJECT_ID;
    this.restoreProjectWorkspace(id);
    this.cacheProjectId(id);
    window.addEventListener(
      ScrolledEditorMessage.method,
      this.handleScrolledEditor
    );
    window.addEventListener(
      SelectedEditorMessage.method,
      this.handleSelectedEditor
    );
    window.addEventListener(
      ChangedEditorBreakpointsMessage.method,
      this.handleChangedEditorBreakpoints
    );
    window.addEventListener(
      DidParseTextDocumentMessage.method,
      this.handleDidParseDocument
    );
    const mediaQuery = window.matchMedia("(min-width: 960px)");
    mediaQuery.addEventListener("change", this.handleScreenSizeChange);
    this.handleScreenSizeChange(mediaQuery as any as MediaQueryListEvent);
  }

  get store() {
    return workspace.current;
  }

  protected getCacheableState(store: WorkspaceCache) {
    // Reset any data that shouldn't survive past the current session
    // (this data shouldn't be saved in localStorage)
    const copy = structuredClone(store);
    // Reset screen state
    copy.screen = {};
    // Reset sync state
    copy.sync = {};
    // Reset debug state
    copy.debug = {};
    // Reset game preview state
    copy.preview.modes.game = {};
    return copy;
  }

  protected cacheProjectWorkspace(store: WorkspaceCache) {
    localStorage.setItem(
      WorkspaceConstants.WORKSPACE_STATE_STORAGE_KEY_PREFIX + store.project.id,
      JSON.stringify(this.getCacheableState(store))
    );
  }

  protected restoreProjectWorkspace(id: string) {
    const cachedWorkspaceState = localStorage.getItem(
      WorkspaceConstants.WORKSPACE_STATE_STORAGE_KEY_PREFIX + id
    );
    if (cachedWorkspaceState) {
      const workspaceState = JSON.parse(cachedWorkspaceState) as WorkspaceCache;
      workspace.current = this.getCacheableState(workspaceState);
    }
  }

  protected update(store: WorkspaceCache) {
    workspace.current = store;
    this.cacheProjectWorkspace(store);
  }

  protected cacheProjectId(id: string) {
    this.update({
      ...this.store,
      project: { ...this.store.project, id },
    });
    localStorage.setItem(WorkspaceConstants.LOADED_PROJECT_STORAGE_KEY, id);
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
                      focused: true,
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

  protected handleChangedEditorBreakpoints = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (ChangedEditorBreakpointsMessage.type.isNotification(message)) {
        const { textDocument, breakpointRanges } = message.params;
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
                      breakpointRanges,
                    },
                  },
                },
              },
            },
            debug: {
              ...this.store.debug,
              breakpoints: {
                ...this.store.debug.breakpoints,
                [uri]: breakpointRanges,
              },
            },
          });
        }
      }
    }
  };

  protected handleDidParseDocument = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidParseTextDocumentMessage.type.isNotification(message)) {
        const { textDocument, program } = message.params;
        const uri = textDocument.uri;
        const filename = uri.split("/").slice(-1).join("");
        const pane = this.getPaneType(filename);
        const panel = this.getPanelType(filename);
        if (pane && panel) {
          this.update({
            ...this.store,
            debug: {
              ...this.store.debug,
              diagnostics: program.diagnostics,
            },
          });
        }
      }
    }
  };

  protected handleScreenSizeChange = (query: MediaQueryListEvent) => {
    const horizontalLayout = query.matches;
    this.update({
      ...this.store,
      screen: {
        ...this.store.screen,
        horizontalLayout,
      },
    });
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

  getOpenedPane() {
    return this.store.pane;
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
    if (ext === "sd" || ext === "sparkdown") {
      return "logic";
    }
    return null;
  }

  getPanelType(filenameOrUri: string) {
    const [name, ext] = filenameOrUri.split(".");
    if (name === "main") {
      return "main";
    }
    if (ext === "sd" || ext === "sparkdown") {
      return "scripts";
    }
    return null;
  }

  getActiveEditorForFile(filenameOrUri: string):
    | (EditorState & {
        uri: string;
        breakpointRanges: Range[] | undefined;
      })
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
            uri,
            focused: panelState?.activeEditor?.focused,
            visibleRange: panelState?.activeEditor?.visibleRange,
            selectedRange: panelState?.activeEditor?.selectedRange,
            breakpointRanges: this.store.debug?.breakpoints?.[uri],
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
        breakpointRanges: Range[] | undefined;
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
          breakpointRanges: this.store.debug?.breakpoints?.[uri],
        };
      }
    }
    return undefined;
  }

  getOpenedDocumentUri() {
    const openedPane = this.getOpenedPane();
    const activeEditor = this.getActiveEditorForPane(openedPane);
    if (activeEditor) {
      const uri = activeEditor.uri;
      if (uri) {
        return uri;
      }
    }
    return undefined;
  }

  showDocument(uri: string, selection?: Range, takeFocus?: boolean) {
    const filename = Workspace.fs.getFilename(uri);
    const pane = this.getPaneType(filename);
    const panel = this.getPanelType(filename);
    if (pane && panel) {
      this.update({
        ...this.store,
        panes: {
          ...this.store.panes,
          [pane]: {
            ...this.store.panes[pane],
            view: panel === "main" ? "list" : "logic-editor",
            panel: panel,
            panels: {
              ...this.store.panes[pane].panels,
              [panel]: {
                ...this.store.panes[pane].panels[panel],
                activeEditor: {
                  ...this.store.panes[pane].panels[panel]?.activeEditor,
                  filename: filename,
                  focused: takeFocus
                    ? takeFocus
                    : this.store.panes[pane].panels[panel]?.activeEditor
                        ?.focused,
                  visibleRange: selection
                    ? { ...selection }
                    : this.store.panes[pane].panels[panel]?.activeEditor
                        ?.visibleRange,
                  selectedRange:
                    selection && takeFocus
                      ? { ...selection }
                      : this.store.panes[pane].panels[panel]?.activeEditor
                          ?.selectedRange,
                },
              },
            },
          },
        },
      });
    }
    window.setTimeout(() => {
      // Reveal range after opening file
      this.emit(
        ShowDocumentMessage.method,
        ShowDocumentMessage.type.request({
          uri,
          selection,
          takeFocus,
        })
      );
    }, 10);
  }

  unfocus() {
    const pane = this.store.pane;
    const panel = this.getOpenedPanel(pane);
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
                  ...this.store.panes[pane].panels[panel]?.activeEditor,
                  focused: false,
                },
              },
            },
          },
        },
      });
    }
    this.emit(
      UnfocusWindowMessage.method,
      UnfocusWindowMessage.type.request({})
    );
  }

  search(uri: string) {
    this.emit(
      SearchEditorMessage.method,
      SearchEditorMessage.type.request({ textDocument: { uri } })
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
      screen: {
        ...this.store.screen,
        editingName: true,
      },
    });
  }

  async finishedEditingProjectName(name: string) {
    const id = this.store.project.id;
    const validName = name || WorkspaceConstants.DEFAULT_PROJECT_NAME;
    if (id) {
      this.update({
        ...this.store,
        project: {
          ...this.store.project,
          name: validName,
        },
        screen: {
          ...this.store.screen,
          editingName: false,
        },
      });
      let changedName = validName !== this.store.project.name;
      if (changedName) {
        await Workspace.fs.writeProjectMetadata(id, "name", validName);
        this.update({
          ...this.store,
          project: {
            ...this.store.project,
            name: validName,
          },
        });
        await this.recordScriptChange();
      }
      return changedName;
    }
    return false;
  }

  startedPickingRemoteProjectResource() {
    this.update({
      ...this.store,
      screen: {
        ...this.store.screen,
        pickingResource: true,
      },
    });
  }

  finishedPickingRemoteProjectResource() {
    this.update({
      ...this.store,
      screen: {
        ...this.store.screen,
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
        directory: Workspace.fs.getDirectoryUri(id),
        name: undefined,
      },
      sync: {
        ...this.store.sync,
        status: "loading",
      },
      screen: {
        ...this.store.screen,
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
            directory: Workspace.fs.getDirectoryUri(id),
            name,
          },
          sync: {
            ...this.store.sync,
            status: "cached",
          },
          screen: {
            ...this.store.screen,
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
        sync: {
          ...this.store.sync,
          status: "load_error",
        },
      });
    }
    return undefined;
  }

  async syncProject(pushLocalChanges = true) {
    try {
      const id = this.store.project.id;
      if (id && id !== "local") {
        this.update({
          ...this.store,
          sync: {
            ...this.store.sync,
            status: "syncing",
          },
        });
        const revisions = await Workspace.sync.google.getFileRevisions(id);
        if (revisions) {
          this.update({
            ...this.store,
            sync: {
              ...this.store.sync,
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
          const textSyncStatus = remoteProjectExists
            ? await this.syncText(id, projectTextRevision, pushLocalChanges)
            : "cached";
          const zipSyncStatus = remoteProjectExists
            ? await this.syncZip(id, projectZipRevision, pushLocalChanges)
            : "cached";
          const syncState =
            textSyncStatus === "unsynced" || zipSyncStatus === "unsynced"
              ? "unsynced"
              : textSyncStatus === "sync_conflict" ||
                zipSyncStatus === "sync_conflict"
              ? "sync_conflict"
              : textSyncStatus;
          const name =
            (await Workspace.fs.readProjectMetadata(id, "name")) ||
            WorkspaceConstants.DEFAULT_PROJECT_NAME;
          this.update({
            ...this.store,
            project: {
              ...this.store.project,
              name,
            },
            sync: {
              ...this.store.sync,
              status: syncState,
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
            },
            sync: {
              ...this.store.sync,
              status: "offline",
            },
          });
        }
      }
    } catch (err: any) {
      console.error(err);
      this.update({
        ...this.store,
        sync: {
          ...this.store.sync,
          status: "sync_error",
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
          sync: {
            ...this.store.sync,
            status: "syncing",
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
            await this.pullRemoteScriptBundleChanges(id, projectTextRevision);
          }
          if (projectZipRevision) {
            await this.pullRemoteAssetBundleChanges(id, projectZipRevision);
          }
          const name =
            (await Workspace.fs.readProjectMetadata(id, "name")) ||
            WorkspaceConstants.DEFAULT_PROJECT_NAME;
          this.update({
            ...this.store,
            project: {
              ...this.store.project,
              name,
            },
            sync: {
              ...this.store.sync,
              status:
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
            },
            sync: {
              ...this.store.sync,
              status: "offline",
            },
          });
        }
      }
    } catch (err: any) {
      console.error(err);
      this.update({
        ...this.store,
        sync: {
          ...this.store.sync,
          status: "sync_error",
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
          sync: {
            ...this.store.sync,
            status: "syncing",
          },
        });
        await this.pushLocalTextChanges(id);
        await this.pushLocalZipChanges(id);
        await this.pushLocalTextChanges(id);
        const name =
          (await Workspace.fs.readProjectMetadata(id, "name")) ||
          WorkspaceConstants.DEFAULT_PROJECT_NAME;
        this.update({
          ...this.store,
          project: {
            ...this.store.project,
            name,
          },
          sync: {
            ...this.store.sync,
            status: "synced",
          },
        });
      }
    } catch (err: any) {
      console.error(err);
      this.update({
        ...this.store,
        sync: {
          ...this.store.sync,
          status: "sync_error",
        },
      });
    }
  }

  protected async syncText(
    fileId: string,
    projectTextRevision: RemoteStorage.Revision | undefined,
    pushLocalChanges: boolean
  ): Promise<SyncStatus> {
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
      await this.pullRemoteScriptBundleChanges(fileId, projectTextRevision);
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
    const content = await Workspace.fs.readProjectScriptBundle(fileId);
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

  async pullRemoteScriptBundleChanges(
    fileId: string,
    revision: RemoteStorage.Revision
  ) {
    const remoteProjectTextContent =
      await Workspace.sync.google.getFileRevision(fileId, revision.id!, "text");
    const remoteProjectName = revision.originalFilename!.split(".")[0]!;
    await Workspace.fs.writeProjectScriptBundle(
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
      sync: {
        ...this.store.sync,
        textPulledAt: revision.modifiedTime,
      },
    });
  }

  protected async syncZip(
    fileId: string,
    projectZipRevision: RemoteStorage.Revision | undefined,
    pushLocalChanges: boolean
  ): Promise<SyncStatus> {
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
        await this.pushLocalTextChanges(fileId);
        return "synced";
      }
      return "unsynced";
    }
    if (remoteZipChanged && !localZipChanged) {
      await this.pullRemoteAssetBundleChanges(fileId, projectZipRevision);
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
    const content = await Workspace.fs.readProjectAssetBundle(fileId);
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

  protected async pullRemoteAssetBundleChanges(
    fileId: string,
    revision: RemoteStorage.Revision
  ) {
    const remoteProjectZipContent = await Workspace.sync.google.getFileRevision(
      fileId,
      revision.id!,
      "arraybuffer"
    );
    const remoteProjectName = revision.originalFilename!.split(".")[0]!;
    await Workspace.fs.writeProjectAssetBundle(fileId, remoteProjectZipContent);
    await Promise.all([
      Workspace.fs.writeProjectMetadata(fileId, "name", remoteProjectName),
      Workspace.fs.writeProjectMetadata(fileId, "zipRevisionId", revision.id!),
      Workspace.fs.writeProjectMetadata(fileId, "zipSynced", String(true)),
    ]);
    this.update({
      ...this.store,
      sync: {
        ...this.store.sync,
        zipPulledAt: revision.modifiedTime,
      },
    });
  }

  async exportLocalProject() {
    try {
      const projectId = this.store.project.id;
      if (projectId) {
        this.update({
          ...this.store,
          sync: {
            ...this.store.sync,
            status: "exporting",
          },
        });
        const projectZip = await Workspace.fs.readProjectZip(projectId);
        this.update({
          ...this.store,
          sync: {
            ...this.store.sync,
            status: "cached",
          },
        });
        return projectZip;
      }
    } catch (err: any) {
      console.error(err);
      this.update({
        ...this.store,
        sync: {
          ...this.store.sync,
          status: "export_error",
        },
      });
    }
    return undefined;
  }

  async importLocalProject(fileName: string, fileBuffer: ArrayBuffer) {
    try {
      const projectId = this.store.project.id;
      if (projectId) {
        this.update({
          ...this.store,
          sync: {
            ...this.store.sync,
            status: "importing",
          },
        });
        const extIndex = fileName.indexOf(".");
        const name = extIndex >= 0 ? fileName.slice(0, extIndex) : fileName;
        await Promise.all([
          Workspace.fs.writeProjectZip(projectId, fileBuffer),
          Workspace.fs.writeProjectMetadata(projectId, "name", name),
        ]);
        this.update({
          ...this.store,
          sync: {
            ...this.store.sync,
            status: "cached",
          },
        });
        this.loadNewProject(projectId);
      }
    } catch (err: any) {
      console.error(err);
      this.update({
        ...this.store,
        sync: {
          ...this.store.sync,
          status: "import_error",
        },
      });
    }
    return undefined;
  }

  async saveRemoteProject(folderId: string) {
    try {
      const projectId = this.store.project.id;
      if (projectId) {
        this.update({
          ...this.store,
          sync: {
            ...this.store.sync,
            status: "exporting",
          },
        });
        const projectName =
          (await Workspace.fs.readProjectMetadata(projectId, "name")) ||
          WorkspaceConstants.DEFAULT_PROJECT_NAME;
        const projectTextContent = await Workspace.fs.readProjectScriptBundle(
          projectId
        );
        const projectZipContent = await Workspace.fs.readProjectAssetBundle(
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
            sync: {
              ...this.store.sync,
              status: "cached",
            },
          });
        }
      }
    } catch (err: any) {
      console.error(err);
      this.update({
        ...this.store,
        sync: {
          ...this.store.sync,
          status: "export_error",
        },
      });
    }
  }

  async recordScriptChange() {
    const projectId = this.store.project.id;
    if (projectId) {
      await Workspace.fs.writeProjectMetadata(
        projectId,
        "textSynced",
        String(false)
      );
      if (projectId !== "local") {
        this.update({
          ...this.store,
          sync: {
            ...this.store.sync,
            status: "unsynced",
          },
        });
      }
    }
  }

  async recordAssetChange() {
    const projectId = this.store.project.id;
    if (projectId) {
      await Workspace.fs.writeProjectMetadata(
        projectId,
        "zipSynced",
        String(false)
      );
      if (projectId !== "local") {
        this.update({
          ...this.store,
          sync: {
            ...this.store.sync,
            status: "unsynced",
          },
        });
      }
    }
  }
}
