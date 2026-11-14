import {
  copyLineDown,
  indentLess,
  indentMore,
  isolateHistory,
  moveLineDown,
  moveLineUp,
  redo,
  redoDepth,
  selectAll,
  selectLine,
  toggleComment,
  undo,
  undoDepth,
} from "@codemirror/commands";
import {
  ChangeSet,
  EditorSelection,
  EditorState,
  Transaction,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  applyDocumentColor,
  convertFromPosition,
  convertToChangeEvents,
  convertToPosition,
  type DiagnosticFix,
  findReferences,
  formatDocument,
  getDocumentVersion,
  insertConstruct,
  isInsertConstruct,
  jumpToDefinition,
  planConstruct,
  structureFromServer,
  type InsertPlan,
  type ContextMenuPresenter,
  LSPClient,
  LSPPlugin,
  openFind,
  renameSymbol,
} from "@impower/codemirror-vscode-lsp-client/src";
import { endsDialogueBlock } from "@impower/sparkdown/src/compiler/utils/endsDialogueBlock";
import { showLineProblems } from "../../cm-problem-marks/problemMarks";
import { TextDocumentSaveReason } from "@impower/spark-editor-protocol/src/enums/TextDocumentSaveReason";
import { ApplyEditorEditMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ApplyEditorEditMessage";
import { ChoseEditorFixMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChoseEditorFixMessage";
import { ClaimedEditorEditMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ClaimedEditorEditMessage";
import {
  RequestedEditorToolMessage,
  type EditorTool,
} from "@impower/spark-editor-protocol/src/protocols/editor/RequestedEditorToolMessage";
import { SetEditorFindMatchesMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SetEditorFindMatchesMessage";
import {
  ApplyEditorColorMessage,
  ApplyEditorColorMethod,
  ApplyEditorColorParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/ApplyEditorColorMessage";
import { ChangedEditorBreakpointsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorBreakpointsMessage";
import { ChangedEditorHighlightsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorHighlightsMessage";
import { ChangedEditorHistoryMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorHistoryMessage";
import { ChangedEditorPinpointsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorPinpointsMessage";
import { ConnectedEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ConnectedEditorMessage";
import {
  EditorCommand,
  ExecuteEditorCommandMessage,
  ExecuteEditorCommandMethod,
  ExecuteEditorCommandParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/ExecuteEditorCommandMessage";
import {
  InsertEditorConstructMessage,
  type InsertEditorConstructMethod,
  type InsertEditorConstructParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/InsertEditorConstructMessage";
import {
  AuditionEditorConstructMessage,
  type AuditionEditorConstructMethod,
  type AuditionEditorConstructParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/AuditionEditorConstructMessage";
import { FocusedEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/FocusedEditorMessage";
import { ReadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ReadEditorMessage";
import { ReadEditorKeybindingsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ReadEditorKeybindingsMessage";
import { DidLoadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/DidLoadEditorMessage";
import {
  HideEditorStatusBarMessage,
  HideEditorStatusBarMethod,
  HideEditorStatusBarParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/HideEditorStatusBarMessage";
import { HoveredOffEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/HoveredOffEditorMessage";
import { HoveredOnEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/HoveredOnEditorMessage";
import {
  LoadEditorMessage,
  LoadEditorParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/LoadEditorMessage";
import { ScrolledEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import { SelectedEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import {
  SelectEditorMessage,
  SelectEditorMethod,
  SelectEditorParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/SelectEditorMessage";
import { HideEditorHoverValuesMessage } from "@impower/spark-editor-protocol/src/protocols/editor/HideEditorHoverValuesMessage";
import { EvaluateEditorHoverMessage } from "@impower/spark-editor-protocol/src/protocols/editor/EvaluateEditorHoverMessage";
import { SetEditorBreakpointsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SetEditorBreakpointsMessage";
import { ToggleEditorBreakpointMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ToggleEditorBreakpointMessage";
import { SetEditorHighlightsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SetEditorHighlightsMessage";
import { SetEditorPinpointsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SetEditorPinpointsMessage";
import { SetEditorStartingValueLinesMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SetEditorStartingValueLinesMessage";
import { ChangedEditorStartingValueLinesMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorStartingValueLinesMessage";
import { setLineAnchors } from "../../cm-line-anchors/lineAnchors";
import { SetEditorRoutePinsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SetEditorRoutePinsMessage";
import { ChangedEditorRoutePinsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorRoutePinsMessage";
import {
  ShowEditorStatusBarMessage,
  ShowEditorStatusBarMethod,
  ShowEditorStatusBarParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/ShowEditorStatusBarMessage";
import { UnfocusedEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/UnfocusedEditorMessage";
import {
  MessageProtocol,
  ProtocolObserver,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { HoveredOnPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/HoveredOnPreviewMessage";
import {
  ScrolledPreviewMessage,
  ScrolledPreviewMethod,
  ScrolledPreviewParams,
} from "@impower/spark-editor-protocol/src/protocols/preview/ScrolledPreviewMessage";
import {
  SelectedPreviewMessage,
  SelectedPreviewMethod,
  SelectedPreviewParams,
} from "@impower/spark-editor-protocol/src/protocols/preview/SelectedPreviewMessage";
import { DidChangeTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidChangeTextDocumentMessage";
import { DidOpenTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidOpenTextDocumentMessage";
import { DidSaveTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidSaveTextDocumentMessage";
import { DidSelectTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidSelectTextDocumentMessage";
import { PreviewCompletionMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/PreviewCompletionMessage";
import { WillSaveTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/WillSaveTextDocumentMessage";
import {
  DidCollapsePreviewPaneMessage,
  DidCollapsePreviewPaneMethod,
  DidCollapsePreviewPaneParams,
} from "@impower/spark-editor-protocol/src/protocols/window/DidCollapsePreviewPaneMessage";
import {
  DidExpandPreviewPaneMessage,
  DidExpandPreviewPaneMethod,
  DidExpandPreviewPaneParams,
} from "@impower/spark-editor-protocol/src/protocols/window/DidExpandPreviewPaneMessage";
import { ShowDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/window/ShowDocumentMessage";
import { ApplyWorkspaceEditMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ApplyWorkspaceEditMessage";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage";
import {
  Color,
  MessageConnection,
  Range,
  TextDocumentContentChangeEvent,
  TextDocumentItem,
} from "@impower/spark-editor-protocol/src/types";
import { NotificationMessage } from "@impower/spark-editor-protocol/src/types/base/NotificationMessage";
import { RequestMessage } from "@impower/spark-editor-protocol/src/types/base/RequestMessage";
import { getBoxValues } from "../../../../spec-component/src/utils/getBoxValues";
import { getUnitlessValue } from "../../../../spec-component/src/utils/getUnitlessValue";
import { setHighlights } from "../../cm-highlight-lines/highlightLines";
import {
  setBreakpointStates,
  toggleBreakpointAtCaret,
} from "../../cm-breakpoints/breakpoints";
import { setPinpoints } from "../../cm-pinpoints/pinpoints";
import { setRoutePinsEffect } from "../../cm-route-pins/routePins";
import {
  setChoiceMarkersEffect,
  type ChoiceMarkerAction,
} from "../../cm-choice-markers/choiceMarkers";
import { setForcedLinesEffect } from "../../cm-line-bands/lineBands";
import {
  SetEditorRouteMarksMessage,
  type SetEditorRouteMarksParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/SetEditorRouteMarksMessage";
import { PressedEditorChoiceMarkMessage } from "@impower/spark-editor-protocol/src/protocols/editor/PressedEditorChoiceMarkMessage";
import { getScrollableParent } from "../../utils/getScrollableParent";
import { getScrollClientHeight } from "../../utils/getScrollClientHeight";
import { getScrollTop } from "../../utils/getScrollTop";
import { getVisibleRange } from "../../utils/getVisibleRange";
import { scrollY } from "../../utils/scrollY";
import { sharedEditorHistory } from "./classes/EditorHistoryCache";
import { SparkdownCodemirrorWorkspace } from "./classes/SparkdownCodemirrorWorkspace";
import { applyEditorFix, undoEditorFix } from "./utils/extensions/editorFixes";
import { setFindMatchesEffect } from "./utils/extensions/findMatches";
import createEditorView, {
  editableConfig,
  readOnlyConfig,
} from "./utils/createEditorView";
import {
  customGotoLinePanelOpen,
  openCustomGotoLinePanel,
} from "./utils/extensions/gotoLinePanel";
import {
  setKeyboardToolbarHold,
  type KeyboardToolbarHold,
  type KeyboardToolbarTool,
} from "./utils/extensions/keyboardToolbar";
import { setScriptMode, type ScriptModeValue } from "./utils/extensions/scriptMode";
import { setCoarsePointer } from "./utils/extensions/touchAffordances";
import { editorKeybindings, shortcutPlatform } from "./utils/editorShortcuts";
import { setScriptAppearance } from "../../cm-script-appearance/scriptAppearance";
import {
  closeHoverCards,
  setEditorShortcuts,
  type ShortcutCombos,
} from "@impower/codemirror-vscode-lsp-client/src";
import type { ScriptAppearance } from "../../cm-script-appearance/scriptAppearanceOptions";

export interface ScriptEditorRefs {
  editor: HTMLElement;
  loading: HTMLElement;
  placeholder: HTMLElement;
  main: HTMLElement;
}

export interface ScriptEditorOptions {
  readonly?: boolean;
  coarsePointer?: boolean;
  scriptMode?: ScriptModeValue | null;
  keyboardHold?: KeyboardToolbarHold;
  onReadingDoubleTap?: () => void;
  onToolbarTool?: (tool: KeyboardToolbarTool) => void;
  appearance: ScriptAppearance;
  shortcuts?: ShortcutCombos;
  onContextMenu?: ContextMenuPresenter;
  onChangeColor?: (range: Range, value: string, color: Color) => void;
  onPasteRefused?: () => void;
  scrollMargin?: string;
  top?: string;
  bottom?: string;
  languageServerWorker: Worker;
  languageServerConnection: MessageConnection;
}

const LOAD_REVEAL_TIMEOUT_MS = 5000;

let completionPreviewRequests = 0;

let auditionSessions = 0;

interface ShownAudition {
  uri: string;
  session: number;
  version: number;
  contentChanges: TextDocumentContentChangeEvent[];
}

export class ScriptEditorController {
  protected host: HTMLElement;
  protected refs: ScriptEditorRefs;
  protected options: ScriptEditorOptions;

  protected _initialFocused?: boolean;
  protected _initialVisibleRange?:
    | Range
    | "nearest"
    | "start"
    | "end"
    | "center";
  protected _initialSelectedRange?: Range;
  protected _selectionMoved = false;
  protected _viewScrolled = false;
  protected _focusLeft = false;
  protected _focusWhenEditable = false;
  protected _focusWhenLoaded = false;
  protected _settling = false;
  protected _loaded = false;
  protected _editing = false;
  protected _textDocument?: TextDocumentItem;
  protected _view?: EditorView;

  protected _audition: ShownAudition | null = null;

  protected _auditionTicket = 0;
  protected _disposable?: { dispose: () => void };
  protected _scroller?: Window | Element | null;
  protected _visibleRange?: Range;
  protected _domClientY = 0;
  protected _userInitiatedScroll = false;
  protected _boundPanelInputs = new WeakSet<Element>();
  protected _gotoLineInputFocused = false;
  protected _breakpoints: number[] = [];
  protected _highlightedLines = new Set<number>();
  protected _scrollMargin: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  } = { top: 0, bottom: 0, left: 0, right: 0 };
  protected _top: number = 0;
  protected _bottom: number = 0;
  protected _focusIntervalTimeout = 0;

  protected _revealTimeout = 0;

  protected _statusBarFrame = 0;

  protected _pendingResponses = new Set<() => void>();

  protected _protocols = new ProtocolObserver();
  protected _historyCache = sharedEditorHistory;

  constructor(
    host: HTMLElement,
    refs: ScriptEditorRefs,
    options: ScriptEditorOptions,
  ) {
    this.host = host;
    this.refs = refs;
    this.options = options;
  }

  setup(): void {
    this.host.addEventListener("touchstart", this.handlePointerEnterScroller, {
      passive: true,
    });
    this.host.addEventListener("mouseenter", this.handlePointerEnterScroller, {
      passive: true,
    });
    this.host.addEventListener("mouseleave", this.handlePointerLeaveScroller, {
      passive: true,
    });
    this.host.addEventListener("wheel", this.handleAuthorScroll, {
      passive: true,
    });
    this.host.addEventListener("touchmove", this.handleAuthorScroll, {
      capture: true,
      passive: true,
    });
    document.addEventListener("pointerdown", this.handleScrollbarPointerDown, {
      passive: true,
    });
    document.addEventListener("focusin", this.handleDocumentFocusIn);
    this.registerProtocolHandlers();
    sendProtocolMessage(
      ConnectedEditorMessage.type.notification({}),
      this.host,
    );
  }

  dispose(): void {
    if (this._revealTimeout) {
      clearTimeout(this._revealTimeout);
      this._revealTimeout = 0;
    }
    clearInterval(this._focusIntervalTimeout);
    this._focusIntervalTimeout = 0;
    cancelAnimationFrame(this._statusBarFrame);
    this._statusBarFrame = 0;
    this._pendingResponses.forEach((abandon) => abandon());
    this.host.removeEventListener(
      "touchstart",
      this.handlePointerEnterScroller,
    );
    this.host.removeEventListener(
      "mouseenter",
      this.handlePointerEnterScroller,
    );
    this.host.removeEventListener(
      "mouseleave",
      this.handlePointerLeaveScroller,
    );
    this.host.removeEventListener("wheel", this.handleAuthorScroll);
    this.host.removeEventListener("touchmove", this.handleAuthorScroll, true);
    document.removeEventListener(
      "pointerdown",
      this.handleScrollbarPointerDown,
    );
    document.removeEventListener("focusin", this.handleDocumentFocusIn);
    this._protocols.dispose();
    if (this._view && this._textDocument) {
      this._historyCache.save(this._textDocument.uri, this._view.state);
    }
    this._historyCache.holdOpen(this, undefined);
    if (this._textDocument) {
      if (this._editing) {
        sendProtocolMessage(
          UnfocusedEditorMessage.type.notification({
            textDocument: this._textDocument,
          }),
          this.host,
        );
      }
    }
    const view = this._view;
    if (view) {
      this.unbindView(view);
    }
  }

  setReadonly(readonly: boolean): void {
    this.options.readonly = readonly;
    this.allowEditing(!readonly);
    if (!readonly && this._focusWhenEditable) {
      this._focusWhenEditable = false;
      this.focusAtCaret();
    }
  }

  protected requestFocus() {
    if (!this._loaded) {
      this._focusWhenLoaded = true;
    } else if (this._view?.state.facet(EditorView.editable)) {
      this.focusAtCaret();
    } else {
      this._focusWhenEditable = true;
    }
  }

  setScriptMode(mode: ScriptModeValue | null): void {
    this.options.scriptMode = mode;
    if (mode === "reading") {
      this._focusWhenEditable = false;
      this._focusWhenLoaded = false;
    }
    const view = this._view;
    if (!view) return;
    view.dispatch({ effects: setScriptMode.of(mode) });
    if (mode === "reading" && view.hasFocus) {
      view.contentDOM.blur();
    }
  }

  setKeyboardHold(hold: KeyboardToolbarHold): void {
    this.options.keyboardHold = hold;
    this._view?.dispatch({ effects: setKeyboardToolbarHold.of(hold) });
  }

  protected focusAtCaret() {
    const view = this._view;
    if (!view) return;
    view.focus();
    view.dispatch({
      effects: EditorView.scrollIntoView(view.state.selection.main, {
        y: "nearest",
      }),
    });
  }

  setCoarsePointer(coarse: boolean): void {
    this.options.coarsePointer = coarse;
    if (this._view) {
      setCoarsePointer(this._view, coarse);
    }
  }

  setAppearance(appearance: ScriptAppearance): void {
    const previous = this.options.appearance;
    this.options.appearance = appearance;
    if (this._view) {
      setScriptAppearance(this._view, previous, appearance);
    }
  }

  setShortcuts(shortcuts: ShortcutCombos): void {
    this.options.shortcuts = shortcuts;
    if (this._view) {
      setEditorShortcuts(this._view, shortcuts);
    }
  }

  protected registerProtocolHandlers(): void {
    const p = this._protocols;

    p.onNotification(SelectEditorMessage.type, (m) =>
      this.handleSelectEditor(m),
    );
    p.onNotification(HideEditorHoverValuesMessage.type, () => {
      if (this._view) {
        closeHoverCards(this._view);
      }
    });
    p.onNotification(HoveredOnPreviewMessage.type, () =>
      this.handlePointerLeaveScroller(),
    );
    p.onNotification(DidExpandPreviewPaneMessage.type, (m) =>
      this.handleDidExpandPreviewPane(m),
    );
    p.onNotification(DidCollapsePreviewPaneMessage.type, (m) =>
      this.handleDidCollapsePreviewPane(m),
    );
    p.onNotification(ScrolledPreviewMessage.type, (m) =>
      this.handleScrolledPreview(m),
    );
    p.onNotification(SelectedPreviewMessage.type, (m) =>
      this.handleSelectedPreview(m),
    );
    p.onNotification(DidChangeWatchedFilesMessage.type, (m) => {
      if (this._view) {
        const plugin = LSPPlugin.get(this._view);
        if (plugin) {
          plugin.client.workspace.changeWatchedFiles(m.params);
        }
      }
    });

    p.onRequest(ReadEditorMessage.type, async (message) => {
      const view = this._view;
      const uri = this._textDocument?.uri;
      if (!view || !uri || (message.params.textDocument && message.params.textDocument.uri !== uri)) return;
      const position = message.params.position;
      let coordinates = null;
      if (position) {
        if (!Number.isInteger(position.line) || !Number.isInteger(position.character) || position.line < 0 || position.line >= view.state.doc.lines || position.character < 0 || position.character > view.state.doc.line(position.line + 1).length) {
          return ReadEditorMessage.type.error(message.id, { code: -32602, message: "Position outside document" });
        }
        const offset = view.state.doc.line(position.line + 1).from + position.character;
        coordinates = await new Promise<ReturnType<EditorView["coordsAtPos"]>>((resolve) => view.requestMeasure({ read: () => view.coordsAtPos(offset), write: resolve }));
      }
      if (this._view !== view) return ReadEditorMessage.type.error(message.id, { code: -32000, message: "Editor replaced during read" });
      return ReadEditorMessage.type.response(message.id, {
        textDocument: { uri, version: getDocumentVersion(view.state), text: view.state.doc.toString() },
        selection: { start: convertToPosition(view.state.doc, view.state.selection.main.from), end: convertToPosition(view.state.doc, view.state.selection.main.to) },
        caret: convertToPosition(view.state.doc, view.state.selection.main.head),
        coordinates,
      });
    }, this.host);
    p.onRequest(ReadEditorKeybindingsMessage.type, (message) => {
      const view = this._view;
      const uri = this._textDocument?.uri;
      if (!view || (message.params.textDocument && message.params.textDocument.uri !== uri)) return undefined;
      const platform = shortcutPlatform();
      return ReadEditorKeybindingsMessage.type.response(message.id, {
        mac: platform === "mac",
        commands: editorKeybindings(view.state, platform),
      });
    }, this.host);
    p.onRequest(
      LoadEditorMessage.type,
      (m) => this.handleLoadEditor(m),
      this.host,
    );
    p.onRequest(
      ExecuteEditorCommandMessage.type,
      (m) => this.handleExecuteEditorCommand(m),
      this.host,
    );
    p.onRequest(
      InsertEditorConstructMessage.type,
      (m) => this.handleInsertEditorConstruct(m),
      this.host,
    );
    p.onRequest(
      AuditionEditorConstructMessage.type,
      (m) => this.handleAuditionEditorConstruct(m),
      this.host,
    );
    p.onRequest(
      ApplyEditorColorMessage.type,
      (m) => this.handleApplyEditorColor(m),
      this.host,
    );
    p.onRequest(
      ShowEditorStatusBarMessage.type,
      (m) => this.handleShowEditorStatusBar(m),
      this.host,
    );
    p.onRequest(
      HideEditorStatusBarMessage.type,
      (m) => this.handleHideEditorStatusBar(m),
      this.host,
    );
    p.onRequest(
      SetEditorHighlightsMessage.type,
      (m) => this.handleSetEditorHighlights(m),
      this.host,
    );
    p.onRequest(
      SetEditorBreakpointsMessage.type,
      (m) => this.handleSetEditorBreakpoints(m),
      this.host,
    );
    p.onRequest(
      ToggleEditorBreakpointMessage.type,
      (m) => this.handleToggleEditorBreakpoint(m),
      this.host,
    );
    p.onRequest(
      SetEditorPinpointsMessage.type,
      (m) => this.handleSetEditorPinpoints(m),
      this.host,
    );
    p.onRequest(
      SetEditorStartingValueLinesMessage.type,
      (m) => this.handleSetEditorStartingValueLines(m),
      this.host,
    );
    p.onRequest(
      SetEditorRoutePinsMessage.type,
      (m) => this.handleSetEditorRoutePins(m),
      this.host,
    );
    p.onRequest(
      SetEditorRouteMarksMessage.type,
      (m) => this.handleSetEditorRouteMarks(m),
      this.host,
    );
    p.onRequest(
      SetEditorFindMatchesMessage.type,
      (m) => this.handleSetEditorFindMatches(m),
      this.host,
    );
    p.onRequest(
      ApplyEditorEditMessage.type,
      (m) => this.handleApplyEditorEdit(m),
      this.host,
    );
  }

  protected bindView(view: EditorView) {
    this._domClientY = view.dom.offsetTop;
    this._scroller = getScrollableParent(view.scrollDOM);
    this._scroller?.addEventListener("scroll", this.handlePointerScroll);
  }

  protected handleAuthorScroll = () => {
    this._viewScrolled = true;
  };

  protected handleScrollbarPointerDown = (e: PointerEvent) => {
    const view = this._view;
    if (view && e.target === getScrollableParent(view.scrollDOM)) {
      this._viewScrolled = true;
    }
  };

  protected handleDocumentFocusIn = (e: FocusEvent) => {
    const target = e.target;
    if (
      target instanceof Node &&
      target !== this.host &&
      !this._view?.contentDOM.contains(target)
    ) {
      this._focusLeft = true;
      this._focusWhenLoaded = false;
    }
  };

  protected unbindView(view: EditorView) {
    if (view === this._view) {
      this.endAudition();
    }
    this._scroller?.removeEventListener("scroll", this.handlePointerScroll);
    view.destroy();
    if (this._disposable) {
      this._disposable.dispose();
    }
  }

  protected handleLoadEditor = async (message: LoadEditorMessage.Request) => {
    const params = message.params;
    this.loadTextDocument(params);
    sendProtocolMessage(DidLoadEditorMessage.type.notification({ textDocument: { uri: params.textDocument.uri, version: params.textDocument.version } }), this.host);
    return LoadEditorMessage.type.response(message.id, {});
  };

  protected handleDidExpandPreviewPane = (
    _message: NotificationMessage<
      DidExpandPreviewPaneMethod,
      DidExpandPreviewPaneParams
    >,
  ) => {
    this._userInitiatedScroll = false;
  };

  protected handleDidCollapsePreviewPane = (
    _message: NotificationMessage<
      DidCollapsePreviewPaneMethod,
      DidCollapsePreviewPaneParams
    >,
  ) => {
    if (this._loaded && this._visibleRange) {
      this._viewScrolled = true;
    }
    this.scrollToRange(this._visibleRange);
  };

  protected handleSelectEditor = (
    message: NotificationMessage<SelectEditorMethod, SelectEditorParams>,
  ) => {
    const params = message.params;
    const textDocument = params.textDocument;
    const range = params.range;
    const scrollIntoView = params.scrollIntoView;
    const takeFocus = params.takeFocus;
    if (textDocument.uri === this._textDocument?.uri) {
      this.selectRange(range, scrollIntoView ?? false, takeFocus, params.userEvent);
    }
  };

  protected handleScrolledPreview = (
    message: NotificationMessage<ScrolledPreviewMethod, ScrolledPreviewParams>,
  ) => {
    const params = message.params;
    const textDocument = params.textDocument;
    const range = params.visibleRange;
    const target = params.target;
    if (textDocument.uri !== this._textDocument?.uri) {
      return;
    }
    if (!this._loaded) {
      if (target === "element") {
        this._initialVisibleRange = range;
      }
      return;
    }
    this._userInitiatedScroll = false;
    this.cacheVisibleRange(range);
    if (target === "element") {
      this._viewScrolled = true;
      this.scrollToRange(range);
    }
  };

  protected handleSelectedPreview = (
    message: NotificationMessage<SelectedPreviewMethod, SelectedPreviewParams>,
  ) => {
    const params = message.params;
    const textDocument = params.textDocument;
    const selectedRange = params.selectedRange;
    const docChanged = params.docChanged;
    const userEvent = params.userEvent;
    if (textDocument.uri === this._textDocument?.uri) {
      if (!docChanged && userEvent) {
        this.selectRange(selectedRange, false);
      }
    }
  };


  protected handleExecuteEditorCommand = (
    message: RequestMessage<
      ExecuteEditorCommandMethod,
      ExecuteEditorCommandParams
    >,
  ) => {
    const { textDocument, command } = message.params;
    const view = this._view;
    if (!view || textDocument.uri !== this._textDocument?.uri) {
      return undefined;
    }
    const ran = this.executeCommand(view, command);
    return ExecuteEditorCommandMessage.type.response(message.id, { ran });
  };

  protected handleInsertEditorConstruct = async (
    message: RequestMessage<
      InsertEditorConstructMethod,
      InsertEditorConstructParams
    >,
  ) => {
    const { textDocument, construct, name, reference } = message.params;
    const view = this._view;
    if (!view || textDocument.uri !== this._textDocument?.uri) {
      return undefined;
    }
    this._auditionTicket += 1;
    const structure = isInsertConstruct(construct)
      ? await structureFromServer(view, endsDialogueBlock)
      : null;
    const startState = view.state;
    const plan =
      structure && isInsertConstruct(construct)
        ? planConstruct(view, construct, structure, name, reference)
        : null;
    const inserted =
      !!structure &&
      isInsertConstruct(construct) &&
      insertConstruct(construct, structure, name, reference)(view);
    this.endAudition(
      inserted && plan ? this.auditionOf(startState, plan) : undefined,
    );
    if (inserted && this._view === view) {
      this.focusAtCaret();
    }
    return InsertEditorConstructMessage.type.response(message.id, { inserted });
  };

  protected auditionOf(state: EditorState, plan: InsertPlan) {
    const changes = ChangeSet.of(
      { from: plan.from, to: plan.to, insert: plan.insert },
      state.doc.length,
    );
    return {
      version: getDocumentVersion(state),
      contentChanges: convertToChangeEvents(state.doc, changes),
    };
  }

  protected endAudition(accepted?: {
    version: number;
    contentChanges: TextDocumentContentChangeEvent[];
  }) {
    const shown = this._audition;
    this._audition = null;
    const view = this._view;
    if (!shown || !view) {
      return;
    }
    const kept =
      accepted &&
      accepted.version === shown.version &&
      JSON.stringify(accepted.contentChanges) ===
        JSON.stringify(shown.contentChanges);
    sendProtocolMessage(
      PreviewCompletionMessage.type.notification({
        textDocument: { uri: shown.uri, version: getDocumentVersion(view.state) },
        session: shown.session,
        request: ++completionPreviewRequests,
        state: "close",
        accepted: kept ? accepted : undefined,
      }),
      this.host,
    );
  }

  protected handleAuditionEditorConstruct = async (
    message: RequestMessage<
      AuditionEditorConstructMethod,
      AuditionEditorConstructParams
    >,
  ) => {
    const { textDocument, audition } = message.params;
    const view = this._view;
    const uri = this._textDocument?.uri;
    if (!view || !uri || textDocument.uri !== uri) {
      return undefined;
    }
    const respond = (shown: boolean) =>
      AuditionEditorConstructMessage.type.response(message.id, { shown });
    const ticket = ++this._auditionTicket;
    if (!audition || !isInsertConstruct(audition.construct)) {
      this.endAudition();
      return respond(false);
    }
    const structure = await structureFromServer(view, endsDialogueBlock);
    if (ticket !== this._auditionTicket) {
      return respond(false);
    }
    const plan =
      structure && this._view === view
        ? planConstruct(view, audition.construct, structure, audition.name)
        : null;
    if (!plan) {
      this.endAudition();
      return respond(false);
    }
    const state = view.state;
    const shown: ShownAudition = {
      uri,
      session: this._audition?.session ?? -++auditionSessions,
      ...this.auditionOf(state, plan),
    };
    this._audition = shown;
    const inserted = plan.insert.slice(0, Math.max(0, plan.anchor - plan.from));
    const line =
      state.doc.lineAt(plan.from).number -
      1 +
      inserted.split("\n").length -
      1;
    sendProtocolMessage(
      PreviewCompletionMessage.type.notification({
        textDocument: { uri, version: shown.version },
        session: shown.session,
        request: ++completionPreviewRequests,
        state: "focus",
        contentChanges: shown.contentChanges,
        selectedRange: {
          start: { line, character: 0 },
          end: { line, character: 0 },
        },
      }),
      this.host,
    );
    return respond(true);
  };

  protected handleApplyEditorColor = async (
    message: RequestMessage<ApplyEditorColorMethod, ApplyEditorColorParams>,
  ) => {
    const { textDocument, range, text, color } = message.params;
    const view = this._view;
    if (!view || textDocument.uri !== this._textDocument?.uri) {
      return undefined;
    }
    const { doc } = view.state;
    const from = convertFromPosition(doc, range.start);
    const to = convertFromPosition(doc, range.end);
    const applied =
      doc.sliceString(from, to) === text &&
      (await applyDocumentColor(view, { from, to }, color));
    return ApplyEditorColorMessage.type.response(message.id, {
      applied,
      ...(!applied && view.state.readOnly ? { readOnly: true } : {}),
    });
  };

  protected executeCommand(view: EditorView, command: EditorCommand) {
    switch (command) {
      case "focus":
        this.requestFocus();
        return true;
      case "indent":
        view.focus();
        return indentMore(view);
      case "dedent":
        view.focus();
        return indentLess(view);
      case "format":
        return formatDocument(view);
      case "gotoLine":
        return openCustomGotoLinePanel(view);
      case "search":
        return openFind(view);
      case "undo":
        return undo(view);
      case "redo":
        return redo(view);
      case "selectAll":
        view.focus();
        return selectAll(view);
      case "selectLine":
        view.focus();
        return selectLine(view);
      case "moveLineUp":
        return moveLineUp(view);
      case "moveLineDown":
        return moveLineDown(view);
      case "duplicateLine":
        return copyLineDown(view);
      case "toggleComment":
        return toggleComment(view);
      case "rename":
        view.focus();
        return renameSymbol(view);
      case "references":
        return findReferences(view);
      case "definition":
        return jumpToDefinition(view);
      case "problems":
        return showLineProblems(view);
    }
  }

  protected _history: { uri?: string; canUndo: boolean; canRedo: boolean } =
    { canUndo: false, canRedo: false };

  protected publishHistory(state: EditorState) {
    const uri = this._textDocument?.uri;
    const canUndo = undoDepth(state) > 0;
    const canRedo = redoDepth(state) > 0;
    if (
      !uri ||
      (uri === this._history.uri &&
        canUndo === this._history.canUndo &&
        canRedo === this._history.canRedo)
    ) {
      return;
    }
    this._history = { uri, canUndo, canRedo };
    sendProtocolMessage(
      ChangedEditorHistoryMessage.type.notification({
        textDocument: { uri },
        canUndo,
        canRedo,
      }),
      this.host,
    );
  }

  protected handleShowEditorStatusBar = (
    message: RequestMessage<
      ShowEditorStatusBarMethod,
      ShowEditorStatusBarParams
    >,
  ) => {
    const bottomPanels =
      this.host.querySelector<HTMLElement>(".cm-panels-bottom");
    if (bottomPanels) {
      bottomPanels.style.opacity = "0";
      bottomPanels.style.transition = "opacity 150ms";
      bottomPanels.hidden = false;
      this.refs.placeholder.hidden = true;
      cancelAnimationFrame(this._statusBarFrame);
      this._statusBarFrame = window.requestAnimationFrame(() => {
        this._statusBarFrame = 0;
        if (bottomPanels) {
          bottomPanels.style.opacity = "1";
        }
      });
      return ShowEditorStatusBarMessage.type.response(message.id, {});
    }
    return ShowEditorStatusBarMessage.type.error(message.id, {
      code: 1,
      message: "no bottom panels found",
    });
  };

  protected handleHideEditorStatusBar = (
    message: RequestMessage<
      HideEditorStatusBarMethod,
      HideEditorStatusBarParams
    >,
  ) => {
    const bottomPanels =
      this.host.querySelector<HTMLElement>(".cm-panels-bottom");
    if (bottomPanels) {
      bottomPanels.hidden = true;
      this.refs.placeholder.hidden = false;
      return HideEditorStatusBarMessage.type.response(message.id, {});
    }
    return HideEditorStatusBarMessage.type.error(message.id, {
      code: 1,
      message: "no bottom panels found",
    });
  };

  protected handleSetEditorHighlights = (
    message: SetEditorHighlightsMessage.Request,
  ) => {
    const { locations } = message.params;
    if (this._view) {
      setHighlights(
        this._view,
        locations
          .filter((l) => l.uri === this._textDocument?.uri)
          .map((l) => l.range.start.line + 1),
      );
    }
    return SetEditorHighlightsMessage.type.response(message.id, {});
  };

  protected handleSetEditorBreakpoints = (
    message: SetEditorBreakpointsMessage.Request,
  ) => {
    const { textDocument, breakpoints } = message.params;
    if (this._view && textDocument.uri === this._textDocument?.uri) {
      setBreakpointStates(
        this._view,
        breakpoints.map((b) => ({ ...b, line: b.line + 1 })),
      );
    }
    return SetEditorBreakpointsMessage.type.response(message.id, {});
  };

  protected handleToggleEditorBreakpoint = (
    message: ToggleEditorBreakpointMessage.Request,
  ) => {
    const view = this._view;
    if (!view || message.params.textDocument.uri !== this._textDocument?.uri) {
      return undefined;
    }
    const line = toggleBreakpointAtCaret(view) - 1;
    return ToggleEditorBreakpointMessage.type.response(message.id, { line });
  };

  protected awaitResponse<T>(
    request: Parameters<typeof sendProtocolMessage>[0],
    isResponse: (message: unknown) => message is T,
  ) {
    return new Promise<T | undefined>((resolve) => {
      const abandon = () => {
        this._pendingResponses.delete(abandon);
        window.removeEventListener(MessageProtocol.event, onProtocol);
      };
      const finish = (message?: T) => {
        abandon();
        resolve(message);
      };
      const onProtocol = (e: Event) => {
        if (e instanceof CustomEvent && isResponse(e.detail)) {
          finish(e.detail);
        }
      };
      this._pendingResponses.add(abandon);
      window.addEventListener(MessageProtocol.event, onProtocol);
      if (!sendProtocolMessage(request, this.host) || !this.host.isConnected) {
        finish();
      }
    });
  }

  protected evaluateHover = async (expression: string) => {
    const uri = this._textDocument?.uri;
    if (!uri) {
      return null;
    }
    const request = EvaluateEditorHoverMessage.type.request({
      textDocument: { uri },
      expression,
    });
    const response = await this.awaitResponse(request, (message) =>
      EvaluateEditorHoverMessage.type.isResponse(message, request.id),
    );
    return response && "result" in response
      ? (response.result?.value ?? null)
      : null;
  };

  protected handleSetEditorPinpoints = (
    message: SetEditorPinpointsMessage.Request,
  ) => {
    const { locations } = message.params;
    if (this._view) {
      setPinpoints(
        this._view,
        locations
          .filter((l) => l.uri === this._textDocument?.uri)
          .map((l) => l.range.start.line + 1),
      );
    }
    return SetEditorPinpointsMessage.type.response(message.id, {});
  };

  protected handleSetEditorStartingValueLines = (
    message: SetEditorStartingValueLinesMessage.Request,
  ) => {
    const script = message.params.scripts.find(
      (s) => s.uri === this._textDocument?.uri,
    );
    if (this._view && script) {
      setLineAnchors(this._view, script.lines);
    }
    return SetEditorStartingValueLinesMessage.type.response(message.id, {});
  };

  protected handleSetEditorRoutePins = (
    message: SetEditorRoutePinsMessage.Request,
  ) => {
    const uri = this._textDocument?.uri;
    if (this._view && uri) {
      this._view.dispatch({
        effects: setRoutePinsEffect.of(
          message.params.pins
            .filter((pin) => pin.uri === uri)
            .map(({ line, offer }) => ({ line, offer })),
        ),
      });
    }
    return SetEditorRoutePinsMessage.type.response(message.id, {});
  };

  protected _routeMarks: SetEditorRouteMarksParams = { choices: [], forced: [] };

  protected handleSetEditorRouteMarks = (
    message: SetEditorRouteMarksMessage.Request,
  ) => {
    this._routeMarks = message.params;
    this.applyRouteMarks();
    return SetEditorRouteMarksMessage.type.response(message.id, {});
  };

  protected applyRouteMarks() {
    const uri = this._textDocument?.uri;
    if (!this._view || !uri) {
      return;
    }
    const { choices, forced } = this._routeMarks;
    this._view.dispatch({
      effects: [
        setChoiceMarkersEffect.of(
          choices
            .filter((choice) => choice.uri === uri)
            .map((choice) => ({
              line: choice.line + 1,
              icon: choice.icon,
              title: choice.title,
              text: choice.text,
              options: choice.options,
              unpin: choice.unpin,
              note: choice.note,
            })),
        ),
        setForcedLinesEffect.of(
          forced
            .filter((script) => script.uri === uri)
            .flatMap((script) => script.lines.map((line) => line + 1)),
        ),
      ],
    });
  }

  protected handleFix = ({ uri, version, range, action }: DiagnosticFix) => {
    const { name, done, expect, kind, changes } = action;
    sendProtocolMessage(
      ChoseEditorFixMessage.type.notification({
        fix: { uri, version, range, changes, expect, kind },
        name,
        done,
      }),
      this.host,
    );
  };

  protected handleChoiceMark = (line: number, action: ChoiceMarkerAction) => {
    const uri = this._textDocument?.uri;
    if (uri) {
      sendProtocolMessage(
        PressedEditorChoiceMarkMessage.type.notification({
          textDocument: { uri },
          line: line - 1,
          action,
        }),
        this.host,
      );
    }
  };

  protected handleSetEditorFindMatches = (
    message: SetEditorFindMatchesMessage.Request,
  ) => {
    const { textDocument, ranges } = message.params;
    const view = this._view;
    if (view && textDocument.uri === this._textDocument?.uri) {
      const doc = view.state.doc;
      view.dispatch({
        effects: setFindMatchesEffect.of(
          ranges.map((range) => ({
            from: convertFromPosition(doc, range.start),
            to: convertFromPosition(doc, range.end),
          })),
        ),
      });
    }
    return SetEditorFindMatchesMessage.type.response(message.id, {});
  };

  protected handleApplyEditorEdit = async (
    message: ApplyEditorEditMessage.Request,
  ) => {
    const { edit, closedTexts, claim, expectedTexts, fix, undoFix } =
      message.params;
    const view = this._view;
    const uri = this._textDocument?.uri;
    const fixed = fix?.uri ?? undoFix?.uri;
    if (fixed !== undefined) {
      if (!view || fixed !== uri) {
        return ApplyEditorEditMessage.type.response(message.id, {
          applied: [],
        });
      }
      sendProtocolMessage(
        ClaimedEditorEditMessage.type.notification({
          request: message.id,
          uri,
          text: view.state.doc.toString(),
        }),
        this.host,
      );
      if (fix) {
        const revert = applyEditorFix(view, fix, message.id);
        return ApplyEditorEditMessage.type.response(
          message.id,
          revert ? { applied: [uri], revert } : { applied: [], refused: [uri] },
        );
      }
      return ApplyEditorEditMessage.type.response(
        message.id,
        undoEditorFix(view, undoFix!)
          ? { applied: [uri] }
          : { applied: [], refused: [uri] },
      );
    }
    const applied: string[] = [];
    const textEdits = edit.documentChanges
      ? edit.documentChanges.flatMap((change) =>
          "textDocument" in change
            ? [{ uri: change.textDocument.uri, edits: change.edits }]
            : [],
        )
      : Object.entries(edit.changes ?? {}).map(([uri, edits]) => ({
          uri,
          edits,
        }));
    const holds =
      view && uri && textEdits.some((change) => change.uri === uri);
    if (claim) {
      if (view && uri && holds) {
        sendProtocolMessage(
          ClaimedEditorEditMessage.type.notification({
            request: message.id,
            uri,
            text: view.state.doc.toString(),
          }),
          this.host,
        );
      }
      return ApplyEditorEditMessage.type.response(message.id, { applied: [] });
    }
    const expected = holds && uri ? expectedTexts?.[uri] : undefined;
    if (
      view &&
      uri &&
      expected !== undefined &&
      view.state.doc.toString() !== expected
    ) {
      return ApplyEditorEditMessage.type.response(message.id, {
        applied: [],
        refused: [uri],
      });
    }
    for (const change of textEdits) {
      const edits = change.edits.filter((e) => "newText" in e);
      if (!edits.length) {
        continue;
      }
      if (view && change.uri === uri) {
        if (expected === undefined) {
          continue;
        }
        const dispatch = (
          offsetOf: (position: Range["start"]) => number,
        ) =>
          view.dispatch({
            changes: edits.map((e) => ({
              from: offsetOf(e.range.start),
              to: offsetOf(e.range.end),
              insert: e.newText,
            })),
            userEvent: "input.replace.all",
            annotations: isolateHistory.of("full"),
          });
        const plugin = LSPPlugin.get(view);
        if (plugin) {
          await plugin.client.withMapping(async (mapping) =>
            dispatch((position) => mapping.mapPosition(change.uri, position)),
          );
        } else {
          dispatch((position) => convertFromPosition(view.state.doc, position));
        }
        applied.push(change.uri);
        continue;
      }
      const before = closedTexts?.[change.uri];
      if (before != null) {
        this._historyCache.record(change.uri, before, edits, message.id);
      }
    }
    return ApplyEditorEditMessage.type.response(message.id, { applied });
  };

  protected requestEditorTool(tool: EditorTool) {
    sendProtocolMessage(
      RequestedEditorToolMessage.type.notification({ tool }),
      this.host,
    );
  }

  protected cachedEditorState(textDocument: TextDocumentItem) {
    const restored = this._historyCache.restore(
      textDocument.uri,
      textDocument.text,
    );
    return restored ? { ...restored, folded: [] } : undefined;
  }

  protected handleFocusGotoLineInput = () => {
    this._gotoLineInputFocused = true;
  };

  protected handleBlurGotoLineInput = () => {
    this._gotoLineInputFocused = false;
  };

  protected loadTextDocument(params: LoadEditorParams) {
    const {
      textDocument,
      focused,
      visibleRange,
      selectedRange,
      breakpointLines,
      pinpointLines,
      highlightLines,
      startingValueLines,
      routePins,
      languageServerInitializeParams,
      languageServerInitializeResult,
      preserveEditor,
    } = params;
    if (preserveEditor && this._view) {
      this._textDocument = textDocument;
      this._historyCache.holdOpen(this, textDocument.uri);
      const uri = textDocument.uri;
      const plugin = LSPPlugin.get(this._view);
      if (plugin) {
        plugin.uri = uri;
      }
      const state = this._view.state;
      const cursorRange = state.selection.main;
      const anchor = cursorRange.anchor;
      const head = cursorRange.head;
      const params: DidSelectTextDocumentMessage.Notification["params"] = {
        textDocument: { uri },
        selectedRange: {
          start: convertToPosition(state.doc, anchor),
          end: convertToPosition(state.doc, head),
        },
        hasFocus: this._view?.hasFocus,
        docChanged: false,
        userEvent: true,
      };
      sendProtocolMessage(
        DidSelectTextDocumentMessage.type.notification(params),
        this.host,
      );
      sendProtocolMessage(
        SelectedEditorMessage.type.notification(params),
        this.host,
      );
      this.publishHistory(state);
    } else {
      this.refs.editor.style.visibility = "hidden";
      this.refs.loading.style.opacity = "1";
      if (this._revealTimeout) {
        clearTimeout(this._revealTimeout);
      }
      this._revealTimeout = window.setTimeout(
        this.revealEditor,
        LOAD_REVEAL_TIMEOUT_MS,
      );
      if (this._view && this._textDocument) {
        this._historyCache.save(this._textDocument.uri, this._view.state);
      }
      this._historyCache.useRoot(
        languageServerInitializeParams?.rootUri ?? undefined,
      );
      this._historyCache.holdOpen(this, textDocument.uri);
      if (this._view) {
        this.unbindView(this._view);
        this._view.destroy();
      }
      if (this._disposable) {
        this._disposable.dispose();
      }
      this._initialFocused = focused;
      this._initialVisibleRange = visibleRange;
      this._initialSelectedRange = selectedRange;
      this._loaded = false;
      this._focusWhenLoaded = false;
      this._gotoLineInputFocused = false;
      this._textDocument = textDocument;
      const editorContainer = this.refs.editor;
      if (editorContainer) {
        this._scrollMargin = getBoxValues(this.options.scrollMargin ?? "");
        this._top = getUnitlessValue(this.options.top ?? "", 0);
        this._bottom = getUnitlessValue(this.options.bottom ?? "", 0);
        [this._view, this._disposable] = createEditorView(editorContainer, {
          coarsePointer: !!this.options.coarsePointer,
          readonly: this.options.readonly,
          scriptMode: this.options.scriptMode,
          keyboardHold: this.options.keyboardHold,
          onReadingDoubleTap: this.options.onReadingDoubleTap,
          onToolbarTool: this.options.onToolbarTool,
          appearance: this.options.appearance,
          shortcuts: this.options.shortcuts,
          onContextMenu: this.options.onContextMenu,
          tools: {
            find: () => this.requestEditorTool("find"),
            findNext: () => this.requestEditorTool("findNext"),
            findPrevious: () => this.requestEditorTool("findPrevious"),
            rename: () => this.requestEditorTool("rename"),
            references: () => this.requestEditorTool("references"),
            problems: () => this.requestEditorTool("problems"),
          },
          onChangeColor: this.options.onChangeColor
            ? ({ from, to, text, color }) => {
                const doc = this._view?.state.doc;
                if (!doc) return;
                this.options.onChangeColor?.(
                  {
                    start: convertToPosition(doc, from),
                    end: convertToPosition(doc, to),
                  },
                  text,
                  color,
                );
              }
            : undefined,
          onPasteRefused: this.options.onPasteRefused,
          serverWorker: this.options.languageServerWorker,
          serverConnection: this.options.languageServerConnection,
          serverInitializeParams: languageServerInitializeParams,
          serverInitializeResult: languageServerInitializeResult,
          serverWorkspace: (client: LSPClient) =>
            new SparkdownCodemirrorWorkspace(client, {
              showDocument: async (params) => {
                const request = ShowDocumentMessage.type.request(params);
                await this.awaitResponse(request, (message) =>
                  ShowDocumentMessage.type.isResponse(message, request.id),
                );
              },
              applyWorkspaceEdit: async (params) => {
                const request = ApplyWorkspaceEditMessage.type.request(params);
                await this.awaitResponse(request, (message) =>
                  ApplyWorkspaceEditMessage.type.isResponse(
                    message,
                    request.id,
                  ),
                );
              },
            }),
          textDocument: this._textDocument,
          defaultState: this.cachedEditorState(textDocument),
          scrollMargin: this._scrollMargin,
          top: this._top,
          bottom: this._bottom,
          breakpointLineNumbers: breakpointLines?.map((line) => line + 1),
          pinpointLineNumbers: pinpointLines?.map((line) => line + 1),
          startingValueLines,
          highlightLineNumbers: highlightLines?.map((line) => line + 1),
          routePins,
          onChoiceMark: this.handleChoiceMark,
          onFix: this.handleFix,
          scrollToLineNumber:
            visibleRange && typeof visibleRange !== "string"
              ? (visibleRange?.start.line ?? 0) + 1
              : undefined,
          onIdle: this.handleIdle,
          onViewportParsed: this.handleViewportParsed,
          onFocus: () => {
            this._editing = true;
            if (this._textDocument) {
              sendProtocolMessage(
                FocusedEditorMessage.type.notification({
                  textDocument: this._textDocument,
                }),
                this.host,
              );
            }
          },
          onBlur: () => {
            this._editing = false;
            if (this._textDocument) {
              if (!this._gotoLineInputFocused) {
                sendProtocolMessage(
                  UnfocusedEditorMessage.type.notification({
                    textDocument: this._textDocument,
                  }),
                  this.host,
                );
              }
            }
          },
          transactionExtender: (tr) => {
            if (tr.docChanged) {
              if (this._textDocument) {
                const uri = this._textDocument.uri;
                const beforeVersion = getDocumentVersion(tr.startState);
                const afterVersion = beforeVersion + 1;
                const after = tr.newDoc.toString();
                const contentChanges = convertToChangeEvents(
                  tr.startState.doc,
                  tr.changes,
                );
                const selection = tr.selection
                  ? {
                      selectedRange: {
                        start: convertToPosition(
                          tr.newDoc,
                          tr.selection.main.anchor,
                        ),
                        end: convertToPosition(tr.newDoc, tr.selection.main.head),
                      },
                      userEvent: Boolean(tr.annotation(Transaction.userEvent)),
                    }
                  : undefined;
                sendProtocolMessage(
                  DidChangeTextDocumentMessage.type.notification({
                    textDocument: {
                      uri,
                      version: afterVersion,
                    },
                    contentChanges,
                    changedAt: Date.now(),
                    selection,
                  }),
                  this.host,
                );
                sendProtocolMessage(
                  WillSaveTextDocumentMessage.type.notification({
                    textDocument: { uri },
                    reason: TextDocumentSaveReason.AfterDelay,
                  }),
                  this.host,
                );
                sendProtocolMessage(
                  DidSaveTextDocumentMessage.type.notification({
                    textDocument: { uri },
                    text: after,
                  }),
                  this.host,
                );
              }
            }
            return null;
          },
          onSelectionChanged: (update, anchor, head) => {
            const uri = this._textDocument?.uri;
            if (uri) {
              const params: DidSelectTextDocumentMessage.Notification["params"] =
                {
                  textDocument: { uri },
                  selectedRange: {
                    start: convertToPosition(update.state.doc, anchor),
                    end: convertToPosition(update.state.doc, head),
                  },
                  hasFocus: this._view?.hasFocus,
                  docChanged: update.docChanged,
                  userEvent: update.transactions.some((tr) =>
                    tr.annotation(Transaction.userEvent),
                  ),
                };
              sendProtocolMessage(
                DidSelectTextDocumentMessage.type.notification(params),
                this.host,
              );
              sendProtocolMessage(
                SelectedEditorMessage.type.notification(params),
                this.host,
              );
            }
          },
          onBreakpointsChanged: (_update, breakpointLineNumbers) => {
            const uri = this._textDocument?.uri;
            if (uri) {
              sendProtocolMessage(
                ChangedEditorBreakpointsMessage.type.notification({
                  textDocument: { uri },
                  breakpointLines: breakpointLineNumbers.map(
                    (lineNumber) => lineNumber - 1,
                  ),
                }),
                this.host,
              );
            }
          },
          onStartingValueLinesChanged: (_update, moves) => {
            const uri = this._textDocument?.uri;
            if (uri) {
              sendProtocolMessage(
                ChangedEditorStartingValueLinesMessage.type.notification({
                  textDocument: { uri },
                  moves,
                }),
                this.host,
              );
            }
          },
          onPinpointsChanged: (_update, pinpointLineNumbers) => {
            const uri = this._textDocument?.uri;
            if (uri) {
              sendProtocolMessage(
                ChangedEditorPinpointsMessage.type.notification({
                  textDocument: { uri },
                  pinpointLines: pinpointLineNumbers.map(
                    (lineNumber) => lineNumber - 1,
                  ),
                }),
                this.host,
              );
            }
          },
          onRoutePinsChanged: (_update, pins) => {
            const uri = this._textDocument?.uri;
            if (uri) {
              sendProtocolMessage(
                ChangedEditorRoutePinsMessage.type.notification({
                  textDocument: { uri },
                  pins,
                }),
                this.host,
              );
            }
          },
          onHighlightsChanged: (_update, highlightLineNumbers) => {
            const uri = this._textDocument?.uri;
            if (uri) {
              sendProtocolMessage(
                ChangedEditorHighlightsMessage.type.notification({
                  textDocument: { uri },
                  highlightLines: highlightLineNumbers.map(
                    (lineNumber) => lineNumber - 1,
                  ),
                }),
                this.host,
              );
            }
          },
          hoverValue: this.evaluateHover,
          onCompletionPreview: (event, state) => {
            const uri = this._textDocument?.uri;
            if (!uri) {
              return;
            }
            const request = ++completionPreviewRequests;
            if (event.state === "focus") {
              const cursor = convertToPosition(
                state.doc,
                state.selection.main.head,
              );
              sendProtocolMessage(
                PreviewCompletionMessage.type.notification({
                  textDocument: { uri, version: getDocumentVersion(state) },
                  session: event.session,
                  request,
                  state: "focus",
                  contentChanges: event.changes
                    ? convertToChangeEvents(state.doc, event.changes)
                    : null,
                  selectedRange: { start: cursor, end: cursor },
                }),
                this.host,
              );
              return;
            }
            const accepted = event.accepted;
            sendProtocolMessage(
              PreviewCompletionMessage.type.notification({
                textDocument: { uri, version: getDocumentVersion(state) },
                session: event.session,
                request,
                state: "close",
                accepted: accepted
                  ? {
                      version: getDocumentVersion(accepted.startState),
                      contentChanges: convertToChangeEvents(
                        accepted.startState.doc,
                        accepted.changes,
                      ),
                    }
                  : undefined,
              }),
              this.host,
            );
          },
          onViewUpdate: (update) => {
            this.publishHistory(update.state);
            if (update.selectionSet && !this._settling) {
              this._selectionMoved = true;
            }
            if (customGotoLinePanelOpen(update.state)) {
              this.bindPanelInput(
                ".cm-gotoLine [contenteditable]",
                this.handleFocusGotoLineInput,
                this.handleBlurGotoLineInput,
              );
            }
          },
        });
        this._selectionMoved = false;
        this._viewScrolled = false;
        this._focusLeft = false;
      }
    }
    this.applyRouteMarks();
    sendProtocolMessage(
      DidOpenTextDocumentMessage.type.notification({ textDocument }),
      this.host,
    );
  }

  protected bindPanelInput(
    selector: string,
    onFocus: () => void,
    onBlur: () => void,
  ) {
    const input = this.host.querySelector(selector);
    if (input && !this._boundPanelInputs.has(input)) {
      this._boundPanelInputs.add(input);
      input.addEventListener("focus", onFocus);
      input.addEventListener("blur", onBlur);
      if (input === input.ownerDocument.activeElement) {
        onFocus();
      }
    }
  }

  protected cacheVisibleRange(range: Range | undefined) {
    if (
      range?.start?.line !== this._visibleRange?.start?.line ||
      range?.end?.line !== this._visibleRange?.end?.line
    ) {
      this._visibleRange = range;
    }
  }

  protected scrollToRange(
    range: Range | undefined,
    strategy: "nearest" | "start" | "end" | "center" = "start",
  ) {
    const view = this._view;
    if (view) {
      if (range) {
        const doc = view.state.doc;
        const startLineNumber = range.start.line + 1;
        if (startLineNumber === 1) {
          scrollY(0, this._scroller);
        } else {
          const line = doc.line(
            Math.min(Math.max(1, startLineNumber), doc.lines),
          );
          view.dispatch({
            effects: EditorView.scrollIntoView(
              EditorSelection.range(line.from, line.to),
              { y: strategy },
            ),
          });
        }
      }
    }
  }

  protected settleSelection(
    range: Range,
    scrollIntoView: "nearest" | "start" | "end" | "center" | false,
    takeFocus?: boolean,
  ) {
    this._settling = true;
    try {
      this.selectRange(range, scrollIntoView, takeFocus);
    } finally {
      this._settling = false;
    }
  }

  protected selectRange(
    range: Range,
    scrollIntoView: "nearest" | "start" | "end" | "center" | false,
    takeFocus?: boolean,
    userEvent?: boolean,
  ) {
    const view = this._view;
    if (view) {
      const doc = view.state.doc;
      const anchor = convertFromPosition(doc, range.start);
      const head = convertFromPosition(doc, range.end);
      if (takeFocus) {
        this.host.focus?.({ preventScroll: true });
        view.focus();
      }
      view.dispatch({
        selection: EditorSelection.create([
          EditorSelection.range(anchor, head),
        ]),
        effects: !scrollIntoView
          ? undefined
          : EditorView.scrollIntoView(EditorSelection.range(anchor, head), {
              y: scrollIntoView,
            }),
        userEvent: userEvent ? "select" : undefined,
      });
    }
  }

  isSelectionRangeVisible(range: Range) {
    const view = this._view;
    if (view) {
      const doc = view.state.doc;
      const from = convertFromPosition(doc, range.start);
      const to = convertFromPosition(doc, range.end);

      const startCoords = view.coordsAtPos(from);
      const endCoords = view.coordsAtPos(to);

      if (!startCoords || !endCoords) return false;

      const editorRect = view.scrollDOM.getBoundingClientRect();

      const isAbove = endCoords.bottom < editorRect.top;
      const isBelow = startCoords.top > editorRect.bottom;

      return !isAbove && !isBelow;
    }
    return false;
  }

  protected revealEditor = () => {
    if (this._revealTimeout) {
      clearTimeout(this._revealTimeout);
      this._revealTimeout = 0;
    }
    if (!this.refs.editor) {
      return;
    }
    if (this.refs.loading) {
      this.refs.loading.style.opacity = "0";
    }
    this.refs.editor.style.visibility = "visible";
    this.refs.editor.style.opacity = "1";
  };

  protected handleViewportParsed = () => {
    if (this._loaded) {
      return;
    }
    const fonts = document.fonts;
    if (fonts && fonts.status !== "loaded") {
      const view = this._view;
      fonts.ready.then(() => {
        if (!this._loaded && this._view === view) {
          this.handleIdle();
        }
      });
      return;
    }
    this.handleIdle();
  };

  protected handleIdle = () => {
    if (!this._loaded) {
      const initialFocused = this._initialFocused;
      const initialSelectedRange = this._selectionMoved
        ? undefined
        : this._initialSelectedRange;
      const initialVisibleRange =
        this._initialVisibleRange == null ||
        typeof this._initialVisibleRange === "string"
          ? initialSelectedRange
          : this._initialVisibleRange;
      const scrollStrategy =
        typeof this._initialVisibleRange === "string"
          ? this._initialVisibleRange
          : undefined;
      if (!this._selectionMoved && !this._viewScrolled) {
        this.scrollToRange(initialVisibleRange, scrollStrategy);
      }
      if (initialSelectedRange) {
        this.settleSelection(initialSelectedRange, false);
      }
      this._selectionMoved = false;
      const view = this._view;
      if (document.hasFocus() && this._view) {
        clearInterval(this._focusIntervalTimeout);
        this._focusIntervalTimeout = window.setInterval(() => {
          if (
            this._view !== view ||
            !this._view ||
            this._view.hasFocus ||
            !initialSelectedRange ||
            this._selectionMoved ||
            this._viewScrolled ||
            this.isSelectionRangeVisible(initialSelectedRange)
          ) {
            clearInterval(this._focusIntervalTimeout);
            return;
          }
          this.settleSelection(
            initialSelectedRange,
            scrollStrategy ?? false,
            initialFocused && !this._focusLeft,
          );
        }, 100);
      }
      if (this._textDocument) {
        this.revealEditor();
      }
      if (this._view) {
        this.bindView(this._view);
      }
      this._loaded = true;
      if (this._focusWhenLoaded) {
        this._focusWhenLoaded = false;
        this.requestFocus();
      }
    }
  };

  protected handlePointerEnterScroller = () => {
    this._userInitiatedScroll = true;
    if (this._textDocument) {
      sendProtocolMessage(
        HoveredOnEditorMessage.type.notification({
          textDocument: this._textDocument,
        }),
        this.host,
      );
    }
  };

  protected handlePointerLeaveScroller = () => {
    this._userInitiatedScroll = false;
    if (this._textDocument) {
      sendProtocolMessage(
        HoveredOffEditorMessage.type.notification({
          textDocument: this._textDocument,
        }),
        this.host,
      );
    }
  };

  protected handlePointerScroll = (e: Event) => {
    const visibleRange = this.measureVisibleRange();
    if (visibleRange) {
      if (
        visibleRange.start.line !== this._visibleRange?.start?.line ||
        visibleRange.end.line !== this._visibleRange?.end?.line
      ) {
        if (this._textDocument) {
          if (this._userInitiatedScroll) {
            this.cacheVisibleRange(visibleRange);
            sendProtocolMessage(
              ScrolledEditorMessage.type.notification({
                textDocument: this._textDocument,
                visibleRange,
                target: e.target instanceof HTMLElement ? "element" : "window",
              }),
              this.host,
            );
          }
        }
      }
    }
  };

  protected measureVisibleRange() {
    const scrollTarget = this._scroller;
    const view = this._view;
    if (view && scrollTarget) {
      const scrollClientHeight = getScrollClientHeight(scrollTarget);
      const insetBottom = this._scrollMargin.bottom ?? 0;
      const scrollTop = getScrollTop(scrollTarget);
      const scrollBottom =
        scrollTop + scrollClientHeight - this._domClientY - insetBottom;
      const visibleRange = getVisibleRange(view, scrollTop, scrollBottom);
      return visibleRange;
    }
    return undefined;
  }

  protected allowEditing(allowed: boolean) {
    if (allowed) {
      this._view?.dispatch({
        effects: [
          readOnlyConfig.reconfigure(EditorState.readOnly.of(false)),
          editableConfig.reconfigure(EditorView.editable.of(true)),
        ],
      });
    } else {
      this._view?.dispatch({
        effects: [
          readOnlyConfig.reconfigure(EditorState.readOnly.of(true)),
          editableConfig.reconfigure(EditorView.editable.of(false)),
        ],
      });
    }
  }
}
