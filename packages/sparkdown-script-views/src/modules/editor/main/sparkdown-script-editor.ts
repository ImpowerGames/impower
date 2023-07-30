import { Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { FocusedEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/FocusedEditorMessage";
import { HoveredOnEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/HoveredOnEditorMessage";
import { LoadEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/LoadEditorMessage";
import { ScrolledEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import { UnfocusedEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/UnfocusedEditorMessage";
import { HoveredOnPreviewMessage } from "../../../../../spark-editor-protocol/src/protocols/preview/HoveredOnPreviewMessage";
import { ScrolledPreviewMessage } from "../../../../../spark-editor-protocol/src/protocols/preview/ScrolledPreviewMessage";
import { DidChangeTextDocumentMessage } from "../../../../../spark-editor-protocol/src/protocols/textDocument/DidChangeTextDocumentMessage";
import { DidOpenTextDocumentMessage } from "../../../../../spark-editor-protocol/src/protocols/textDocument/DidOpenTextDocumentMessage";
import { DidSaveTextDocumentMessage } from "../../../../../spark-editor-protocol/src/protocols/textDocument/DidSaveTextDocumentMessage";
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
import { closestAncestor } from "../../../utils/closestAncestor";
import debounce from "../../../utils/debounce";
import { isScrollable } from "../../../utils/isScrollable";
import createEditorView from "../utils/createEditorView";
import component from "./_sparkdown-script-editor";

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap(["scroll-margin", "autosave-delay"]),
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
    return { ...super.attributes, ...DEFAULT_ATTRIBUTES };
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

  get autosaveDelay() {
    return (
      this.getNumberAttribute(SparkdownScriptEditor.attributes.autosaveDelay) ??
      500
    );
  }
  set autosaveDelay(value) {
    this.setNumberAttribute(
      SparkdownScriptEditor.attributes.autosaveDelay,
      value
    );
  }

  get editorEl() {
    return this.getElementByClass("editor");
  }

  protected _textDocument?: TextDocumentItem;

  protected _view?: EditorView;

  protected _editing = false;

  protected _startVisibleLineNumber = 0;

  protected _endVisibleLineNumber = 0;

  protected _domClientY = 0;

  protected _scrollTop = 0;

  protected _pointerOverScroller = false;

  protected _possibleScroller?: HTMLElement | null;

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
      HoveredOnPreviewMessage.method,
      this.handlePointerLeaveScroller
    );
    window.addEventListener(
      ScrolledPreviewMessage.method,
      this.handleScrolledPreview
    );
  }

  protected override onDisconnected(): void {
    window.removeEventListener(LoadEditorMessage.method, this.handleLoadEditor);
    window.removeEventListener(
      HoveredOnPreviewMessage.method,
      this.handlePointerLeaveScroller
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
    if (view) {
      this._domClientY = view.dom.offsetTop;
      this._possibleScroller = closestAncestor(`.scrollable`, view.scrollDOM);
      this._possibleScroller?.addEventListener(
        "scroll",
        this.handlePointerScroll
      );
      window.addEventListener("scroll", this.handlePointerScroll);
      view.scrollDOM.addEventListener("scroll", this.handlePointerScroll);
      view.dom.addEventListener("mouseenter", this.handlePointerEnterScroller);
      view.dom.addEventListener("touchstart", this.handlePointerEnterScroller);
    }
  }

  protected unbindView(view: EditorView) {
    this._possibleScroller?.removeEventListener(
      "scroll",
      this.handlePointerScroll
    );
    window.removeEventListener("scroll", this.handlePointerScroll);
    view.scrollDOM.removeEventListener("scroll", this.handlePointerScroll);
    view.dom.removeEventListener("mouseenter", this.handlePointerEnterScroller);
    view.dom.removeEventListener("touchstart", this.handlePointerEnterScroller);
    view.destroy();
  }

  protected handleLoadEditor = (e: Event): void => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (LoadEditorMessage.type.isRequest(message)) {
        const params = message.params;
        const textDocument = params.textDocument;
        if (textDocument.uri !== this._textDocument?.uri) {
          this.loadTextDocument(textDocument);
        }
      }
    }
  };

  protected handleScrolledPreview = (e: Event): void => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (ScrolledPreviewMessage.type.isNotification(message)) {
        const params = message.params;
        const textDocument = params.textDocument;
        const range = params.range;
        if (textDocument.uri === this._textDocument?.uri) {
          this.revealRange(range);
        }
      }
    }
  };

  protected loadTextDocument(textDocument: TextDocumentItem) {
    if (this._view) {
      this._view.destroy();
    }
    this._textDocument = textDocument;
    const editorEl = this.editorEl;
    if (editorEl) {
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
      }, this.autosaveDelay);
      this._scrollMargin = getBoxValues(this.scrollMargin);
      this._view = createEditorView(editorEl, {
        serverConnection: SparkdownScriptEditor.languageServerConnection,
        serverCapabilities: SparkdownScriptEditor.languageServerCapabilities,
        fileSystemReader: SparkdownScriptEditor.fileSystemReader,
        textDocument: this._textDocument,
        scrollMargin: this._scrollMargin,
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
      });
      this.bindView(this._view);
    }
    SparkdownScriptEditor.languageServerConnection.sendNotification(
      DidOpenTextDocumentMessage.type,
      { textDocument }
    );
  }

  getScrollTop(target: EventTarget | null) {
    if (target instanceof HTMLElement) {
      return target.scrollTop;
    }
    return window.scrollY;
  }

  getScrollClientHeight(target: EventTarget | null) {
    if (target instanceof HTMLElement) {
      return target.clientHeight;
    }
    return document.documentElement.clientHeight;
  }

  getScrollBottom(target: EventTarget) {
    if (target instanceof HTMLElement) {
      return target.scrollTop;
    }
    return window.scrollY;
  }

  scrollY(view: EditorView, y: number) {
    const possibleScroller = this._possibleScroller;
    const scroller = isScrollable(view.scrollDOM)
      ? view.scrollDOM
      : possibleScroller && isScrollable(possibleScroller)
      ? possibleScroller
      : document;
    const scrollHeight =
      scroller instanceof Document
        ? document.documentElement.scrollHeight
        : scroller.scrollHeight;
    const validY = y === Infinity ? scrollHeight : y;
    if (scroller instanceof Document) {
      window.scrollTo(0, validY);
    } else {
      scroller.scrollTop = validY;
    }
  }

  protected revealRange(range: Range) {
    const view = this._view;
    if (view) {
      const doc = view.state.doc;
      const startLineNumber = range.start.line + 1;
      const endLineNumber = range.end.line + 1;
      if (startLineNumber <= 1) {
        this.scrollY(view, 0);
      } else if (endLineNumber >= doc.lines) {
        this.scrollY(view, Infinity);
      } else {
        const pos = doc.line(Math.max(1, startLineNumber)).from;
        view.dispatch({
          effects: EditorView.scrollIntoView(pos, {
            y: "start",
          }),
        });
      }
    }
  }

  protected handlePointerEnterScroller = (): void => {
    this._pointerOverScroller = true;
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
    this._pointerOverScroller = false;
  };

  protected handlePointerScroll = (e: Event): void => {
    if (this._pointerOverScroller) {
      const scrollTarget = e.target;
      const view = this._view;
      if (view) {
        const scrollTop = this.getScrollTop(scrollTarget);
        const scrollClientHeight = this.getScrollClientHeight(scrollTarget);
        this._scrollTop = scrollTop;
        const scrollMarginBottom = this._scrollMargin.bottom ?? 0;
        const scrollBottom =
          scrollTop +
          scrollClientHeight -
          this._domClientY -
          scrollMarginBottom;
        const doc = view.state.doc;
        const firstVisibleLineFrom = view.lineBlockAtHeight(scrollTop).from;
        const startLine = doc.lineAt(firstVisibleLineFrom);
        const startLineNumber = scrollTop <= 0 ? 1 : startLine.number;
        const lastVisibleLineFrom = view.lineBlockAtHeight(scrollBottom).from;
        const endLine = doc.lineAt(lastVisibleLineFrom);
        const endLineNumber = endLine.number;
        const endLineLength = endLine.to - endLine.from;
        if (
          startLineNumber !== this._startVisibleLineNumber ||
          endLineNumber !== this._endVisibleLineNumber
        ) {
          this._startVisibleLineNumber = startLineNumber;
          this._endVisibleLineNumber = endLineNumber;
          if (this._textDocument) {
            this.emit(
              ScrolledEditorMessage.method,
              ScrolledEditorMessage.type.notification({
                textDocument: this._textDocument,
                range: {
                  start: {
                    line: startLineNumber - 1,
                    character: 0,
                  },
                  end: {
                    line: endLineNumber - 1,
                    character: Math.max(0, endLineLength - 1),
                  },
                },
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
