import { EditorSelection, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { FocusedEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/FocusedEditorMessage";
import { HoveredOnEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/HoveredOnEditorMessage";
import { LoadEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/LoadEditorMessage";
import { RevealEditorRangeMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/RevealEditorRangeMessage";
import { ScrolledEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import { SelectedEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import { UnfocusedEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/UnfocusedEditorMessage";
import { HoveredOnPreviewMessage } from "../../../../../spark-editor-protocol/src/protocols/preview/HoveredOnPreviewMessage";
import { ScrolledPreviewMessage } from "../../../../../spark-editor-protocol/src/protocols/preview/ScrolledPreviewMessage";
import { DidChangeTextDocumentMessage } from "../../../../../spark-editor-protocol/src/protocols/textDocument/DidChangeTextDocumentMessage";
import { DidOpenTextDocumentMessage } from "../../../../../spark-editor-protocol/src/protocols/textDocument/DidOpenTextDocumentMessage";
import { DidSaveTextDocumentMessage } from "../../../../../spark-editor-protocol/src/protocols/textDocument/DidSaveTextDocumentMessage";
import { DidCollapsePreviewPaneMessage } from "../../../../../spark-editor-protocol/src/protocols/window/DidCollapsePreviewPaneMessage";
import { DidExpandPreviewPaneMessage } from "../../../../../spark-editor-protocol/src/protocols/window/DidExpandPreviewPaneMessage";
import {
  MessageConnection,
  Range,
  ServerCapabilities,
  TextDocumentItem,
} from "../../../../../spark-editor-protocol/src/types";
import SparkElement from "../../../../../spark-element/src/core/spark-element";
import { Properties } from "../../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../../spark-element/src/utils/getAttributeNameMap";
import { getBoxValues } from "../../../../../spark-element/src/utils/getBoxValues";
import { getServerChanges } from "../../../cm-language-client";
import { FileSystemReader } from "../../../cm-language-client/types/FileSystemReader";
import { positionToOffset } from "../../../cm-language-client/utils/positionToOffset";
import { closestAncestor } from "../../../utils/closestAncestor";
import debounce from "../../../utils/debounce";
import { getScrollClientHeight } from "../../../utils/getScrollClientHeight";
import { getScrollTop } from "../../../utils/getScrollTop";
import { getVisibleRange } from "../../../utils/getVisibleRange";
import { scrollY } from "../../../utils/scrollY";
import createEditorView from "../utils/createEditorView";
import component from "./_sparkdown-script-editor";

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap(["scroll-margin", "autosave-debounce-delay"]),
};

export default class SparkdownScriptEditor
  extends SparkElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static languageServerConnection: MessageConnection;

  static languageServerCapabilities: ServerCapabilities;

  static fileSystemReader: FileSystemReader;

  static override async define(
    tag = "sparkdown-script-editor",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  static override get attributes() {
    return DEFAULT_ATTRIBUTES;
  }

  override get component() {
    return component();
  }

  get scrollMargin() {
    return this.getStringAttribute(
      SparkdownScriptEditor.attributes.scrollMargin
    );
  }
  set scrollMargin(value) {
    this.setStringAttribute(
      SparkdownScriptEditor.attributes.scrollMargin,
      value
    );
  }

  get autosaveDebounceDelay() {
    return (
      this.getNumberAttribute(
        SparkdownScriptEditor.attributes.autosaveDebounceDelay
      ) ?? 100
    );
  }
  set autosaveDebounceDelay(value) {
    this.setNumberAttribute(
      SparkdownScriptEditor.attributes.autosaveDebounceDelay,
      value
    );
  }

  protected _loadingRequest?: string | number;

  protected _initialized = false;

  protected _loaded = false;

  protected _editing = false;

  protected _textDocument?: TextDocumentItem;

  protected _view?: EditorView;

  protected _possibleScroller?: HTMLElement | null;

  protected _visibleRange?: Range;

  protected _domClientY = 0;

  protected _userInitiatedScroll = false;

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

  protected override onConnected(): void {
    window.addEventListener(LoadEditorMessage.method, this.handleLoadEditor);
    window.addEventListener(
      RevealEditorRangeMessage.method,
      this.handleRevealEditorRange
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
  }

  protected override onDisconnected(): void {
    window.removeEventListener(LoadEditorMessage.method, this.handleLoadEditor);
    window.removeEventListener(
      RevealEditorRangeMessage.method,
      this.handleRevealEditorRange
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
    if (this._editing) {
      if (this._textDocument) {
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
  }

  protected handleLoadEditor = (e: Event): void => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (LoadEditorMessage.type.isRequest(message)) {
        const params = message.params;
        const textDocument = params.textDocument;
        const visibleRange = params.visibleRange;
        const languageServerCapabilities = params.languageServerCapabilities;
        this._loadingRequest = message.id;
        SparkdownScriptEditor.languageServerCapabilities =
          languageServerCapabilities;
        if (textDocument.uri !== this._textDocument?.uri) {
          this.loadTextDocument(textDocument, visibleRange);
        }
      }
    }
  };

  protected handleExpandPreviewPane = (): void => {
    this._userInitiatedScroll = false;
  };

  protected handleCollapsePreviewPane = (): void => {
    this.scrollToRange(this._visibleRange);
  };

  protected handleRevealEditorRange = (e: Event): void => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (RevealEditorRangeMessage.type.isRequest(message)) {
        const params = message.params;
        const textDocument = params.textDocument;
        const visibleRange = params.visibleRange;
        const selectedRange = params.selectedRange;
        if (textDocument.uri === this._textDocument?.uri) {
          if (visibleRange) {
            this.scrollToRange(visibleRange);
          }
          if (selectedRange) {
            this.selectRange(selectedRange, !visibleRange);
          }
        }
      }
    }
  };

  protected handleScrolledPreview = (e: Event): void => {
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

  protected loadTextDocument(
    textDocument: TextDocumentItem,
    visibleRange: Range | undefined
  ) {
    if (this._view) {
      this._view.destroy();
    }
    this._initialized = false;
    this._loaded = false;
    this._textDocument = textDocument;
    const root = this.root;
    if (root) {
      const debouncedSave = debounce((text: Text) => {
        if (this._textDocument) {
          this.emit(
            DidSaveTextDocumentMessage.method,
            DidSaveTextDocumentMessage.type.notification({
              textDocument: this._textDocument,
              text: text.toString(),
            })
          );
        }
      }, this.autosaveDebounceDelay);
      this._scrollMargin = getBoxValues(this.scrollMargin);
      this._view = createEditorView(root, {
        serverConnection: SparkdownScriptEditor.languageServerConnection,
        serverCapabilities: SparkdownScriptEditor.languageServerCapabilities,
        fileSystemReader: SparkdownScriptEditor.fileSystemReader,
        textDocument: this._textDocument,
        scrollMargin: this._scrollMargin,
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
            this.emit(
              UnfocusedEditorMessage.method,
              UnfocusedEditorMessage.type.notification({
                textDocument: this._textDocument,
              })
            );
          }
        },
        onEdit: (e) => {
          const { before, transaction } = e;
          if (transaction.docChanged) {
            if (this._textDocument) {
              this._textDocument.version += 1;
              const changeParams = {
                textDocument: this._textDocument,
                contentChanges: getServerChanges(before, transaction.changes),
              };
              this.emit(
                DidChangeTextDocumentMessage.method,
                DidChangeTextDocumentMessage.type.notification(changeParams)
              );
              SparkdownScriptEditor.languageServerConnection.sendNotification(
                DidChangeTextDocumentMessage.type,
                changeParams
              );
              debouncedSave(e.after);
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
      });
      this.bindView(this._view);
    }
    SparkdownScriptEditor.languageServerConnection.sendNotification(
      DidOpenTextDocumentMessage.type,
      { textDocument }
    );
    window.requestAnimationFrame(() => {
      this.scrollToRange(visibleRange);
      this._initialized = true;
    });
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

  protected selectRange(range: Range | undefined, scrollIntoView: boolean) {
    const view = this._view;
    if (view) {
      if (range) {
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
  }

  protected handleIdle = (): void => {
    if (this._initialized && !this._loaded) {
      this._loaded = true;
      if (this._textDocument && this._loadingRequest != null) {
        if (this._view) {
          // Only fade in once formatting has finished being applied and height is stable
          this._view.dom.style.opacity = "1";
        }
        this.emit(
          LoadEditorMessage.method,
          LoadEditorMessage.type.response(this._loadingRequest, null)
        );
        this._loadingRequest = undefined;
      }
    }
  };

  protected handlePointerEnterScroller = (): void => {
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

  protected handlePointerLeaveScroller = (): void => {
    this._userInitiatedScroll = false;
  };

  protected handlePointerScroll = (e: Event): void => {
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
