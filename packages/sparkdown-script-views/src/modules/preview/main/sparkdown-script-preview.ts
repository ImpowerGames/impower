import { EditorView } from "@codemirror/view";
import {
  ConnectedScreenplayPreview,
  DidChangeTextDocument,
  DidOpenTextDocument,
  FocusedEditor,
  HoveredOffPreview,
  HoveredOnPreview,
  InitializeScreenplay,
  LoadedScreenplayPreview,
  Range,
  ScrolledEditor,
  ScrolledPreview,
  TextDocumentIdentifier,
} from "@impower/spark-editor-protocol/src";
import SparkElement from "../../../../../spark-element/src/core/spark-element";
import { Properties } from "../../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../../spark-element/src/utils/getAttributeNameMap";
import { getBoxValues } from "../../../../../spark-element/src/utils/getBoxValues";
import { getClientChanges } from "../../../cm-language-client";
import createEditorView from "../utils/createEditorView";
import css from "./sparkdown-script-preview.css";
import html from "./sparkdown-script-preview.html";

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap(["content-padding"]),
};

export default class SparkScreenplayPreview
  extends SparkElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override async define(
    tag = "sparkdown-script-preview",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  static override get attributes() {
    return DEFAULT_ATTRIBUTES;
  }

  override get html() {
    return html;
  }

  override get css() {
    return css;
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
      });
    }
    window.addEventListener("message", this.handleMessage);
    this._resizeObserver = new ResizeObserver(this.handleViewportResize);
    window.postMessage(ConnectedScreenplayPreview.message({}));
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
    }
  }

  protected handleMessage = (e: MessageEvent): void => {
    const message = e.data;
    if (InitializeScreenplay.is(message)) {
      const params = message.params;
      const textDocument = params.textDocument;
      const visibleRange = params.visibleRange;
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
          this.revealRange(visibleRange);
          window.requestAnimationFrame(() => {
            window.postMessage(
              LoadedScreenplayPreview.message({
                textDocument,
              })
            );
          });
        });
      }
    }
    if (DidOpenTextDocument.is(message)) {
      const params = message.params;
      const textDocument = params.textDocument;
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
      }
    }
    if (DidChangeTextDocument.is(message)) {
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
    if (FocusedEditor.is(message)) {
      const params = message.params;
      const textDocument = params.textDocument;
      this._textDocument = textDocument;
    }
    if (ScrolledEditor.is(message)) {
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
        HoveredOnPreview.message({
          textDocument: this._textDocument,
        })
      );
    }
  };

  protected handlePointerLeaveScroller = (): void => {
    this._pointerOverScroller = false;
    if (this._textDocument) {
      window.postMessage(
        HoveredOffPreview.message({
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
              ScrolledPreview.message({
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
    "sparkdown-script-preview": SparkScreenplayPreview;
  }
}
