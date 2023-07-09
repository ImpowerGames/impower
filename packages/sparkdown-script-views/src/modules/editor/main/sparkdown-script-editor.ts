import { EditorView } from "@codemirror/view";
import {
  DidChangeTextDocument,
  DidOpenTextDocument,
  DidParseTextDocument,
  FocusedEditor,
  ScrolledEditor,
  ScrolledPreview,
  TextDocumentItem,
  UnfocusedEditor,
} from "@impower/spark-editor-protocol/src";
import SparkElement from "../../../../../spark-element/src/core/spark-element";
import { Properties } from "../../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../../spark-element/src/utils/getAttributeNameMap";
import { getBoxValues } from "../../../../../spark-element/src/utils/getBoxValues";
import { getServerChanges } from "../../../cm-language-client";
import { DidParseTextDocumentParams } from "../../../cm-language-client/types/DidParseTextDocument";
import createEditorView from "../utils/createEditorView";
import { createSparkdownLanguageServerConnection } from "../utils/createSparkdownLanguageServerConnection";
import css from "./sparkdown-script-editor.css";
import html from "./sparkdown-script-editor.html";

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap(["content-padding"]),
};

export default class SparkdownScriptEditor
  extends SparkElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
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
  override get html() {
    return html;
  }

  override get css() {
    return css;
  }

  get contentPadding() {
    return this.getStringAttribute(
      SparkdownScriptEditor.attributes.contentPadding
    );
  }
  set contentPadding(value) {
    this.setStringAttribute(
      SparkdownScriptEditor.attributes.contentPadding,
      value
    );
  }

  get editorEl() {
    return this.getElementByClass("editor");
  }

  protected _connection = createSparkdownLanguageServerConnection(
    new Worker("/public/sparkdown-language-server.js")
  );

  protected _textDocument: TextDocumentItem = {
    uri: "script",
    languageId: "sparkdown",
    version: 0,
    text: "",
  };

  protected _view?: EditorView;

  protected _resizeObserver?: ResizeObserver;

  protected _editing = false;

  protected _startVisibleLineNumber = 0;

  protected _endVisibleLineNumber = 0;

  protected _scrollTop = 0;

  protected _viewportHeight = 0;

  protected _pointerOverScroller = false;

  protected override onConnected(): void {
    const editorEl = this.editorEl;
    if (editorEl) {
      this._view = createEditorView(editorEl, {
        connection: this._connection,
        textDocument: this._textDocument,
        contentPadding: getBoxValues(this.contentPadding),
        onFocus: () => {
          this._editing = true;
          window.postMessage(
            FocusedEditor.create({
              textDocument: this._textDocument,
            })
          );
        },
        onBlur: () => {
          this._editing = false;
          window.postMessage(
            UnfocusedEditor.create({
              textDocument: this._textDocument,
            })
          );
        },
        onEdit: (e) => {
          const { before, changes } = e;
          this._textDocument.version += 1;
          const params = {
            textDocument: this._textDocument,
            contentChanges: getServerChanges(before, changes),
          };
          window.postMessage(DidChangeTextDocument.create(params));
          this._connection.notifyDidChangeTextDocument(params);
        },
      });
    }
    window.addEventListener("message", this.handleMessage);
    this._connection.parseEvent.addListener(this.handleParsed);
    this._resizeObserver = new ResizeObserver(this.handleViewportResize);
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
    if (this._editing) {
      window.postMessage(
        UnfocusedEditor.create({
          textDocument: this._textDocument,
        })
      );
    }
    this._connection.parseEvent.removeListener(this.handleParsed);
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
    if (DidOpenTextDocument.is(message)) {
      const params = message.params;
      this._textDocument = params.textDocument;
    }
    if (ScrolledPreview.is(message)) {
      const params = message.params;
      const textDocument = params.textDocument;
      if (textDocument.uri === this._textDocument?.uri) {
        const view = this._view;
        if (view) {
          const doc = view.state.doc;
          const startLineNumber = params.range.start.line + 1;
          const endLineNumber = params.range.end.line + 1;
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
    }
  };

  protected handleParsed = (params: DidParseTextDocumentParams): void => {
    window.postMessage(DidParseTextDocument.create(params));
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
  };

  protected handlePointerLeaveScroller = (): void => {
    this._pointerOverScroller = false;
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
              ScrolledEditor.create({
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
