import { EditorView } from "@codemirror/view";
import { HoveredOnEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/HoveredOnEditorMessage.js";
import { ScrolledEditorMessage } from "../../../../../spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage.js";
import { ConnectedPreviewMessage } from "../../../../../spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage.js";
import { HoveredOnPreviewMessage } from "../../../../../spark-editor-protocol/src/protocols/preview/HoveredOnPreviewMessage.js";
import { LoadPreviewMessage } from "../../../../../spark-editor-protocol/src/protocols/preview/LoadPreviewMessage.js";
import { RevealPreviewRangeMessage } from "../../../../../spark-editor-protocol/src/protocols/preview/RevealPreviewRangeMessage.js";
import { ScrolledPreviewMessage } from "../../../../../spark-editor-protocol/src/protocols/preview/ScrolledPreviewMessage.js";
import { DidChangeTextDocumentMessage } from "../../../../../spark-editor-protocol/src/protocols/textDocument/DidChangeTextDocumentMessage.js";
import { DidCollapsePreviewPaneMessage } from "../../../../../spark-editor-protocol/src/protocols/window/DidCollapsePreviewPaneMessage.js";
import { DidExpandPreviewPaneMessage } from "../../../../../spark-editor-protocol/src/protocols/window/DidExpandPreviewPaneMessage.js";
import {
  Range,
  TextDocumentIdentifier,
  TextDocumentItem,
} from "../../../../../spark-editor-protocol/src/types";
import { Component } from "../../../../../spec-component/src/component";
import getBoxValues from "../../../../../spec-component/src/utils/getBoxValues";
import { getClientChanges } from "../../../cm-language-client";
import { closestAncestor } from "../../../utils/closestAncestor.js";
import { getScrollClientHeight } from "../../../utils/getScrollClientHeight.js";
import { getScrollTop } from "../../../utils/getScrollTop.js";
import { getVisibleRange } from "../../../utils/getVisibleRange.js";
import { scrollY } from "../../../utils/scrollY";
import createEditorView from "../utils/createEditorView";
import spec from "./_sparkdown-screenplay-preview";

const CONTENT_PADDING_TOP = 68;

export default class SparkScreenplayPreview extends Component(spec) {
  protected _loadingRequest?: number | string;

  protected _initialized = false;

  protected _loaded = false;

  protected _textDocument?: TextDocumentIdentifier;

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

  override onConnected() {
    window.addEventListener(LoadPreviewMessage.method, this.handleLoadPreview);
    window.addEventListener(
      RevealPreviewRangeMessage.method,
      this.handleRevealPreviewRange
    );
    window.addEventListener(
      DidChangeTextDocumentMessage.method,
      this.handleDidChangeTextDocument
    );
    window.addEventListener(
      HoveredOnEditorMessage.method,
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
      ScrolledEditorMessage.method,
      this.handleScrolledEditor
    );
    this.emit(
      ConnectedPreviewMessage.method,
      ConnectedPreviewMessage.type.notification({ type: "screenplay" })
    );
  }

  override onDisconnected() {
    window.removeEventListener(
      LoadPreviewMessage.method,
      this.handleLoadPreview
    );
    window.removeEventListener(
      RevealPreviewRangeMessage.method,
      this.handleRevealPreviewRange
    );
    window.removeEventListener(
      DidChangeTextDocumentMessage.method,
      this.handleDidChangeTextDocument
    );
    window.removeEventListener(
      HoveredOnEditorMessage.method,
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
      ScrolledEditorMessage.method,
      this.handleScrolledEditor
    );
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

  protected handleLoadPreview = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (LoadPreviewMessage.type.isRequest(message)) {
        const params = message.params;
        const textDocument = params.textDocument;
        const visibleRange = params.visibleRange;
        this._loadingRequest = message.id;
        this.loadTextDocument(textDocument, visibleRange);
      }
    }
  };

  protected handleExpandPreviewPane = () => {
    this.revealRange(this._visibleRange);
  };

  protected handleCollapsePreviewPane = () => {
    this._userInitiatedScroll = false;
  };

  protected handleRevealPreviewRange = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (RevealPreviewRangeMessage.type.isRequest(message)) {
        const params = message.params;
        const textDocument = params.textDocument;
        const range = params.range;
        if (textDocument.uri !== this._textDocument?.uri) {
          this.revealRange(range);
        }
      }
    }
  };

  protected handleDidChangeTextDocument = (e: Event) => {
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

  protected handleScrolledEditor = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (ScrolledEditorMessage.type.isNotification(message)) {
        this._userInitiatedScroll = false;
        const params = message.params;
        const textDocument = params.textDocument;
        const range = params.visibleRange;
        const target = params.target;
        if (textDocument.uri === this._textDocument?.uri) {
          if (target === "element") {
            this.revealRange(range);
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
      this._scrollMargin = getBoxValues(this.scrollMargin);
      if (this._view) {
        this._view.destroy();
      }
      this._view = createEditorView(root, {
        textDocument,
        scrollMargin: this._scrollMargin,
        onIdle: this.handleIdle,
      });
      this.bindView(this._view);
    }
    window.requestAnimationFrame(() => {
      this.revealRange(visibleRange);
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

  protected revealRange(range: Range | undefined) {
    const view = this._view;
    if (view) {
      if (range) {
        const doc = view.state.doc;
        const startLineNumber = range.start.line + 1;
        const endLineNumber = range.end.line + 1;
        if (startLineNumber <= 1) {
          scrollY(
            0,
            this._possibleScroller,
            view.scrollDOM,
            document.documentElement
          );
        } else if (endLineNumber >= doc.lines) {
          scrollY(
            Infinity,
            this._possibleScroller,
            view.scrollDOM,
            document.documentElement
          );
        } else {
          const pos = doc.line(Math.max(1, startLineNumber)).from;
          view.dispatch({
            effects: EditorView.scrollIntoView(pos, {
              y: "start",
            }),
          });
        }
      } else {
        scrollY(
          0,
          this._possibleScroller,
          view.scrollDOM,
          document.documentElement
        );
      }
    }
    this.cacheVisibleRange(range);
  }

  protected handleIdle = () => {
    if (this._initialized && !this._loaded) {
      this._loaded = true;
      if (this._textDocument && this._loadingRequest != null) {
        if (this._view) {
          // Only fade in once formatting has finished being applied and height is stable
          this._view.dom.style.opacity = "1";
        }
        this.emit(
          LoadPreviewMessage.method,
          LoadPreviewMessage.type.response(this._loadingRequest, null)
        );
        this._loadingRequest = undefined;
      }
    }
  };

  protected handlePointerEnterScroller = () => {
    this._userInitiatedScroll = true;
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

  protected handlePointerLeaveScroller = () => {
    this._userInitiatedScroll = false;
  };

  protected handlePointerScroll = (e: Event) => {
    if (this._userInitiatedScroll) {
      const scrollTarget = e.target;
      const view = this._view;
      if (view) {
        const scrollClientHeight = getScrollClientHeight(scrollTarget);
        const insetBottom = this._scrollMargin.bottom ?? 0;
        const scrollTop = getScrollTop(scrollTarget) - CONTENT_PADDING_TOP;
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
              ScrolledPreviewMessage.method,
              ScrolledPreviewMessage.type.notification({
                type: "screenplay",
                textDocument: this._textDocument,
                range: visibleRange,
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
    "sparkdown-screenplay-preview": SparkScreenplayPreview;
  }
}
