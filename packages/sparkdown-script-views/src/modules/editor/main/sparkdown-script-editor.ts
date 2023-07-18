import { Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  FocusedEditor,
  ScrolledEditor,
  UnfocusedEditor,
} from "../../../../../spark-editor-protocol/src/protocols/editor";
import { ScrolledPreview } from "../../../../../spark-editor-protocol/src/protocols/preview";
import {
  DidChangeTextDocument,
  DidOpenTextDocument,
  DidParseTextDocument,
  DidSaveTextDocument,
} from "../../../../../spark-editor-protocol/src/protocols/textDocument";
import {
  Range,
  TextDocumentItem,
} from "../../../../../spark-editor-protocol/src/types";
import SparkElement from "../../../../../spark-element/src/core/spark-element";
import { Properties } from "../../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../../spark-element/src/utils/getAttributeNameMap";
import { getBoxValues } from "../../../../../spark-element/src/utils/getBoxValues";
import { getServerChanges } from "../../../cm-language-client";
import { DidParseTextDocumentParams } from "../../../cm-language-client/types/DidParseTextDocument";
import debounce from "../../../utils/debounce";
import createEditorView from "../utils/createEditorView";
import { createSparkdownLanguageServerConnection } from "../utils/createSparkdownLanguageServerConnection";
import component from "./_sparkdown-script-editor";

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap(["content-padding", "autosave-delay"]),
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

  override get component() {
    return component();
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

  protected _languageServerWorker = new Worker(
    "/public/sparkdown-language-server.js"
  );

  protected _languageServerConnection = createSparkdownLanguageServerConnection(
    this._languageServerWorker
  );

  protected _textDocument?: TextDocumentItem;

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
      const debouncedSave = debounce((text: Text) => {
        if (this._textDocument) {
          window.postMessage(
            DidSaveTextDocument.type.notification({
              textDocument: this._textDocument,
              text: text.toString(),
            })
          );
        }
      }, this.autosaveDelay);
      this._view = createEditorView(editorEl, {
        connection: this._languageServerConnection,
        textDocument: this._textDocument || {
          uri: "",
          version: 0,
        },
        contentPadding: getBoxValues(this.contentPadding),
        onFocus: () => {
          this._editing = true;
          if (this._textDocument) {
            window.postMessage(
              FocusedEditor.type.notification({
                textDocument: this._textDocument,
              })
            );
          }
        },
        onBlur: () => {
          this._editing = false;
          if (this._textDocument) {
            window.postMessage(
              UnfocusedEditor.type.notification({
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
              window.postMessage(
                DidChangeTextDocument.type.notification(changeParams)
              );
              this._languageServerConnection.notifyDidChangeTextDocument(
                changeParams
              );
              debouncedSave(e.after);
            }
          }
        },
      });
    }
    window.addEventListener("message", this.handleMessage);
    this._languageServerConnection.didParseTextDocumentEvent.addListener(
      this.handleParsed
    );
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
      if (this._textDocument) {
        window.postMessage(
          UnfocusedEditor.type.notification({
            textDocument: this._textDocument,
          })
        );
      }
    }
    this._languageServerConnection.didParseTextDocumentEvent.removeListener(
      this.handleParsed
    );
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
    this._languageServerWorker.terminate();
  }

  protected handleMessage = (e: MessageEvent): void => {
    const message = e.data;
    if (DidOpenTextDocument.type.isNotification(message)) {
      const params = message.params;
      this.loadTextDocument(params.textDocument);
    }
    if (ScrolledPreview.type.isNotification(message)) {
      const params = message.params;
      const textDocument = params.textDocument;
      const range = params.range;
      if (textDocument.uri === this._textDocument?.uri) {
        this.revealRange(range);
      }
    }
  };

  protected loadTextDocument(textDocument: TextDocumentItem) {
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
    this._languageServerConnection.notifyDidOpenTextDocument({ textDocument });
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

  protected handleParsed = (params: DidParseTextDocumentParams): void => {
    window.postMessage(DidParseTextDocument.type.notification(params));
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
              ScrolledEditor.type.notification({
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
