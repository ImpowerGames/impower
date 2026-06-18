import {
  onProtocolMessage,
  onProtocolRequest,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import {
  ChangedEditorBreakpointsMessage,
  ChangedEditorBreakpointsMethod,
  ChangedEditorBreakpointsParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorBreakpointsMessage";
import { ChangedEditorHighlightsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorHighlightsMessage";
import { ChangedEditorPinpointsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorPinpointsMessage";
import {
  ScrolledEditorMessage,
  ScrolledEditorMethod,
  ScrolledEditorParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import { SearchEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SearchEditorMessage";
import { SelectEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SelectEditorMessage";
import {
  SelectedEditorMessage,
  SelectedEditorMethod,
  SelectedEditorParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import { SetEditorHighlightsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SetEditorHighlightsMessage";
import { SetEditorPinpointsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SetEditorPinpointsMessage";
import { DidCollapsePreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidCollapsePreviewPaneMessage";
import { DidExpandPreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidExpandPreviewPaneMessage";
import { ShowDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/window/ShowDocumentMessage";
import { ApplyWorkspaceEditMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ApplyWorkspaceEditMessage";
import {
  EditorState,
  PaneType,
  PanelType,
  PreviewMode,
  Range,
  SyncStatus,
  WorkspaceCache,
} from "@impower/spark-editor-protocol/src/types";
import { NotificationMessage } from "@impower/spark-editor-protocol/src/types/base/NotificationMessage";
import { DisableGameDebugMessage } from "@impower/spark-engine/src/game/core/classes/messages/DisableGameDebugMessage";
import { EnableGameDebugMessage } from "@impower/spark-engine/src/game/core/classes/messages/EnableGameDebugMessage";
import { PauseGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/PauseGameMessage";
import { StartGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/StartGameMessage";
import { StepGameClockMessage } from "@impower/spark-engine/src/game/core/classes/messages/StepGameClockMessage";
import { StopGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/StopGameMessage";
import { UnpauseGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/UnpauseGameMessage";
import { CompiledProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";
import { ShowDocumentResult } from "vscode-languageserver-protocol";
import { debounce } from "../utils/debounce";
import SingletonPromise from "./SingletonPromise";
import { Workspace } from "./Workspace";
import { WorkspaceConstants } from "./WorkspaceConstants";
import workspace from "./WorkspaceStore";
import type { AccountInfo } from "./types/AccountInfo";
import { RemoteStorage } from "./types/RemoteStorageTypes";
import createTextFile from "./utils/createTextFile";
import createZipFile from "./utils/createZipFile";

/**
 * Owns the editor's window/UI state and bridges it to out-of-process peers.
 *
 * Data flow:
 * - The reactive `WorkspaceStore` (signals) is the single source of truth for
 *   in-page UI. Intents below (openPane, openFileEditor, setPreviewMode, …)
 *   update it via `this.update()`; Preact components read the signals and
 *   re-render. They do NOT broadcast events for in-page consumption.
 * - `sendProtocolMessage()` dispatches `spark-editor-protocol` messages on a window
 *   CustomEvent bus — strictly the boundary to peers that can't read the
 *   in-page signal: the OPFS/LSP/PDF workers, the game-player & screenplay
 *   iframes, and the framework-agnostic CodeMirror editor-view controllers
 *   (a reusable package that must stay decoupled from this app's store).
 * - `handleProtocol()` is the inbound half: it folds peer-originated events
 *   (editor scroll/selection/highlights, compiled program, …) back into the
 *   store.
 *
 * The class is large; the sections below group it by concern. A future split
 * into per-concern modules behind this facade is viable once a shared "core"
 * (store/update/cache/getPaneType) is extracted and the project
 * lifecycle/sync methods gain test coverage.
 */
export default class WorkspaceWindow {
  protected _loadProjectRef = new SingletonPromise(
    this._loadProject.bind(this),
  );

  constructor() {
    const cachedProjectId = localStorage.getItem(
      WorkspaceConstants.LOADED_PROJECT_STORAGE_KEY,
    );
    const id = cachedProjectId || WorkspaceConstants.LOCAL_PROJECT_ID;
    this.restoreProjectWorkspace(id);
    this.cacheProjectId(id);
    this.registerProtocolHandlers();
    const mediaQuery = window.matchMedia("(min-width: 960px)");
    mediaQuery.addEventListener("change", this.handleScreenSizeChange);
    this.handleScreenSizeChange(mediaQuery as any as MediaQueryListEvent);
  }

  // Inbound protocol → store. One typed listener per message kind; each
  // handler receives the fully-typed message (no instanceof/`.is()` guards).
  // `onProtocolRequest` for requests (the handler must return the message's
  // Response — a forgotten `return` is a compile error — and the reply is sent
  // automatically), `onProtocolMessage` for notifications.
  protected registerProtocolHandlers() {
    onProtocolRequest(ShowDocumentMessage.type, (m) =>
      this.handleShowDocument(m),
    );
    onProtocolRequest(ApplyWorkspaceEditMessage.type, (m) =>
      this.handleApplyWorkspaceEdit(m),
    );
    onProtocolMessage(ScrolledEditorMessage.type, (m) =>
      this.handleScrolledEditor(m),
    );
    onProtocolMessage(SelectedEditorMessage.type, (m) =>
      this.handleSelectedEditor(m),
    );
    onProtocolMessage(ChangedEditorBreakpointsMessage.type, (m) =>
      this.handleChangedEditorBreakpoints(m),
    );
    onProtocolMessage(ChangedEditorPinpointsMessage.type, (m) =>
      this.handleChangedEditorPinpoints(m),
    );
    onProtocolMessage(ChangedEditorHighlightsMessage.type, (m) =>
      this.handleChangedEditorHighlights(m),
    );
    onProtocolMessage(CompiledProgramMessage.type, (m) =>
      this.handleCompiledProgram(m),
    );
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
    // Reset diagnostics state
    copy.debug.diagnostics = {};
    // Reset pinpoints state
    copy.debug.pinpoints = {};
    // Reset highlights state
    copy.debug.highlights = {};
    // Reset game preview state
    copy.preview.modes.game = {};
    return copy;
  }

  protected cacheProjectWorkspace = debounce((store: WorkspaceCache) => {
    localStorage.setItem(
      WorkspaceConstants.WORKSPACE_STATE_STORAGE_KEY_PREFIX + store.project.id,
      JSON.stringify(this.getCacheableState(store)),
    );
  }, 300);

  protected restoreProjectWorkspace(id: string) {
    const cachedWorkspaceState = localStorage.getItem(
      WorkspaceConstants.WORKSPACE_STATE_STORAGE_KEY_PREFIX + id,
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

  // ===========================================================================
  // Account state
  //
  // The signed-in Google account lives in a dedicated `workspace.account`
  // signal (NOT the persisted cache — see WorkspaceStore for why). These
  // intents are the single write path; the sync provider calls `clearAccount`
  // on an out-of-band revocation (invalid_grant), and Account.tsx calls
  // `setAccount` after sign-in / initial fetch. Components react via the
  // derived `workspace.signals.account` / `signinLabel` computeds.
  // ===========================================================================

  /** Record the current Google account (or null when signed out). */
  setAccount(info: AccountInfo | null) {
    workspace.account.value = info ?? null;
  }

  /** Clear the signed-in account — used on sign-out and on revocation. */
  clearAccount() {
    workspace.account.value = null;
  }

  protected handleShowDocument = async (
    message: ShowDocumentMessage.Request,
  ) => {
    const { uri, selection, takeFocus } = message.params;
    const result = await this.showDocument(uri, selection, takeFocus);
    return ShowDocumentMessage.type.response(message.id, result);
  };

  protected handleApplyWorkspaceEdit = async (
    message: ApplyWorkspaceEditMessage.Request,
  ) => {
    const { label, edit, metadata } = message.params;
    const result = await Workspace.fs.applyWorkspaceEdit(edit, label, metadata);
    return ApplyWorkspaceEditMessage.type.response(message.id, result);
  };

  protected handleScrolledEditor = (
    message: NotificationMessage<ScrolledEditorMethod, ScrolledEditorParams>,
  ) => {
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
  };

  protected handleSelectedEditor = (
    message: NotificationMessage<SelectedEditorMethod, SelectedEditorParams>,
  ) => {
    const { textDocument, selectedRange, hasFocus } = message.params;
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
                  focused: hasFocus,
                  selectedRange,
                },
              },
            },
          },
        },
      });
    }
  };

  protected handleChangedEditorBreakpoints = (
    message: NotificationMessage<
      ChangedEditorBreakpointsMethod,
      ChangedEditorBreakpointsParams
    >,
  ) => {
    const { textDocument, breakpointLines } = message.params;
    const uri = textDocument.uri;
    this.update({
      ...this.store,
      debug: {
        ...this.store.debug,
        breakpoints: {
          ...this.store.debug.breakpoints,
          [uri]: breakpointLines,
        },
      },
    });
  };

  protected handleChangedEditorPinpoints = (
    message: ChangedEditorPinpointsMessage.Notification,
  ) => {
    const { textDocument, pinpointLines } = message.params;
    const uri = textDocument.uri;
    this.update({
      ...this.store,
      debug: {
        ...this.store.debug,
        pinpoints: {
          ...this.store.debug.pinpoints,
          [uri]: pinpointLines,
        },
      },
    });
  };

  protected handleChangedEditorHighlights = (
    message: ChangedEditorHighlightsMessage.Notification,
  ) => {
    const { textDocument, highlightLines } = message.params;
    const uri = textDocument.uri;
    this.update({
      ...this.store,
      debug: {
        ...this.store.debug,
        highlights: {
          ...this.store.debug.highlights,
          [uri]: highlightLines,
        },
      },
    });
  };

  protected handleCompiledProgram = (
    message: CompiledProgramMessage.Notification,
  ) => {
    const { program } = message.params;
    this.update({
      ...this.store,
      debug: {
        ...this.store.debug,
        diagnostics: program.diagnostics,
      },
    });
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

  // ===========================================================================
  // Editor state & layout queries (highlights/pinpoints, pane/panel/editor
  // lookups, showDocument/search)
  // ===========================================================================

  setHighlights(highlights: Record<string, number[]>) {
    this.update({
      ...this.store,
      debug: {
        ...this.store.debug,
        highlights,
      },
    });
    const locations = Object.entries(highlights).flatMap(([uri, lines]) =>
      lines.map((line) => ({
        uri,
        range: { start: { line, character: 0 }, end: { line, character: 0 } },
      })),
    );
    sendProtocolMessage(SetEditorHighlightsMessage.type.request({ locations }));
  }

  setPinpoints(pinpoints: Record<string, number[]>) {
    this.update({
      ...this.store,
      debug: {
        ...this.store.debug,
        pinpoints,
      },
    });
    const locations = Object.entries(pinpoints).flatMap(([uri, lines]) =>
      lines.map((line) => ({
        uri,
        range: { start: { line, character: 0 }, end: { line, character: 0 } },
      })),
    );
    sendProtocolMessage(SetEditorPinpointsMessage.type.request({ locations }));
  }

  setSimulationOptions(
    simulatePath: string,
    options: {
      favoredChoices?: (number | undefined)[];
      favoredConditions?: (boolean | undefined)[];
    },
  ) {
    this.update({
      ...this.store,
      debug: {
        ...this.store.debug,
        simulationOptions: {
          ...this.store.debug.simulationOptions,
          [simulatePath]: options,
        },
      },
    });
  }

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
    if (ext === "sd") {
      return "logic";
    }
    return null;
  }

  getPanelType(filenameOrUri: string) {
    const [name, ext] = filenameOrUri.split(".");
    if (name === "main") {
      return "main";
    }
    if (ext === "sd") {
      return "scripts";
    }
    return null;
  }

  getActiveEditorForFile(filenameOrUri: string):
    | (EditorState & {
        uri: string;
        breakpointLines: number[] | undefined;
        pinpointLines: number[] | undefined;
        highlightLines: number[] | undefined;
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
            ...panelState.activeEditor,
            uri,
            breakpointLines: this.store.debug?.breakpoints?.[uri],
            pinpointLines: this.store.debug?.pinpoints?.[uri],
            highlightLines: this.store.debug?.highlights?.[uri],
          };
        }
      }
    }
    return undefined;
  }

  getActiveEditorForPane(pane: PaneType):
    | (EditorState & {
        projectId: string;
        uri: string;
        visibleRange:
          | Range
          | "nearest"
          | "start"
          | "end"
          | "center"
          | undefined;
        selectedRange: Range | undefined;
        breakpointLines: number[] | undefined;
        pinpointLines: number[] | undefined;
      })
    | undefined {
    const projectId = this.store.project.id;
    if (projectId) {
      const paneState = this.getPaneState(pane);
      const currentPanelState = paneState.panels[paneState.panel];
      const panelState = currentPanelState?.activeEditor?.open
        ? currentPanelState
        : Object.values(paneState.panels).find((p) => p.activeEditor?.open);
      const openEditor = panelState?.activeEditor;
      if (openEditor?.open && openEditor?.filename) {
        const uri = Workspace.fs.getFileUri(projectId, openEditor.filename);
        return {
          ...openEditor,
          projectId,
          uri,
          visibleRange: openEditor.visibleRange,
          selectedRange: openEditor.selectedRange,
          breakpointLines: this.store.debug?.breakpoints?.[uri],
          pinpointLines: this.store.debug?.pinpoints?.[uri],
        };
      }
    }
    return undefined;
  }

  getOpenedDocumentUri() {
    const openPane = this.getOpenedPane();
    const activeEditor = this.getActiveEditorForPane(openPane);
    if (activeEditor) {
      const uri = activeEditor.uri;
      if (uri) {
        return uri;
      }
    }
    return undefined;
  }

  async showDocument(
    uri: string,
    range?: Range,
    takeFocus?: boolean,
  ): Promise<ShowDocumentResult> {
    return new Promise((resolve) => {
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
                    focused:
                      takeFocus ??
                      this.store.panes[pane].panels[panel]?.activeEditor
                        ?.focused,
                    visibleRange: "center",
                    selectedRange: range
                      ? { ...range }
                      : this.store.panes[pane].panels[panel]?.activeEditor
                          ?.selectedRange,
                  },
                },
              },
            },
          },
        });
      }
      if (range) {
        sendProtocolMessage(
          SelectEditorMessage.type.notification({
            textDocument: { uri },
            range,
            scrollIntoView: "center",
            takeFocus,
          }),
        );
      }
    });
  }

  search(uri: string) {
    sendProtocolMessage(
      SearchEditorMessage.type.request({ textDocument: { uri } }),
    );
  }

  // ===========================================================================
  // Panes, panels, views & file editors (store-only intents)
  // ===========================================================================

  openPane(pane: PaneType) {
    this.update({
      ...this.store,
      pane,
    });
  }

  openPanel(pane: PaneType, panel: PanelType) {
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
  }

  openView(pane: PaneType, view: string) {
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
  }

  openFileEditor(filename: string, oldFilename?: string) {
    const pane = this.getPaneType(filename);
    const panel = this.getPanelType(filename);
    if (pane && panel) {
      const activeEditor = this.store.panes[pane].panels[panel]?.activeEditor;
      const isRenaming = Boolean(oldFilename);
      const visibleRange =
        isRenaming || activeEditor?.filename === filename
          ? activeEditor?.visibleRange
          : {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 },
            };
      const selectedRange =
        isRenaming || activeEditor?.filename === filename
          ? activeEditor?.selectedRange
          : undefined;
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
                  originalFilename: oldFilename,
                  filename,
                  visibleRange,
                  selectedRange,
                },
              },
            },
          },
        },
      });
    }
  }

  closeFileEditor(filename: string) {
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
    }
  }

  // ===========================================================================
  // Preview pane (store-only intents; the Did*PreviewPane broadcasts notify the
  // out-of-process editor-view controllers)
  // ===========================================================================

  expandPreviewPane() {
    this.update({
      ...this.store,
      preview: {
        ...this.store.preview,
        revealed: true,
      },
    });
    sendProtocolMessage(DidExpandPreviewPaneMessage.type.notification({}));
  }

  collapsePreviewPane() {
    this.update({
      ...this.store,
      preview: {
        ...this.store.preview,
        revealed: false,
      },
    });
    sendProtocolMessage(DidCollapsePreviewPaneMessage.type.notification({}));
  }

  setPreviewMode(mode: PreviewMode) {
    this.update({
      ...this.store,
      preview: {
        ...this.store.preview,
        mode,
      },
    });
  }

  // ===========================================================================
  // Project name editing & remote-resource picking
  // ===========================================================================

  startEditingProjectName() {
    this.update({
      ...this.store,
      screen: {
        ...this.store.screen,
        editingName: true,
      },
    });
  }

  async finishEditingProjectName(name: string) {
    const id = this.store.project.id;
    const validName = name || WorkspaceConstants.DEFAULT_PROJECT_NAME;
    if (id) {
      // Capture the previous name BEFORE the optimistic update; otherwise
      // the comparison below always sees the new value and never persists.
      const previousName = this.store.project.name;
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
      const changedName = validName !== previousName;
      if (changedName) {
        await Workspace.fs.writeProjectMetadata(id, "name", validName);
        await this.recordScriptChange();
      }
      return changedName;
    }
    return false;
  }

  startPickingRemoteProjectResource() {
    this.update({
      ...this.store,
      screen: {
        ...this.store.screen,
        pickingResource: true,
      },
    });
  }

  finishPickingRemoteProjectResource() {
    this.update({
      ...this.store,
      screen: {
        ...this.store.screen,
        pickingResource: false,
      },
    });
  }

  // ===========================================================================
  // Game control (JSON-RPC requests to the game-player iframe)
  // ===========================================================================

  startGame() {
    if (!this.store.preview.modes.game.running) {
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
      sendProtocolMessage(StartGameMessage.type.request({}));
      if (this.store.preview.modes.game.paused) {
        this.unpauseGame();
      }
    }
  }

  stopGame() {
    if (this.store.preview.modes.game.running) {
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
      sendProtocolMessage(StopGameMessage.type.request({}));
    }
  }

  pauseGame() {
    if (!this.store.preview.modes.game.paused) {
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
      sendProtocolMessage(PauseGameMessage.type.request({}));
    }
  }

  unpauseGame() {
    if (this.store.preview.modes.game.paused) {
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
      sendProtocolMessage(UnpauseGameMessage.type.request({}));
    }
  }

  stepGameClock(seconds: number) {
    if (seconds < 0) {
      const paused = this.store.preview.modes.game.paused;
      if (!paused) {
        this.pauseGame();
      }
    }
    sendProtocolMessage(StepGameClockMessage.type.request({ seconds }));
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
    if (!this.store.preview.modes.game.debugging) {
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
      sendProtocolMessage(EnableGameDebugMessage.type.request({}));
    }
  }

  disableDebugging() {
    if (this.store.preview.modes.game.debugging) {
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
      sendProtocolMessage(DisableGameDebugMessage.type.request({}));
    }
  }

  // ===========================================================================
  // Project lifecycle & remote sync (load/unload, Google Drive sync, conflict
  // resolution, import/export). Heavily Workspace.fs/sync-coupled.
  // ===========================================================================

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
            (r) => r.mimeType === "text/plain",
          );
          const projectZipRevision = revisions.findLast(
            (r) => r.mimeType === "application/zip",
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
            (r) => r.mimeType === "text/plain",
          );
          const projectZipRevision = revisions.findLast(
            (r) => r.mimeType === "application/zip",
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
    pushLocalChanges: boolean,
  ): Promise<SyncStatus> {
    const textRevisionId = await Workspace.fs.readProjectMetadata(
      fileId,
      "textRevisionId",
    );
    const textSynced = await Workspace.fs.readProjectMetadata(
      fileId,
      "textSynced",
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
      createTextFile(filename, content),
    );
    const remoteProjectName = remoteProjectFile.name!.split(".")[0]!;
    await Promise.all([
      Workspace.fs.writeProjectMetadata(fileId, "name", remoteProjectName),
      Workspace.fs.writeProjectMetadata(
        fileId,
        "textRevisionId",
        remoteProjectFile.headRevisionId!,
      ),
      Workspace.fs.writeProjectMetadata(fileId, "textSynced", String(true)),
    ]);
    return remoteProjectFile;
  }

  async pullRemoteScriptBundleChanges(
    fileId: string,
    revision: RemoteStorage.Revision,
  ) {
    const remoteProjectTextContent =
      await Workspace.sync.google.getFileRevision(fileId, revision.id!, "text");
    const remoteProjectName = revision.originalFilename!.split(".")[0]!;
    await Workspace.fs.writeProjectScriptBundle(
      fileId,
      remoteProjectTextContent || "",
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
    pushLocalChanges: boolean,
  ): Promise<SyncStatus> {
    const zipRevisionId = await Workspace.fs.readProjectMetadata(
      fileId,
      "zipRevisionId",
    );
    const zipSynced = await Workspace.fs.readProjectMetadata(
      fileId,
      "zipSynced",
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
      createZipFile(filename, content),
    );
    const remoteProjectName =
      remoteProjectFile?.name?.split(".")[0] || projectName;
    await Promise.all([
      Workspace.fs.writeProjectMetadata(fileId, "name", remoteProjectName),
      Workspace.fs.writeProjectMetadata(
        fileId,
        "zipRevisionId",
        remoteProjectFile.headRevisionId!,
      ),
      Workspace.fs.writeProjectMetadata(fileId, "zipSynced", String(true)),
    ]);
    return remoteProjectFile;
  }

  protected async pullRemoteAssetBundleChanges(
    fileId: string,
    revision: RemoteStorage.Revision,
  ) {
    const remoteProjectZipContent = await Workspace.sync.google.getFileRevision(
      fileId,
      revision.id!,
      "arraybuffer",
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
        const projectTextContent =
          await Workspace.fs.readProjectScriptBundle(projectId);
        const projectZipContent =
          await Workspace.fs.readProjectAssetBundle(projectId);
        const filename = Workspace.sync.google.getProjectFilename(projectName);
        const remoteProjectZipFile =
          await Workspace.sync.google.createProjectFile(
            folderId,
            createZipFile(filename, projectZipContent),
          );
        const projectFileId = remoteProjectZipFile?.id;
        if (projectFileId) {
          const remoteProjectTextFile =
            await Workspace.sync.google.updateProjectFile(
              projectFileId,
              createTextFile(filename, projectTextContent),
            );
          await Promise.all([
            Workspace.fs.writeProjectMetadata(
              projectFileId,
              "name",
              projectName,
            ),
            Workspace.fs.writeProjectMetadata(
              projectFileId,
              "textRevisionId",
              remoteProjectTextFile.headRevisionId!,
            ),
            Workspace.fs.writeProjectMetadata(
              projectFileId,
              "textSynced",
              String(true),
            ),
            Workspace.fs.writeProjectMetadata(
              projectFileId,
              "zipRevisionId",
              remoteProjectZipFile.headRevisionId!,
            ),
            Workspace.fs.writeProjectMetadata(
              projectFileId,
              "zipSynced",
              String(true),
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
        String(false),
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
        String(false),
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
