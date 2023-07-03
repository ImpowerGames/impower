import { EditorView } from "@codemirror/view";
import { Range } from "vscode-languageserver-protocol";
import SparkElement from "../../../../../spark-element/src/core/spark-element";
import { Properties } from "../../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../../spark-element/src/utils/getAttributeNameMap";
import { getBoxValues } from "../../../../../spark-element/src/utils/getBoxValues";
import {
  getClientChanges,
  getServerChanges,
} from "../../../cm-language-client";
import { DidParseParams } from "../../../cm-language-client/types/DidParseTextDocument";
import createEditorView from "../utils/createEditorView";
import { createSparkdownLanguageServerConnection } from "../utils/createSparkdownLanguageServerConnection";
import css from "./sparkdown-script-editor.css";
import html from "./sparkdown-script-editor.html";

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap([
    "synced-event",
    "editor-focused-event",
    "editor-unfocused-event",
    "editor-scrolled-event",
    "editor-parsed-event",
    "editor-edited-event",
    "preview-scrolled-event",
    "content-padding",
  ]),
};

export default class SparkdownScriptEditor
  extends SparkElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  connection = createSparkdownLanguageServerConnection(
    new Worker("/public/sparkdown-language-server.js")
  );

  textDocument = {
    uri: "script",
    version: 0,
  };

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

  /**
   * The event that this component will listen for to sync the displayed document with outside changes.
   *
   * Defaults to `synced`
   */
  get syncedEvent(): string {
    return (
      this.getStringAttribute(SparkdownScriptEditor.attributes.syncedEvent) ||
      "synced"
    );
  }
  set syncedEvent(value) {
    this.setStringAttribute(
      SparkdownScriptEditor.attributes.syncedEvent,
      value
    );
  }

  /**
   * The event this component fires when the user focuses the editor.
   *
   * Defaults to `editor-focused`
   */
  get editorFocusedEvent(): string {
    return (
      this.getStringAttribute(
        SparkdownScriptEditor.attributes.editorFocusedEvent
      ) || "editor-focused"
    );
  }
  set editorFocusedEvent(value) {
    this.setStringAttribute(
      SparkdownScriptEditor.attributes.editorFocusedEvent,
      value
    );
  }

  /**
   * The event this component fires when the user scrolls the editor.
   *
   * Defaults to `editor-scrolled`
   */
  get editorScrolledEvent(): string {
    return (
      this.getStringAttribute(
        SparkdownScriptEditor.attributes.editorScrolledEvent
      ) || "editor-scrolled"
    );
  }
  set editorScrolledEvent(value) {
    this.setStringAttribute(
      SparkdownScriptEditor.attributes.editorScrolledEvent,
      value
    );
  }

  /**
   * The event that this component will listen for that fires when the preview is scrolled.
   *
   * Defaults to `preview-scrolled`
   */
  get previewScrolledEvent(): string {
    return (
      this.getStringAttribute(
        SparkdownScriptEditor.attributes.previewScrolledEvent
      ) || "preview-scrolled"
    );
  }
  set previewScrolledEvent(value) {
    this.setStringAttribute(
      SparkdownScriptEditor.attributes.previewScrolledEvent,
      value
    );
  }

  /**
   * The event this component fires when the editor is unfocused.
   *
   * Defaults to `editor-unfocused`
   */
  get editorUnfocusedEvent(): string {
    return (
      this.getStringAttribute(
        SparkdownScriptEditor.attributes.editorUnfocusedEvent
      ) || "editor-unfocused"
    );
  }
  set editorUnfocusedEvent(value) {
    this.setStringAttribute(
      SparkdownScriptEditor.attributes.editorUnfocusedEvent,
      value
    );
  }

  /**
   * The event this component fires whenever the user edits the script.
   *
   * Defaults to `editor-edited`
   */
  get editorEditedEvent(): string {
    return (
      this.getStringAttribute(
        SparkdownScriptEditor.attributes.editorEditedEvent
      ) || "editor-edited"
    );
  }
  set editorEditedEvent(value) {
    this.setStringAttribute(
      SparkdownScriptEditor.attributes.editorEditedEvent,
      value
    );
  }

  /**
   * The event this component fires whenever the script is parsed.
   *
   * Defaults to `editor-parsed`
   */
  get editorParsedEvent(): string {
    return (
      this.getStringAttribute(
        SparkdownScriptEditor.attributes.editorParsedEvent
      ) || "editor-parsed"
    );
  }
  set editorParsedEvent(value) {
    this.setStringAttribute(
      SparkdownScriptEditor.attributes.editorParsedEvent,
      value
    );
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

  get scrollerEl() {
    return this.getElementByClass("cm-scroller");
  }

  protected _view?: EditorView;

  protected _resizeObserver?: ResizeObserver;

  protected _editing = false;

  protected _firstVisibleLine = 0;

  protected _lastVisibleLine = 0;

  protected _scrollTop = 0;

  protected _viewportHeight = 0;

  protected _pointerOverScroller = false;

  emit(event: string, detail?: any) {
    this.dispatchEvent(
      new CustomEvent(event, {
        bubbles: true,
        cancelable: false,
        composed: true,
        detail,
      })
    );
  }

  protected override onConnected(): void {
    const editorEl = this.editorEl;
    if (editorEl) {
      this._view = createEditorView(editorEl, {
        connection: this.connection,
        textDocument: this.textDocument,
        contentPadding: getBoxValues(this.contentPadding),
        onFocus: () => {
          this._editing = true;
          this.emit(this.editorFocusedEvent);
        },
        onBlur: () => {
          this._editing = false;
          this.emit(this.editorUnfocusedEvent);
        },
        onEdit: (e) => {
          const { before, changes } = e;
          this.textDocument.version += 1;
          const params = {
            textDocument: this.textDocument,
            contentChanges: getServerChanges(before, changes),
          };
          this.emit(this.editorEditedEvent, params);
          this.connection.notifyDidChangeTextDocument(params);
        },
      });
    }
    this.root?.addEventListener(this.syncedEvent, this.handleSynced);
    this.connection.parseEvent.addListener(this.handleParsed);
    this._resizeObserver = new ResizeObserver(this.handleViewportResize);
    window.addEventListener(
      this.previewScrolledEvent,
      this.handlePreviewScrolled
    );
  }

  protected override onParsed(): void {
    if (this.scrollerEl) {
      this._resizeObserver?.observe(this.scrollerEl);
      this.scrollerEl?.addEventListener("scroll", this.handlePointerScroll);
      this.scrollerEl?.addEventListener(
        "pointerenter",
        this.handlePointerEnterScroller
      );
      this.scrollerEl?.addEventListener(
        "pointerleave",
        this.handlePointerLeaveScroller
      );
    }
  }

  protected override onDisconnected(): void {
    this.root?.removeEventListener(this.syncedEvent, this.handleSynced);
    if (this._editing) {
      document.body.dispatchEvent(
        new CustomEvent(this.editorUnfocusedEvent, {
          bubbles: true,
          cancelable: false,
          composed: true,
        })
      );
    }
    this.connection.parseEvent.removeListener(this.handleParsed);
    this._resizeObserver?.disconnect();
    window.removeEventListener(
      this.previewScrolledEvent,
      this.handlePreviewScrolled
    );
    this.scrollerEl?.removeEventListener("scroll", this.handlePointerScroll);
    this.scrollerEl?.removeEventListener(
      "pointerenter",
      this.handlePointerEnterScroller
    );
    this.scrollerEl?.removeEventListener(
      "pointerleave",
      this.handlePointerLeaveScroller
    );
  }

  protected handleSynced = (e: Event): void => {
    if (e instanceof CustomEvent && e.detail) {
      const detail = e.detail;
      const contentChanges: {
        range?: Range;
        text: string;
      }[] = detail.contentChanges;
      if (this._view && contentChanges) {
        const doc = this._view.state.doc;
        const changes = getClientChanges(doc, contentChanges);
        this._view.dispatch({ changes });
      }
    }
  };

  protected handleParsed = (params: DidParseParams): void => {
    this.emit(this.editorParsedEvent, params);
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
      const scrollDirection = scrollTop - this._scrollTop;
      this._scrollTop = scrollTop;
      const scrollBottom = scrollTop + this._viewportHeight;
      const view = this._view;
      if (view) {
        const doc = view.state.doc;
        const firstVisibleLineFrom = view.lineBlockAtHeight(scrollTop).from;
        const firstVisibleLine: number | undefined =
          doc.lineAt(firstVisibleLineFrom).number;
        const lastVisibleLineFrom = view.lineBlockAtHeight(scrollBottom).from;
        const lastVisibleLine = doc.lineAt(lastVisibleLineFrom).number;
        if (
          firstVisibleLine !== this._firstVisibleLine ||
          lastVisibleLine !== this._lastVisibleLine
        ) {
          this._firstVisibleLine = firstVisibleLine;
          this._lastVisibleLine = lastVisibleLine;
          this.emit(this.editorScrolledEvent, {
            firstVisibleLine,
            lastVisibleLine,
            scrollDirection,
          });
        }
      }
    }
  };

  protected handlePreviewScrolled = (e: Event): void => {
    if (!this._pointerOverScroller) {
      if (e instanceof CustomEvent && e.detail) {
        const detail = e.detail;
        const firstVisibleLine = detail.firstVisibleLine;
        const lastVisibleLine = detail.lastVisibleLine;
        if (this._view) {
          if (this.scrollerEl) {
            this.scrollerEl.dataset["scrollsyncing"] = "true";
          }
          const doc = this._view.state.doc;
          if (lastVisibleLine === doc.lines) {
            if (lastVisibleLine >= 1 && lastVisibleLine <= doc.lines) {
              const pos = doc.line(lastVisibleLine).to;
              this._view.dispatch({
                effects: EditorView.scrollIntoView(pos, {
                  y: "end",
                }),
              });
            }
          } else {
            if (firstVisibleLine >= 1 && firstVisibleLine <= doc.lines) {
              const pos = doc.line(firstVisibleLine).from;
              this._view.dispatch({
                effects: EditorView.scrollIntoView(pos, {
                  y: "start",
                }),
              });
            }
          }
          if (this.scrollerEl) {
            delete this.scrollerEl.dataset["scrollsyncing"];
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
