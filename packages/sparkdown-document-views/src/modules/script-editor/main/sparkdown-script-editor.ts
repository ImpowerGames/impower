import { EditorSelection, EditorState, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { TextDocumentSaveReason } from "../../../../../spark-editor-protocol/src/enums/TextDocumentSaveReason";
import { ChangedEditorBreakpointsMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/ChangedEditorBreakpointsMessage";
import { FocusedEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/FocusedEditorMessage";
import { HoveredOnEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/HoveredOnEditorMessage";
import { HoveredOffEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/HoveredOffEditorMessage";
import { LoadEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/LoadEditorMessage";
import { ScrolledEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import { SelectedEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import { UnfocusedEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/UnfocusedEditorMessage";
import { SearchEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/SearchEditorMessage";
import { HideEditorStatusBarMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/HideEditorStatusBarMessage";
import { ShowEditorStatusBarMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/ShowEditorStatusBarMessage";
import { HoveredOnPreviewMessage } from "../../../../../spark-editor-protocol/src/protocols/preview/HoveredOnPreviewMessage";
import { ScrolledPreviewMessage } from "../../../../../spark-editor-protocol/src/protocols/preview/ScrolledPreviewMessage";
import { SelectedPreviewMessage } from "../../../../../spark-editor-protocol/src/protocols/preview/SelectedPreviewMessage";
import { DidChangeTextDocumentMessage } from "../../../../../spark-editor-protocol/src/protocols/textDocument/DidChangeTextDocumentMessage";
import { DidCloseTextDocumentMessage } from "../../../../../spark-editor-protocol/src/protocols/textDocument/DidCloseTextDocumentMessage";
import { DidOpenTextDocumentMessage } from "../../../../../spark-editor-protocol/src/protocols/textDocument/DidOpenTextDocumentMessage";
import { DidSaveTextDocumentMessage } from "../../../../../spark-editor-protocol/src/protocols/textDocument/DidSaveTextDocumentMessage";
import { WillSaveTextDocumentMessage } from "../../../../../spark-editor-protocol/src/protocols/textDocument/WillSaveTextDocumentMessage";
import { DidCollapsePreviewPaneMessage } from "../../../../../spark-editor-protocol/src/protocols/window/DidCollapsePreviewPaneMessage";
import { DidExpandPreviewPaneMessage } from "../../../../../spark-editor-protocol/src/protocols/window/DidExpandPreviewPaneMessage";
import { ShowDocumentMessage } from "../../../../../spark-editor-protocol/src/protocols/window/ShowDocumentMessage";
import {
  MessageConnection,
  Range,
  ServerCapabilities,
  TextDocumentItem,
} from "../../../../../spark-editor-protocol/src/types";
import { Component } from "../../../../../spec-component/src/component";
import getBoxValues from "../../../../../spec-component/src/utils/getBoxValues";
import { FileSystemReader } from "../../../cm-language-client/types/FileSystemReader";
import { positionToOffset } from "../../../cm-language-client/utils/positionToOffset";
import { getScrollClientHeight } from "../../../utils/getScrollClientHeight";
import { getScrollTop } from "../../../utils/getScrollTop";
import { getVisibleRange } from "../../../utils/getVisibleRange";
import { scrollY } from "../../../utils/scrollY";
import createEditorView, {
  editable,
  readOnly,
} from "../utils/createEditorView";
import spec from "./_sparkdown-script-editor";
import { openSearchPanel, searchPanelOpen } from "@codemirror/search";
import getUnitlessValue from "../../../../../spec-component/src/utils/getUnitlessValue";
import { getDocumentVersion } from "../../../cm-versioning/versioning";
import { gotoLinePanelOpen } from "../panels/GotoLinePanel";
import { getScrollableParent } from "../../../utils/getScrollableParent";
import { getServerChanges } from "../../../cm-language-client/utils/getServerChanges";
import { offsetToPosition } from "../../../cm-language-client/utils/offsetToPosition";

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
    window.addEventListener(LoadEditorMessage.method, this.handleLoadEditor);
    window.addEventListener(
      ShowDocumentMessage.method,
      this.handleShowDocument
    );
    window.addEventListener(
      HoveredOnPreviewMessage.method,
      this.handlePointerLeaveScroller
    );
    window.addEventListener(
      DidExpandPreviewPaneMessage.method,
      this.handleExpandPreviewPane
    );
    window.addEventListener(
      DidCollapsePreviewPaneMessage.method,
      this.handleCollapsePreviewPane
    );
    window.addEventListener(
      ScrolledPreviewMessage.method,
      this.handleScrolledPreview
    );
    window.addEventListener(
      SelectedPreviewMessage.method,
      this.handleSelectedPreview
    );
    window.addEventListener(
      SearchEditorMessage.method,
      this.handleSearchEditor
    );
    window.addEventListener(
      ShowEditorStatusBarMessage.method,
      this.handleShowEditorStatusBar
    );
    window.addEventListener(
      HideEditorStatusBarMessage.method,
      this.handleHideEditorStatusBar
    );
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
    window.removeEventListener(LoadEditorMessage.method, this.handleLoadEditor);
    window.removeEventListener(
      ShowDocumentMessage.method,
      this.handleShowDocument
    );
    window.removeEventListener(
      HoveredOnPreviewMessage.method,
      this.handlePointerLeaveScroller
    );
    window.removeEventListener(
      DidExpandPreviewPaneMessage.method,
      this.handleExpandPreviewPane
    );
    window.removeEventListener(
      DidCollapsePreviewPaneMessage.method,
      this.handleCollapsePreviewPane
    );
    window.removeEventListener(
      ScrolledPreviewMessage.method,
      this.handleScrolledPreview
    );
    window.removeEventListener(
      SelectedPreviewMessage.method,
      this.handleSelectedPreview
    );
    window.removeEventListener(
      SearchEditorMessage.method,
      this.handleSearchEditor
    );
    window.removeEventListener(
      ShowEditorStatusBarMessage.method,
      this.handleShowEditorStatusBar
    );
    window.removeEventListener(
      HideEditorStatusBarMessage.method,
      this.handleHideEditorStatusBar
    );
    if (this._textDocument) {
      SparkdownScriptEditor.languageServerConnection.sendNotification(
        DidCloseTextDocumentMessage.type,
        { textDocument: this._textDocument }
      );
      if (this._editing) {
        this.emit(
          UnfocusedEditorMessage.method,
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

  protected handleLoadEditor = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (LoadEditorMessage.type.isRequest(message)) {
        const params = message.params;
        const textDocument = params.textDocument;
        const focused = params.focused;
        const visibleRange = params.visibleRange;
        const selectedRange = params.selectedRange;
        const breakpointRanges = params.breakpointRanges;
        const languageServerCapabilities = params.languageServerCapabilities;
        this._loadingRequest = message.id;
        SparkdownScriptEditor.languageServerCapabilities =
          languageServerCapabilities;
        this.loadTextDocument(
          textDocument,
          focused,
          visibleRange,
          selectedRange,
          breakpointRanges
        );
      }
    }
  };

  protected handleExpandPreviewPane = () => {
    this._userInitiatedScroll = false;
  };

  protected handleCollapsePreviewPane = () => {
    this.scrollToRange(this._visibleRange);
  };

  protected handleShowDocument = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (ShowDocumentMessage.type.isRequest(message)) {
        const params = message.params;
        const uri = params.uri;
        const selection = params.selection;
        const takeFocus = params.takeFocus;
        if (uri === this._textDocument?.uri) {
          if (selection) {
            if (takeFocus) {
              this.selectRange(selection, true);
            } else if (takeFocus) {
              this.scrollToRange(selection);
            }
          }
        }
      }
    }
  };

  protected handleScrolledPreview = (e: Event) => {
    if (this._loaded) {
      if (e instanceof CustomEvent) {
        const message = e.detail;
        if (ScrolledPreviewMessage.type.isNotification(message)) {
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
      }
    }
  };

  protected handleSelectedPreview = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (SelectedPreviewMessage.type.isNotification(message)) {
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
      }
    }
  };

  protected handleSearchEditor = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (SearchEditorMessage.type.isRequest(message)) {
        const params = message.params;
        const textDocument = params.textDocument;
        if (textDocument.uri === this._textDocument?.uri) {
          this.openSearchPanel();
        }
      }
    }
  };

  protected handleShowEditorStatusBar = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (ShowEditorStatusBarMessage.type.isRequest(message)) {
        const bottomPanels =
          this.root.querySelector<HTMLElement>(".cm-panels-bottom");
        if (bottomPanels) {
          bottomPanels.style.opacity = "0";
          bottomPanels.style.transition = "opacity 150ms";
          bottomPanels.hidden = false;
          this.ref.placeholder.hidden = true;
          window.requestAnimationFrame(() => {
            if (bottomPanels) {
              bottomPanels.style.opacity = "1";
            }
          });
        }
      }
    }
  };

  protected handleHideEditorStatusBar = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (HideEditorStatusBarMessage.type.isRequest(message)) {
        const bottomPanels =
          this.root.querySelector<HTMLElement>(".cm-panels-bottom");
        if (bottomPanels) {
          bottomPanels.hidden = true;
          this.ref.placeholder.hidden = false;
        }
      }
    }
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
    breakpointRanges: Range[] | undefined
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
    const mainContainer = this.ref.main;
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
        breakpoints: breakpointRanges?.map((range) => range.start.line + 1),
        scrollToLineNumber: (visibleRange?.start.line ?? 0) + 1,
        onIdle: this.handleIdle,
        onFocus: () => {
          this._editing = true;
          if (this._textDocument) {
            this.emit(
              FocusedEditorMessage.method,
              FocusedEditorMessage.type.notification({
                textDocument: this._textDocument,
              })
            );
          }
        },
        onBlur: () => {
          this._editing = false;
          if (this._textDocument) {
            if (!this._searchInputFocused) {
              // Editor is still considered focused if focus was moved to search input
              this.emit(
                UnfocusedEditorMessage.method,
                UnfocusedEditorMessage.type.notification({
                  textDocument: this._textDocument,
                })
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
              const contentChanges = getServerChanges(
                tr.startState.doc,
                tr.changes
              );
              // TODO: Figure out how to support incremental changes in language server
              // Incremental changes in language server aren't correctly applied when auto-surrounding text with brackets
              // So just send the entire `after` text to the server
              SparkdownScriptEditor.languageServerConnection.sendNotification(
                DidChangeTextDocumentMessage.type,
                {
                  textDocument: {
                    uri,
                    version: afterVersion,
                  },
                  contentChanges: [{ text: after }],
                }
              );
              this.emit(
                DidChangeTextDocumentMessage.method,
                DidChangeTextDocumentMessage.type.notification({
                  textDocument: {
                    uri,
                    version: afterVersion,
                  },
                  contentChanges,
                })
              );
              this.emit(
                WillSaveTextDocumentMessage.method,
                WillSaveTextDocumentMessage.type.notification({
                  textDocument: { uri },
                  reason: TextDocumentSaveReason.AfterDelay,
                })
              );
              this.emit(
                DidSaveTextDocumentMessage.method,
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
              SelectedEditorMessage.method,
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
        onBreakpointsChanged: (update, breakpoints) => {
          const uri = this._textDocument?.uri;
          if (uri) {
            this.emit(
              ChangedEditorBreakpointsMessage.method,
              ChangedEditorBreakpointsMessage.type.notification({
                textDocument: { uri },
                breakpointRanges: breakpoints.map((lineNumber) => {
                  return {
                    start: offsetToPosition(
                      update.state.doc,
                      update.state.doc.line(lineNumber).from
                    ),
                    end: offsetToPosition(
                      update.state.doc,
                      update.state.doc.line(lineNumber).to
                    ),
                  };
                }),
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
      DidOpenTextDocumentMessage.method,
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

  protected scrollToRange(range: Range | undefined) {
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
                y: "start",
              }
            ),
          });
        }
      }
    }
  }

  protected selectRange(range: Range, scrollIntoView: boolean) {
    const view = this._view;
    if (view) {
      const doc = view.state.doc;
      const anchor = positionToOffset(doc, range.start);
      const head = positionToOffset(doc, range.end);
      view.dispatch({
        selection: EditorSelection.create([
          EditorSelection.range(anchor, head),
        ]),
        scrollIntoView,
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
        this.emit(
          LoadEditorMessage.method,
          LoadEditorMessage.type.response(this._loadingRequest, null)
        );
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
        HoveredOnEditorMessage.method,
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
        HoveredOffEditorMessage.method,
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
              ScrolledEditorMessage.method,
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
