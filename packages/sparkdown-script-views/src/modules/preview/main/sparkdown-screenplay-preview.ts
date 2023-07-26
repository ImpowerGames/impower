import { EditorView } from "@codemirror/view";
import {
  FocusedEditor,
  ScrolledEditor,
} from "../../../../../spark-editor-protocol/src/protocols/editor";
import {
  ConnectedPreview,
  HoveredOffPreview,
  HoveredOnPreview,
  LoadPreview,
  ScrolledPreview,
} from "../../../../../spark-editor-protocol/src/protocols/preview";
import { DidChangeTextDocument } from "../../../../../spark-editor-protocol/src/protocols/textDocument/messages/DidChangeTextDocument";
import {
  Range,
  TextDocumentIdentifier,
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
    const editorEl = this.editorEl;
    if (editorEl) {
      const contentPadding = getBoxValues(this.contentPadding);
      this._view = createEditorView(editorEl, {
        contentPadding,
        onIdle: this.handleIdle,
      });
    }
    window.addEventListener("message", this.handleMessage);
    this._resizeObserver = new ResizeObserver(this.handleViewportResize);
    window.postMessage(
      ConnectedPreview.type.notification({ type: "screenplay" })
    );
  }

  protected override onParsed(): void {
    const view = this._view;
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

  protected override onDisconnected(): void {
    window.removeEventListener("message", this.handleMessage);
    this._resizeObserver?.disconnect();
    const view = this._view;
    if (view) {
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
  }

  protected handleMessage = (e: MessageEvent): void => {
    const message = e.data;
    if (LoadPreview.type.isRequest(message)) {
      const params = message.params;
      const textDocument = params.textDocument;
      const visibleRange = params.visibleRange;
      this._initialized = false;
      this._loaded = false;
      this._loadingRequest = message.id;
      this._textDocument = textDocument;
      const view = this._view;
      if (view) {
        view.dispatch({
          changes: [
            {
              from: 0,
              to: view.state.doc.length,
              insert: textDocument.text,
            },
          ],
        });
        window.requestAnimationFrame(() => {
          if (visibleRange) {
            this.revealRange(visibleRange);
          }
          this._initialized = true;
        });
      }
    }
    if (DidChangeTextDocument.type.isNotification(message)) {
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
    if (FocusedEditor.type.isNotification(message)) {
      const params = message.params;
      const textDocument = params.textDocument;
      this._textDocument = textDocument;
    }
    if (ScrolledEditor.type.isNotification(message)) {
      const params = message.params;
      const textDocument = params.textDocument;
      const range = params.range;
      if (textDocument.uri === this._textDocument?.uri) {
        this.revealRange(range);
      }
    }
  };

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
        window.postMessage(
          LoadPreview.type.response(this._loadingRequest, null)
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
      window.postMessage(
        HoveredOnPreview.type.notification({
          type: "screenplay",
          textDocument: this._textDocument,
        })
      );
    }
  };

  protected handlePointerLeaveScroller = (): void => {
    this._pointerOverScroller = false;
    if (this._textDocument) {
      window.postMessage(
        HoveredOffPreview.type.notification({
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
            window.postMessage(
              ScrolledPreview.type.notification({
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
