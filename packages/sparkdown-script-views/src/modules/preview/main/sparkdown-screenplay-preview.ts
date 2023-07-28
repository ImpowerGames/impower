import { EditorView } from "@codemirror/view";
import { ScrolledEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage.js";
import { ConnectedPreviewMessage } from "../../../../../spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage.js";
import { HoveredOffPreviewMessage } from "../../../../../spark-editor-protocol/src/protocols/preview/HoveredOffPreviewMessage.js";
import { HoveredOnPreviewMessage } from "../../../../../spark-editor-protocol/src/protocols/preview/HoveredOnPreviewMessage.js";
import { LoadPreviewMessage } from "../../../../../spark-editor-protocol/src/protocols/preview/LoadPreviewMessage.js";
import { ScrolledPreviewMessage } from "../../../../../spark-editor-protocol/src/protocols/preview/ScrolledPreviewMessage.js";
import { DidChangeTextDocumentMessage } from "../../../../../spark-editor-protocol/src/protocols/textDocument/DidChangeTextDocumentMessage.js";
import {
  Range,
  TextDocumentIdentifier,
  TextDocumentItem,
} from "../../../../../spark-editor-protocol/src/types";
import SparkElement from "../../../../../spark-element/src/core/spark-element";
import { Properties } from "../../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../../spark-element/src/utils/getAttributeNameMap";
import { getBoxValues } from "../../../../../spark-element/src/utils/getBoxValues";
import { getClientChanges } from "../../../cm-language-client";
import createEditorView from "../utils/createEditorView";
import component from "./_sparkdown-screenplay-preview";

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap(["content-padding"]),
};

export default class SparkScreenplayPreview
  extends SparkElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override async define(
    tag = "sparkdown-screenplay-preview",
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

  get contentPadding() {
    return this.getStringAttribute(
      SparkScreenplayPreview.attributes.contentPadding
    );
  }
  set contentPadding(value) {
    this.setStringAttribute(
      SparkScreenplayPreview.attributes.contentPadding,
      value
    );
  }

  get editorEl() {
    return this.getElementByClass("editor");
  }

  protected _textDocument?: TextDocumentIdentifier;

  protected _loadingRequest?: number | string;

  protected _initialized = false;

  protected _loaded = false;

  protected _view?: EditorView;

  protected _resizeObserver?: ResizeObserver;

  protected _startVisibleLineNumber = 0;

  protected _endVisibleLineNumber = 0;

  protected _scrollTop = 0;

  protected _viewportHeight = 0;

  protected _pointerOverScroller = false;

  protected override onConnected(): void {
    this._resizeObserver = new ResizeObserver(this.handleViewportResize);
    window.addEventListener(LoadPreviewMessage.method, this.handleLoadPreview);
    window.addEventListener(
      DidChangeTextDocumentMessage.method,
      this.handleDidChangeTextDocument
    );
    window.addEventListener(
      ScrolledEditorMessage.method,
      this.handleScrolledEditor
    );
    this.emit(
      ConnectedPreviewMessage.method,
      ConnectedPreviewMessage.type.notification({ type: "screenplay" })
    );
  }

  protected override onDisconnected(): void {
    window.removeEventListener(
      LoadPreviewMessage.method,
      this.handleLoadPreview
    );
    window.removeEventListener(
      DidChangeTextDocumentMessage.method,
      this.handleDidChangeTextDocument
    );
    window.removeEventListener(
      ScrolledEditorMessage.method,
      this.handleScrolledEditor
    );
    const view = this._view;
    if (view) {
      this.unbindView(view);
    }
  }

  protected bindView(view: EditorView) {
    if (view) {
      this._resizeObserver?.observe(view.scrollDOM);
      view.scrollDOM.addEventListener("scroll", this.handlePointerScroll);
      view.scrollDOM.addEventListener(
        "pointerenter",
        this.handlePointerEnterScroller
      );
      view.scrollDOM.addEventListener(
        "pointerleave",
        this.handlePointerLeaveScroller
      );
    }
  }

  protected unbindView(view: EditorView) {
    this._resizeObserver?.disconnect();
    view.scrollDOM.removeEventListener("scroll", this.handlePointerScroll);
    view.scrollDOM.removeEventListener(
      "pointerenter",
      this.handlePointerEnterScroller
    );
    view.scrollDOM.removeEventListener(
      "pointerleave",
      this.handlePointerLeaveScroller
    );
    view.destroy();
  }

  protected handleLoadPreview = (e: Event): void => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (LoadPreviewMessage.type.isRequest(message)) {
        const params = message.params;
        const textDocument = params.textDocument;
        const visibleRange = params.visibleRange;
        this._loadingRequest = message.id;
        if (textDocument.uri !== this._textDocument?.uri) {
          this.loadTextDocument(textDocument, visibleRange);
        }
      }
    }
  };

  protected handleDidChangeTextDocument = (e: Event): void => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidChangeTextDocumentMessage.type.isNotification(message)) {
        const params = message.params;
        const textDocument = params.textDocument;
        if (textDocument.uri === this._textDocument?.uri) {
          const contentChanges = params.contentChanges;
          const view = this._view;
          if (view) {
            const changes = getClientChanges(view.state.doc, contentChanges);
            view.dispatch({ changes });
          }
        }
      }
    }
  };

  protected handleScrolledEditor = (e: Event): void => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (ScrolledEditorMessage.type.isNotification(message)) {
        const params = message.params;
        const textDocument = params.textDocument;
        const range = params.range;
        if (textDocument.uri === this._textDocument?.uri) {
          this.revealRange(range);
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
    const editorEl = this.editorEl;
    if (editorEl) {
      const contentPadding = getBoxValues(this.contentPadding);
      if (this._view) {
        this._view.destroy();
      }
      this._view = createEditorView(editorEl, {
        textDocument,
        contentPadding,
        onIdle: this.handleIdle,
      });
      this.bindView(this._view);
    }
    window.requestAnimationFrame(() => {
      if (visibleRange) {
        this.revealRange(visibleRange);
      }
      this._initialized = true;
    });
  }

  protected revealRange(range: Range) {
    const view = this._view;
    if (view) {
      const doc = view.state.doc;
      const startLineNumber = range.start.line + 1;
      const endLineNumber = range.end.line + 1;
      if (startLineNumber <= 1) {
        view.scrollDOM.scrollTop = 0;
      } else if (endLineNumber >= doc.lines) {
        view.scrollDOM.scrollTop = view.scrollDOM.scrollHeight;
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

  protected handleIdle = (): void => {
    if (this._initialized && !this._loaded) {
      this._loaded = true;
      if (this._textDocument && this._loadingRequest != null) {
        this.emit(
          LoadPreviewMessage.method,
          LoadPreviewMessage.type.response(this._loadingRequest, null)
        );
        this._loadingRequest = undefined;
      }
    }
  };

  protected handleViewportResize = (entries: ResizeObserverEntry[]): void => {
    const entry = entries?.[0];
    const viewportHeight = entry?.borderBoxSize?.[0]?.blockSize;
    if (viewportHeight) {
      this._viewportHeight = viewportHeight;
    }
  };

  protected handlePointerEnterScroller = (): void => {
    this._pointerOverScroller = true;
    if (this._textDocument) {
      this.emit(
        HoveredOnPreviewMessage.method,
        HoveredOnPreviewMessage.type.notification({
          type: "screenplay",
          textDocument: this._textDocument,
        })
      );
    }
  };

  protected handlePointerLeaveScroller = (): void => {
    this._pointerOverScroller = false;
    if (this._textDocument) {
      this.emit(
        HoveredOffPreviewMessage.method,
        HoveredOffPreviewMessage.type.notification({
          type: "screenplay",
          textDocument: this._textDocument,
        })
      );
    }
  };

  protected handlePointerScroll = (e: Event): void => {
    if (this._pointerOverScroller) {
      const scrollEl = e.target as HTMLElement;
      const scrollTop =
        scrollEl?.scrollTop != null ? scrollEl?.scrollTop : window.scrollY;
      this._scrollTop = scrollTop;
      const scrollBottom = scrollTop + this._viewportHeight;
      const view = this._view;
      if (view) {
        const doc = view.state.doc;
        const firstVisibleLineFrom = view.lineBlockAtHeight(scrollTop).from;
        const startLine = doc.lineAt(firstVisibleLineFrom);
        const startLineNumber: number | undefined = startLine.number;
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
              ScrolledPreviewMessage.method,
              ScrolledPreviewMessage.type.notification({
                type: "screenplay",
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
    "sparkdown-screenplay-preview": SparkScreenplayPreview;
  }
}
