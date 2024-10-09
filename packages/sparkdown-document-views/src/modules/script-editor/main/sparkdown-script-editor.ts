import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { TextDocumentSaveReason } from "../../../../../spark-editor-protocol/src/enums/TextDocumentSaveReason";
import { ChangedEditorBreakpointsMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/ChangedEditorBreakpointsMessage";
import { FocusedEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/FocusedEditorMessage";
import { HoveredOnEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/HoveredOnEditorMessage";
import { LoadEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/LoadEditorMessage";
import { ScrolledEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import { SelectedEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import { UnfocusedEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/UnfocusedEditorMessage";
import { SearchEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/SearchEditorMessage";
import { HoveredOnPreviewMessage } from "../../../../../spark-editor-protocol/src/protocols/preview/HoveredOnPreviewMessage";
import { ScrolledPreviewMessage } from "../../../../../spark-editor-protocol/src/protocols/preview/ScrolledPreviewMessage";
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
import { closestAncestor } from "../../../utils/closestAncestor";
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

export default class SparkdownScriptEditor extends Component(spec) {
  static languageServerConnection: MessageConnection;

  static languageServerCapabilities: ServerCapabilities;

  static fileSystemReader: FileSystemReader;

  protected _loadingRequest?: string | number;

  protected _initialized = false;

  protected _loaded = false;

  protected _editing = false;

  protected _textDocument?: TextDocumentItem;

  protected _view?: EditorView;

  protected _disposable?: { dispose: () => void };

  protected _possibleScroller?: HTMLElement | null;

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

  override onConnected() {
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
      SearchEditorMessage.method,
      this.handleSearchEditor
    );
  }

  override onDisconnected() {
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
      SearchEditorMessage.method,
      this.handleSearchEditor
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
    this._possibleScroller = closestAncestor(`.scrollable`, view.scrollDOM);
    this._possibleScroller?.addEventListener(
      "scroll",
      this.handlePointerScroll
    );
    window.addEventListener("scroll", this.handlePointerScroll);
    view.scrollDOM.addEventListener("scroll", this.handlePointerScroll);
    view.dom.addEventListener("touchstart", this.handlePointerEnterScroller, {
      passive: true,
    });
    view.dom.addEventListener("mouseenter", this.handlePointerEnterScroller, {
      passive: true,
    });
    view.dom.addEventListener("mouseleave", this.handlePointerLeaveScroller, {
      passive: true,
    });
  }

  protected unbindView(view: EditorView) {
    this._possibleScroller?.removeEventListener(
      "scroll",
      this.handlePointerScroll
    );
    window.removeEventListener("scroll", this.handlePointerScroll);
    view.scrollDOM.removeEventListener("scroll", this.handlePointerScroll);
    view.dom.removeEventListener("touchstart", this.handlePointerEnterScroller);
    view.dom.removeEventListener("mouseenter", this.handlePointerEnterScroller);
    view.dom.removeEventListener("mouseleave", this.handlePointerLeaveScroller);
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
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (ScrolledPreviewMessage.type.isNotification(message)) {
        this._userInitiatedScroll = false;
        const params = message.params;
        const textDocument = params.textDocument;
        const range = params.range;
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

  protected loadTextDocument(
    textDocument: TextDocumentItem,
    focused: boolean | undefined,
    visibleRange: Range | undefined,
    selectedRange: Range | undefined,
    breakpointRanges: Range[] | undefined
  ) {
    if (this._view) {
      this._view.destroy();
    }
    if (this._disposable) {
      this._disposable.dispose();
    }
    this._initialized = false;
    this._loaded = false;
    this._searching = false;
    this._searchInputFocused = false;
    this._textDocument = textDocument;
    const root = this.root;
    if (root) {
      this._scrollMargin = getBoxValues(this.scrollMargin);
      this._top = getUnitlessValue(this.top, 0);
      [this._view, this._disposable] = createEditorView(root, {
        serverConnection: SparkdownScriptEditor.languageServerConnection,
        serverCapabilities: SparkdownScriptEditor.languageServerCapabilities,
        fileSystemReader: SparkdownScriptEditor.fileSystemReader,
        textDocument: this._textDocument,
        scrollMargin: this._scrollMargin,
        top: this._top,
        breakpointRanges,
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
        onEdit: (e) => {
          const { after, transaction } = e;
          if (transaction.docChanged) {
            if (this._textDocument) {
              const changeParams = {
                textDocument: this._textDocument,
                contentChanges: [{ text: after.toString() }],
                // TODO: Figure out how to support incremental changes without it breaking when auto-surrounding text
                // Incremental changes aren't correctly applied when auto-surrounding text with brackets
                // So disable incremental changes until auto-surrounding bug is fixed
                // contentChanges: getServerChanges(before, transaction.changes),
              };
              this.emit(
                DidChangeTextDocumentMessage.method,
                DidChangeTextDocumentMessage.type.notification(changeParams)
              );
              SparkdownScriptEditor.languageServerConnection.sendNotification(
                DidChangeTextDocumentMessage.type,
                changeParams
              );
              if (this._textDocument) {
                const text = e.after.toString();
                this.emit(
                  WillSaveTextDocumentMessage.method,
                  WillSaveTextDocumentMessage.type.notification({
                    textDocument: this._textDocument,
                    reason: TextDocumentSaveReason.AfterDelay,
                  })
                );
                this.emit(
                  DidSaveTextDocumentMessage.method,
                  DidSaveTextDocumentMessage.type.notification({
                    textDocument: this._textDocument,
                    text,
                  })
                );
              }
            }
          }
        },
        onSelectionChanged: ({ selectedRange, docChanged }) => {
          const uri = this._textDocument?.uri;
          if (uri) {
            this.emit(
              SelectedEditorMessage.method,
              SelectedEditorMessage.type.notification({
                textDocument: { uri },
                selectedRange,
                docChanged,
              })
            );
          }
        },
        onBreakpointsChanged: (breakpointRanges) => {
          const uri = this._textDocument?.uri;
          if (uri) {
            this.emit(
              ChangedEditorBreakpointsMessage.method,
              ChangedEditorBreakpointsMessage.type.notification({
                textDocument: { uri },
                breakpointRanges,
              })
            );
          }
        },
        onViewUpdate: (u) => {
          if (searchPanelOpen(u.state)) {
            if (!this._searching) {
              // Opened panel
              const findInput = u.view.dom.querySelector(
                ".cm-search input[name='search']"
              );
              if (findInput) {
                findInput.addEventListener("focus", this.handleFocusFindInput);
                findInput.addEventListener("blur", this.handleBlurFindInput);
                // findInput starts focused
                this.handleFocusFindInput();
              }
              const replaceInput = u.view.dom.querySelector(
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
            }
            this._searching = true;
          } else {
            this._searching = false;
          }
        },
      });
      this.bindView(this._view);
    }
    SparkdownScriptEditor.languageServerConnection.sendNotification(
      DidOpenTextDocumentMessage.type,
      { textDocument }
    );
    this.emit(
      DidOpenTextDocumentMessage.method,
      DidOpenTextDocumentMessage.type.notification({ textDocument })
    );
    const view = this._view;
    // Scroll to visible range
    window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        if (this._view === view) {
          this.scrollToRange(visibleRange);
          this._initialized = true;
        }
      });
    }, 100);
    if (document.hasFocus() && this._view && focused) {
      // Try to restore focus
      const timer = window.setInterval(() => {
        if (this._view === view) {
          if (!this._view || this._view.hasFocus) {
            clearInterval(timer);
            return;
          }
          this.focus();
          this._view.focus();
          if (selectedRange) {
            // Only restore selectedRange if was focused
            this.selectRange(selectedRange, false);
          }
        }
      }, 100);
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

  protected scrollToRange(range: Range | undefined) {
    const view = this._view;
    if (view) {
      if (range) {
        const doc = view.state.doc;
        const startLineNumber = range.start.line + 1;
        const endLineNumber = range.end.line + 1;
        if (startLineNumber <= 1) {
          scrollY(0, this._possibleScroller, view.scrollDOM);
        } else if (endLineNumber >= doc.lines) {
          scrollY(Infinity, this._possibleScroller, view.scrollDOM);
        } else {
          const pos = doc.line(Math.max(1, startLineNumber)).from;
          view.dispatch({
            effects: EditorView.scrollIntoView(pos, {
              y: "start",
            }),
          });
        }
      } else {
        scrollY(0, this._possibleScroller, view.scrollDOM);
      }
    }
    this.cacheVisibleRange(range);
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
    if (this._initialized && !this._loaded) {
      this._loaded = true;
      if (this._textDocument && this._loadingRequest != null) {
        if (this._view) {
          // Only fade in once formatting has finished being applied and height is stable
          this.root.style.opacity = "1";
        }
        this.emit(
          LoadEditorMessage.method,
          LoadEditorMessage.type.response(this._loadingRequest, null)
        );
        this._loadingRequest = undefined;
      }
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
  };

  protected handlePointerScroll = (e: Event) => {
    if (this._userInitiatedScroll) {
      const scrollTarget = e.target;
      const view = this._view;
      if (view) {
        const scrollTop = getScrollTop(scrollTarget);
        const scrollClientHeight = getScrollClientHeight(scrollTarget);
        const insetBottom = this._scrollMargin.bottom ?? 0;
        const scrollBottom =
          scrollTop + scrollClientHeight - this._domClientY - insetBottom;
        const visibleRange = getVisibleRange(view, scrollTop, scrollBottom);
        if (
          visibleRange.start.line !== this._visibleRange?.start?.line ||
          visibleRange.end.line !== this._visibleRange?.end?.line
        ) {
          const target =
            scrollTarget instanceof HTMLElement ? "element" : "document";
          this.cacheVisibleRange(visibleRange);
          if (this._textDocument) {
            this.emit(
              ScrolledEditorMessage.method,
              ScrolledEditorMessage.type.notification({
                textDocument: this._textDocument,
                visibleRange,
                target,
              })
            );
          }
        }
      }
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "sparkdown-script-editor": SparkdownScriptEditor;
  }
}
