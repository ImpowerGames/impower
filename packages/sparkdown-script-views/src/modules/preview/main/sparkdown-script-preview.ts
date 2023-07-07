import { EditorView } from "@codemirror/view";
import { Range } from "vscode-languageserver-protocol";
import SparkElement from "../../../../../spark-element/src/core/spark-element";
import { Properties } from "../../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../../spark-element/src/utils/getAttributeNameMap";
import { getBoxValues } from "../../../../../spark-element/src/utils/getBoxValues";
import { getClientChanges } from "../../../cm-language-client";
import createEditorView from "../utils/createEditorView";
import css from "./sparkdown-script-preview.css";
import html from "./sparkdown-script-preview.html";

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap([
    "editor-edited-event",
    "editor-scrolled-event",
    "preview-scrolled-event",
    "focused-line-event",
    "content-padding",
  ]),
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

  /**
   * The event that this component will listen for to update the screenplay.
   *
   * Defaults to `editor-edited`
   */
  get editorEditedEvent(): string {
    return (
      this.getStringAttribute(
        SparkScreenplayPreview.attributes.editorEditedEvent
      ) || "editor-edited"
    );
  }
  set editorEditedEvent(value) {
    this.setStringAttribute(
      SparkScreenplayPreview.attributes.editorEditedEvent,
      value
    );
  }

  /**
   * The event that this component will listen for that fires when the editor is scrolled.
   *
   * Defaults to `editor-edited`
   */
  get editorScrolledEvent(): string {
    return (
      this.getStringAttribute(
        SparkScreenplayPreview.attributes.editorScrolledEvent
      ) || "editor-scrolled"
    );
  }
  set editorScrolledEvent(value) {
    this.setStringAttribute(
      SparkScreenplayPreview.attributes.editorScrolledEvent,
      value
    );
  }

  /**
   * The event that this component will fire when the user scrolls the screenplay.
   *
   * Defaults to `preview-scrolled`
   */
  get previewScrolledEvent(): string {
    return (
      this.getStringAttribute(
        SparkScreenplayPreview.attributes.previewScrolledEvent
      ) || "preview-scrolled"
    );
  }
  set previewScrolledEvent(value) {
    this.setStringAttribute(
      SparkScreenplayPreview.attributes.previewScrolledEvent,
      value
    );
  }

  /**
   * The event this component fires when the user focuses a line in the screenplay.
   *
   * Defaults to `focused-line`
   */
  get focusedLineEvent(): string {
    return (
      this.getStringAttribute(
        SparkScreenplayPreview.attributes.focusedLineEvent
      ) || "focused-line"
    );
  }
  set focusedLineEvent(value) {
    this.setStringAttribute(
      SparkScreenplayPreview.attributes.focusedLineEvent,
      value
    );
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

  get scrollerEl() {
    return this.getElementByClass("cm-scroller");
  }

  protected _view?: EditorView;

  protected _resizeObserver?: ResizeObserver;

  protected _firstVisibleLine = 0;

  protected _lastVisibleLine = 0;

  protected _scrollTop = 0;

  protected _viewportHeight = 0;

  protected _pointerOverScroller = false;

  emit(event: string, detail: any) {
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
      const contentPadding = getBoxValues(this.contentPadding);
      this._view = createEditorView(editorEl, {
        contentPadding,
      });
    }
    this._resizeObserver = new ResizeObserver(this.handleViewportResize);
    window.addEventListener(this.editorEditedEvent, this.handleEdited);
    window.addEventListener(
      this.editorScrolledEvent,
      this.handleEditorScrolled
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
    this._resizeObserver?.disconnect();
    window.removeEventListener(this.editorEditedEvent, this.handleEdited);
    window.removeEventListener(
      this.editorScrolledEvent,
      this.handleEditorScrolled
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

  protected handleEdited = (e: Event): void => {
    if (e instanceof CustomEvent && e.detail) {
      const detail = e.detail;
      const transaction = detail;
      const contentChanges: { range?: Range; text: string }[] =
        detail.contentChanges;
      const view = this._view;
      if (view && transaction) {
        const doc = view.state.doc;
        const changes = getClientChanges(doc, contentChanges);
        const transaction = { changes };
        view.dispatch(transaction);
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
          this.emit(this.previewScrolledEvent, {
            firstVisibleLine,
            lastVisibleLine,
            scrollDirection,
          });
        }
      }
    }
  };

  protected handleEditorScrolled = (e: Event): void => {
    if (!this._pointerOverScroller) {
      if (e instanceof CustomEvent && e.detail) {
        const detail = e.detail;
        const firstVisibleLine = detail.firstVisibleLine;
        const lastVisibleLine = detail.lastVisibleLine;
        if (this._view) {
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
