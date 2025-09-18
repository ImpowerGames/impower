import { openSearchPanel, searchPanelOpen } from "@codemirror/search";
import { EditorSelection, EditorState, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { TextDocumentSaveReason } from "@impower/spark-editor-protocol/src/enums/TextDocumentSaveReason";
import { ChangedEditorBreakpointsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorBreakpointsMessage";
import { ChangedEditorHighlightsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorHighlightsMessage";
import { ChangedEditorPinpointsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorPinpointsMessage";
import { FocusedEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/FocusedEditorMessage";
import {
  HideEditorStatusBarMessage,
  HideEditorStatusBarMethod,
  HideEditorStatusBarParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/HideEditorStatusBarMessage";
import { HoveredOffEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/HoveredOffEditorMessage";
import { HoveredOnEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/HoveredOnEditorMessage";
import {
  LoadEditorMessage,
  LoadEditorMethod,
  LoadEditorParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/LoadEditorMessage";
import { ScrolledEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import {
  SearchEditorMessage,
  SearchEditorMethod,
  SearchEditorParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/SearchEditorMessage";
import { SelectedEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import { SetEditorHighlightsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SetEditorHighlightsMessage";
import { SetEditorPinpointsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SetEditorPinpointsMessage";
import {
  ShowEditorStatusBarMessage,
  ShowEditorStatusBarMethod,
  ShowEditorStatusBarParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/ShowEditorStatusBarMessage";
import { UnfocusedEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/UnfocusedEditorMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
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
import { DidCloseTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidCloseTextDocumentMessage";
import { DidOpenTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidOpenTextDocumentMessage";
import { DidSaveTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidSaveTextDocumentMessage";
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
import {
  ShowDocumentMessage,
  ShowDocumentMethod,
} from "@impower/spark-editor-protocol/src/protocols/window/ShowDocumentMessage";
import {
  MessageConnection,
  Range,
  ServerCapabilities,
  ShowDocumentParams,
  TextDocumentItem,
} from "@impower/spark-editor-protocol/src/types";
import { NotificationMessage } from "@impower/spark-editor-protocol/src/types/base/NotificationMessage";
import { RequestMessage } from "@impower/spark-editor-protocol/src/types/base/RequestMessage";
import { Component } from "../../../../../spec-component/src/component";
import getBoxValues from "../../../../../spec-component/src/utils/getBoxValues";
import getUnitlessValue from "../../../../../spec-component/src/utils/getUnitlessValue";
import { setHighlights } from "../../../cm-highlight-lines/highlightLines";
import { FileSystemReader } from "../../../cm-language-client/types/FileSystemReader";
import { getServerChanges } from "../../../cm-language-client/utils/getServerChanges";
import { offsetToPosition } from "../../../cm-language-client/utils/offsetToPosition";
import { positionToOffset } from "../../../cm-language-client/utils/positionToOffset";
import { setPinpoints } from "../../../cm-pinpoints/pinpoints";
import { getDocumentVersion } from "../../../cm-versioning/versioning";
import { getScrollableParent } from "../../../utils/getScrollableParent";
import { getScrollClientHeight } from "../../../utils/getScrollClientHeight";
import { getScrollTop } from "../../../utils/getScrollTop";
import { getVisibleRange } from "../../../utils/getVisibleRange";
import { scrollY } from "../../../utils/scrollY";
import { gotoLinePanelOpen } from "../panels/GotoLinePanel";
import createEditorView, {
  editable,
  readOnly,
} from "../utils/createEditorView";
import spec from "./_sparkdown-script-editor";

export default class SparkdownScriptEditor extends Component(spec) {
  static languageServerConnection: MessageConnection;

  static languageServerCapabilities: ServerCapabilities;

  static fileSystemReader: FileSystemReader;

  protected _loadingRequest?: string | number;

  protected _initialFocused?: boolean;

  protected _initialVisibleRange?: Range;

  protected _initialSelectedRange?: Range;

  protected _loaded = false;

  protected _editing = false;

  protected _textDocument?: TextDocumentItem;

  protected _view?: EditorView;

  protected _disposable?: { dispose: () => void };

  protected _scroller?: Window | Element | null;

  protected _visibleRange?: Range;

  protected _domClientY = 0;

  protected _userInitiatedScroll = false;

  protected _searching = false;

  protected _searchInputFocused = false;

  protected _breakpoints: number[] = [];

  protected _highlightedLines = new Set<number>();

  protected _scrollMargin: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  } = {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  };

  protected _top: number = 0;

  protected _bottom: number = 0;

  protected _focusIntervalTimeout = 0;

  override onConnected() {
    this.root.addEventListener("touchstart", this.handlePointerEnterScroller, {
      passive: true,
    });
    this.root.addEventListener("mouseenter", this.handlePointerEnterScroller, {
      passive: true,
    });
    this.root.addEventListener("mouseleave", this.handlePointerLeaveScroller, {
      passive: true,
    });
    window.addEventListener(MessageProtocol.event, this.handleProtocol);
  }

  override onDisconnected() {
    this.root.removeEventListener(
      "touchstart",
      this.handlePointerEnterScroller
    );
    this.root.removeEventListener(
      "mouseenter",
      this.handlePointerEnterScroller
    );
    this.root.removeEventListener(
      "mouseleave",
      this.handlePointerLeaveScroller
    );
    window.removeEventListener(MessageProtocol.event, this.handleProtocol);
    if (this._textDocument) {
      SparkdownScriptEditor.languageServerConnection.sendNotification(
        DidCloseTextDocumentMessage.type,
        { textDocument: this._textDocument }
      );
      if (this._editing) {
        this.emit(
          MessageProtocol.event,
          UnfocusedEditorMessage.type.notification({
            textDocument: this._textDocument,
          })
        );
      }
    }
    const view = this._view;
    if (view) {
      this.unbindView(view);
    }
  }

  protected handleProtocol = async (e: Event) => {
    if (e instanceof CustomEvent) {
      if (ShowDocumentMessage.type.is(e.detail)) {
        this.handleShowDocument(e.detail);
      }
      if (LoadEditorMessage.type.is(e.detail)) {
        const response = await this.handleLoadEditor(e.detail);
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (SearchEditorMessage.type.is(e.detail)) {
        const response = await this.handleSearchEditor(e.detail);
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (ShowEditorStatusBarMessage.type.is(e.detail)) {
        const response = await this.handleShowEditorStatusBar(e.detail);
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (HideEditorStatusBarMessage.type.is(e.detail)) {
        const response = await this.handleHideEditorStatusBar(e.detail);
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (HoveredOnPreviewMessage.type.is(e.detail)) {
        this.handlePointerLeaveScroller();
      }
      if (DidExpandPreviewPaneMessage.type.is(e.detail)) {
        this.handleDidExpandPreviewPane(e.detail);
      }
      if (DidCollapsePreviewPaneMessage.type.is(e.detail)) {
        this.handleDidCollapsePreviewPane(e.detail);
      }
      if (ScrolledPreviewMessage.type.is(e.detail)) {
        this.handleScrolledPreview(e.detail);
      }
      if (SelectedPreviewMessage.type.is(e.detail)) {
        this.handleSelectedPreview(e.detail);
      }
      if (SetEditorHighlightsMessage.type.is(e.detail)) {
        const response = await this.handleSetEditorHighlights(e.detail);
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (SetEditorPinpointsMessage.type.is(e.detail)) {
        const response = await this.handleSetEditorPinpoints(e.detail);
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
    }
  };

  override onAttributeChanged(name: string, newValue: string) {
    if (name === SparkdownScriptEditor.attrs.readonly) {
      if (newValue != null) {
        this._view?.dispatch({
          effects: [
            readOnly.reconfigure(EditorState.readOnly.of(true)),
            editable.reconfigure(EditorView.editable.of(false)),
          ],
        });
      } else {
        this._view?.dispatch({
          effects: [
            readOnly.reconfigure(EditorState.readOnly.of(false)),
            editable.reconfigure(EditorView.editable.of(true)),
          ],
        });
      }
    }
  }

  protected bindView(view: EditorView) {
    this._domClientY = view.dom.offsetTop;
    this._scroller = getScrollableParent(view.scrollDOM);
    this._scroller?.addEventListener("scroll", this.handlePointerScroll);
  }

  protected unbindView(view: EditorView) {
    this._scroller?.removeEventListener("scroll", this.handlePointerScroll);
    view.destroy();
    if (this._disposable) {
      this._disposable.dispose();
    }
  }

  protected handleLoadEditor = (
    message: RequestMessage<LoadEditorMethod, LoadEditorParams>
  ) => {
    const params = message.params;
    const textDocument = params.textDocument;
    const focused = params.focused;
    const visibleRange = params.visibleRange;
    const selectedRange = params.selectedRange;
    const breakpointLines = params.breakpointLines;
    const pinpointLines = params.pinpointLines;
    const highlightLines = params.highlightLines;
    const languageServerCapabilities = params.languageServerCapabilities;
    this._loadingRequest = message.id;
    SparkdownScriptEditor.languageServerCapabilities =
      languageServerCapabilities;
    this.loadTextDocument(
      textDocument,
      focused,
      visibleRange,
      selectedRange,
      breakpointLines,
      pinpointLines,
      highlightLines
    );
    return LoadEditorMessage.type.response(message.id, {});
  };

  protected handleDidExpandPreviewPane = (
    _message: NotificationMessage<
      DidExpandPreviewPaneMethod,
      DidExpandPreviewPaneParams
    >
  ) => {
    this._userInitiatedScroll = false;
  };

  protected handleDidCollapsePreviewPane = (
    _message: NotificationMessage<
      DidCollapsePreviewPaneMethod,
      DidCollapsePreviewPaneParams
    >
  ) => {
    this.scrollToRange(this._visibleRange);
  };

  protected handleShowDocument = (
    message: RequestMessage<ShowDocumentMethod, ShowDocumentParams>
  ) => {
    const params = message.params;
    const uri = params.uri;
    const selection = params.selection;
    const takeFocus = params.takeFocus;
    if (uri === this._textDocument?.uri) {
      if (selection) {
        if (takeFocus) {
          this.selectRange(selection, "center");
        } else {
          this.scrollToRange(selection, "center");
        }
      }
    }
  };

  protected handleScrolledPreview = (
    message: NotificationMessage<ScrolledPreviewMethod, ScrolledPreviewParams>
  ) => {
    if (this._loaded) {
      this._userInitiatedScroll = false;
      const params = message.params;
      const textDocument = params.textDocument;
      const range = params.visibleRange;
      const target = params.target;
      if (textDocument.uri === this._textDocument?.uri) {
        if (target === "element") {
          this.scrollToRange(range);
        } else {
          this.cacheVisibleRange(range);
        }
      }
    }
  };

  protected handleSelectedPreview = (
    message: NotificationMessage<SelectedPreviewMethod, SelectedPreviewParams>
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

  protected handleSearchEditor = (
    message: RequestMessage<SearchEditorMethod, SearchEditorParams>
  ) => {
    const params = message.params;
    const textDocument = params.textDocument;
    if (textDocument.uri === this._textDocument?.uri) {
      this.openSearchPanel();
      return SearchEditorMessage.type.response(message.id, {});
    }
    return undefined;
  };

  protected handleShowEditorStatusBar = (
    message: RequestMessage<
      ShowEditorStatusBarMethod,
      ShowEditorStatusBarParams
    >
  ) => {
    const bottomPanels =
      this.root.querySelector<HTMLElement>(".cm-panels-bottom");
    if (bottomPanels) {
      bottomPanels.style.opacity = "0";
      bottomPanels.style.transition = "opacity 150ms";
      bottomPanels.hidden = false;
      this.refs.placeholder.hidden = true;
      window.requestAnimationFrame(() => {
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
    >
  ) => {
    const bottomPanels =
      this.root.querySelector<HTMLElement>(".cm-panels-bottom");
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
    message: SetEditorHighlightsMessage.Request
  ) => {
    const { locations } = message.params;
    if (this._view) {
      setHighlights(
        this._view,
        locations
          .filter((l) => l.uri === this._textDocument?.uri)
          .map((l) => l.range.start.line + 1)
      );
    }
    return SetEditorHighlightsMessage.type.response(message.id, {});
  };

  protected handleSetEditorPinpoints = (
    message: SetEditorPinpointsMessage.Request
  ) => {
    const { locations } = message.params;
    if (this._view) {
      setPinpoints(
        this._view,
        locations
          .filter((l) => l.uri === this._textDocument?.uri)
          .map((l) => l.range.start.line + 1)
      );
    }
    return SetEditorPinpointsMessage.type.response(message.id, {});
  };

  protected handleFocusFindInput = () => {
    this.emit("input/focused");
    this._searchInputFocused = true;
  };

  protected handleBlurFindInput = () => {
    this.emit("input/unfocused");
    this._searchInputFocused = false;
  };

  protected handleFocusReplaceInput = () => {
    this.emit("input/focused");
    this._searchInputFocused = true;
  };

  protected handleBlurReplaceInput = () => {
    this.emit("input/unfocused");
    this._searchInputFocused = false;
  };

  protected handleFocusGotoLineInput = () => {
    this.emit("input/focused");
    this._searchInputFocused = true;
  };

  protected handleBlurGotoLineInput = () => {
    this.emit("input/unfocused");
    this._searchInputFocused = false;
  };

  protected loadTextDocument(
    textDocument: TextDocumentItem,
    focused: boolean | undefined,
    visibleRange: Range | undefined,
    selectedRange: Range | undefined,
    breakpointLines: number[] | undefined,
    pinpointLines: number[] | undefined,
    highlightLines: number[] | undefined
  ) {
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
    this._searching = false;
    this._searchInputFocused = false;
    this._textDocument = textDocument;
    const mainContainer = this.refs.main;
    if (mainContainer) {
      this._scrollMargin = getBoxValues(this.scrollMargin);
      this._top = getUnitlessValue(this.top, 0);
      this._bottom = getUnitlessValue(this.bottom, 0);
      [this._view, this._disposable] = createEditorView(mainContainer, {
        serverConnection: SparkdownScriptEditor.languageServerConnection,
        serverCapabilities: SparkdownScriptEditor.languageServerCapabilities,
        fileSystemReader: SparkdownScriptEditor.fileSystemReader,
        textDocument: this._textDocument,
        scrollMargin: this._scrollMargin,
        top: this._top,
        bottom: this._bottom,
        breakpointLineNumbers: breakpointLines?.map((line) => line + 1),
        pinpointLineNumbers: pinpointLines?.map((line) => line + 1),
        highlightLineNumbers: highlightLines?.map((line) => line + 1),
        scrollToLineNumber: (visibleRange?.start.line ?? 0) + 1,
        onIdle: this.handleIdle,
        onFocus: () => {
          this._editing = true;
          if (this._textDocument) {
            this.emit(
              MessageProtocol.event,
              FocusedEditorMessage.type.notification({
                textDocument: this._textDocument,
              })
            );
            this.emit("input/focused");
          }
        },
        onBlur: () => {
          this._editing = false;
          if (this._textDocument) {
            if (!this._searchInputFocused) {
              // Editor is still considered focused if focus was moved to search input
              this.emit(
                MessageProtocol.event,
                UnfocusedEditorMessage.type.notification({
                  textDocument: this._textDocument,
                })
              );
              this.emit("input/unfocused");
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
              const contentChanges = getServerChanges(
                tr.startState.doc,
                tr.changes
              );
              SparkdownScriptEditor.languageServerConnection.sendNotification(
                DidChangeTextDocumentMessage.type,
                {
                  textDocument: {
                    uri,
                    version: afterVersion,
                  },
                  contentChanges,
                }
              );
              this.emit(
                MessageProtocol.event,
                DidChangeTextDocumentMessage.type.notification({
                  textDocument: {
                    uri,
                    version: afterVersion,
                  },
                  contentChanges,
                })
              );
              this.emit(
                MessageProtocol.event,
                WillSaveTextDocumentMessage.type.notification({
                  textDocument: { uri },
                  reason: TextDocumentSaveReason.AfterDelay,
                })
              );
              this.emit(
                MessageProtocol.event,
                DidSaveTextDocumentMessage.type.notification({
                  textDocument: { uri },
                  text: after,
                })
              );
            }
          }
          return null;
        },
        onSelectionChanged: (update, anchor, head) => {
          const uri = this._textDocument?.uri;
          if (uri) {
            this.emit(
              MessageProtocol.event,
              SelectedEditorMessage.type.notification({
                textDocument: { uri },
                selectedRange: {
                  start: offsetToPosition(update.state.doc, anchor),
                  end: offsetToPosition(update.state.doc, head),
                },
                docChanged: update.docChanged,
                userEvent: update.transactions.some((tr) =>
                  tr.annotation(Transaction.userEvent)
                ),
              })
            );
          }
        },
        onBreakpointsChanged: (update, breakpointLineNumbers) => {
          const uri = this._textDocument?.uri;
          if (uri) {
            this.emit(
              MessageProtocol.event,
              ChangedEditorBreakpointsMessage.type.notification({
                textDocument: { uri },
                breakpointLines: breakpointLineNumbers.map(
                  (lineNumber) => lineNumber - 1
                ),
              })
            );
          }
        },
        onPinpointsChanged: (update, pinpointLineNumbers) => {
          const uri = this._textDocument?.uri;
          if (uri) {
            this.emit(
              MessageProtocol.event,
              ChangedEditorPinpointsMessage.type.notification({
                textDocument: { uri },
                pinpointLines: pinpointLineNumbers.map(
                  (lineNumber) => lineNumber - 1
                ),
              })
            );
          }
        },
        onHighlightsChanged: (update, highlightLineNumbers) => {
          const uri = this._textDocument?.uri;
          if (uri) {
            this.emit(
              MessageProtocol.event,
              ChangedEditorHighlightsMessage.type.notification({
                textDocument: { uri },
                highlightLines: highlightLineNumbers.map(
                  (lineNumber) => lineNumber - 1
                ),
              })
            );
          }
        },
        onViewUpdate: (update) => {
          if (
            searchPanelOpen(update.state) ||
            gotoLinePanelOpen(update.state)
          ) {
            if (!this._searching) {
              // Opened panel
              const findInput = this.root.querySelector(
                ".cm-search input[name='search']"
              );
              if (findInput) {
                findInput.addEventListener("focus", this.handleFocusFindInput);
                findInput.addEventListener("blur", this.handleBlurFindInput);
                // findInput starts focused
                this.handleFocusFindInput();
              }
              const replaceInput = this.root.querySelector(
                ".cm-search input[name='replace']"
              );
              if (replaceInput) {
                replaceInput.addEventListener(
                  "focus",
                  this.handleFocusReplaceInput
                );
                replaceInput.addEventListener(
                  "blur",
                  this.handleBlurReplaceInput
                );
              }
              const gotoLineInput =
                this.root.querySelector(".cm-gotoLine input");
              if (gotoLineInput) {
                gotoLineInput.addEventListener(
                  "focus",
                  this.handleFocusGotoLineInput
                );
                gotoLineInput.addEventListener(
                  "blur",
                  this.handleBlurGotoLineInput
                );
                // gotoLineInput starts focused
                this.handleFocusGotoLineInput();
              }
            }
            this._searching = true;
          } else {
            this._searching = false;
          }
        },
      });
    }
    SparkdownScriptEditor.languageServerConnection.sendNotification(
      DidOpenTextDocumentMessage.type,
      { textDocument }
    );
    this.emit(
      MessageProtocol.event,
      DidOpenTextDocumentMessage.type.notification({ textDocument })
    );
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
    strategy: "nearest" | "start" | "end" | "center" = "start"
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
            Math.min(Math.max(1, startLineNumber), doc.lines)
          );
          view.dispatch({
            effects: EditorView.scrollIntoView(
              EditorSelection.range(line.from, line.to),
              {
                y: strategy,
              }
            ),
          });
        }
      }
    }
  }

  protected selectRange(
    range: Range,
    scrollIntoView: "nearest" | "start" | "end" | "center" | false
  ) {
    const view = this._view;
    if (view) {
      const doc = view.state.doc;
      const anchor = positionToOffset(doc, range.start);
      const head = positionToOffset(doc, range.end);
      view.dispatch({
        selection: EditorSelection.create([
          EditorSelection.range(anchor, head),
        ]),
        effects:
          typeof scrollIntoView === "string"
            ? EditorView.scrollIntoView(EditorSelection.range(anchor, head), {
                y: scrollIntoView,
              })
            : undefined,
      });
    }
  }

  protected openSearchPanel() {
    const view = this._view;
    if (view) {
      openSearchPanel(view);
    }
  }

  protected handleIdle = () => {
    if (!this._loaded) {
      const initialFocused = this._initialFocused;
      const initialVisibleRange = this._initialVisibleRange;
      const initialSelectedRange = this._initialSelectedRange;
      // Restore visible range
      this.scrollToRange(initialVisibleRange);
      // Try to restore focus
      const view = this._view;
      if (document.hasFocus() && this._view && initialFocused) {
        clearInterval(this._focusIntervalTimeout);
        this._focusIntervalTimeout = window.setInterval(() => {
          if (this._view !== view || !this._view || this._view.hasFocus) {
            clearInterval(this._focusIntervalTimeout);
            return;
          }
          this.focus({ preventScroll: true });
          this._view.focus();
          if (initialSelectedRange) {
            // Only restore selectedRange if was focused
            this.selectRange(initialSelectedRange, false);
          }
        }, 100);
      }
      if (this._textDocument && this._loadingRequest != null) {
        // Only fade in once formatting has finished being applied and height is stable
        this.root.style.opacity = "1";
        this._loadingRequest = undefined;
      }
      if (this._view) {
        this.bindView(this._view);
      }
      this._loaded = true;
    }
  };

  protected handlePointerEnterScroller = () => {
    this._userInitiatedScroll = true;
    if (this._textDocument) {
      this.emit(
        MessageProtocol.event,
        HoveredOnEditorMessage.type.notification({
          textDocument: this._textDocument,
        })
      );
    }
  };

  protected handlePointerLeaveScroller = () => {
    this._userInitiatedScroll = false;
    if (this._textDocument) {
      this.emit(
        MessageProtocol.event,
        HoveredOffEditorMessage.type.notification({
          textDocument: this._textDocument,
        })
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
            this.emit(
              MessageProtocol.event,
              ScrolledEditorMessage.type.notification({
                textDocument: this._textDocument,
                visibleRange,
                target: e.target instanceof HTMLElement ? "element" : "window",
              })
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
}

declare global {
  interface HTMLElementTagNameMap {
    "sparkdown-script-editor": SparkdownScriptEditor;
  }
}
