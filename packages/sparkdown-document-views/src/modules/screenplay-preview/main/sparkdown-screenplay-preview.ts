import { syntaxParserRunning } from "@codemirror/language";
import { EditorSelection, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { HoveredOnEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/HoveredOnEditorMessage";
import {
  ScrolledEditorMessage,
  ScrolledEditorMethod,
  ScrolledEditorParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import {
  SelectedEditorMessage,
  SelectedEditorMethod,
  SelectedEditorParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { ConnectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage";
import { HoveredOffPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/HoveredOffPreviewMessage";
import { HoveredOnPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/HoveredOnPreviewMessage";
import {
  LoadPreviewMessage,
  LoadPreviewMethod,
  LoadPreviewParams,
} from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import {
  RevealPreviewRangeMessage,
  RevealPreviewRangeMethod,
  RevealPreviewRangeParams,
} from "@impower/spark-editor-protocol/src/protocols/preview/RevealPreviewRangeMessage";
import { ScrolledPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ScrolledPreviewMessage";
import { SelectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SelectedPreviewMessage";
import {
  DidChangeTextDocumentMessage,
  DidChangeTextDocumentMethod,
  DidChangeTextDocumentParams,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/DidChangeTextDocumentMessage";
import {
  DidCollapsePreviewPaneMessage,
  DidCollapsePreviewPaneMethod,
  DidCollapsePreviewPaneParams,
} from "@impower/spark-editor-protocol/src/protocols/window/DidCollapsePreviewPaneMessage";
import {
  DidExpandPreviewPaneMessage,
  DidExpandPreviewPaneMethod,
  DidExpandPreviewPaneParams,
} from "@impower/spark-editor-protocol/src/protocols/window/DidExpandPreviewPaneMessage";
import {
  Range,
  TextDocumentIdentifier,
  TextDocumentItem,
} from "@impower/spark-editor-protocol/src/types";
import { RequestMessage } from "@impower/spark-editor-protocol/src/types/base/RequestMessage";
import { NotificationMessage } from "@impower/spark-engine/src";
import { Component } from "../../../../../spec-component/src/component";
import getBoxValues from "../../../../../spec-component/src/utils/getBoxValues";
import { getClientChanges } from "../../../cm-language-client";
import { offsetToPosition } from "../../../cm-language-client/utils/offsetToPosition.js";
import { positionToOffset } from "../../../cm-language-client/utils/positionToOffset.js";
import debounce from "../../../utils/debounce.js";
import { getScrollableParent } from "../../../utils/getScrollableParent.js";
import { getScrollClientHeight } from "../../../utils/getScrollClientHeight.js";
import { getScrollTop } from "../../../utils/getScrollTop.js";
import { getVisibleRange } from "../../../utils/getVisibleRange.js";
import { scrollY } from "../../../utils/scrollY";
import createEditorView from "../utils/createEditorView";
import spec from "./_sparkdown-screenplay-preview";

const CONTENT_PADDING_TOP = 68;

export default class SparkScreenplayPreview extends Component(spec) {
  protected _loadingRequest?: number | string;

  protected _initialFocused?: boolean;

  protected _initialVisibleRange?: Range;

  protected _initialSelectedRange?: Range;

  protected _loaded = false;

  protected _textDocument?: TextDocumentIdentifier;

  protected _view?: EditorView;

  protected _scroller?: Window | Element | null;

  protected _visibleRange?: Range;

  protected _domClientY = 0;

  protected _userInitiatedScroll = false;

  protected _scrollIntervalTimeout = 0;

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

  protected _scrollTarget?: Range;

  override onConnected() {
    this.root.addEventListener("touchstart", this.handlePointerEnterScroller, {
      passive: true,
    });
    this.root.addEventListener("mouseenter", this.handlePointerEnterScroller, {
      passive: true,
    });
    this.root.addEventListener("mouseleave", this.handlePointerLeaveScroller, {
      passive: true,
    });
    window.addEventListener(MessageProtocol.event, this.handleProtocol);
    this.emit(
      MessageProtocol.event,
      ConnectedPreviewMessage.type.notification({ type: "screenplay" })
    );
  }

  override onDisconnected() {
    this.root.removeEventListener(
      "touchstart",
      this.handlePointerEnterScroller
    );
    this.root.removeEventListener(
      "mouseenter",
      this.handlePointerEnterScroller
    );
    this.root.removeEventListener(
      "mouseleave",
      this.handlePointerLeaveScroller
    );
    window.removeEventListener(MessageProtocol.event, this.handleProtocol);
    const view = this._view;
    if (view) {
      this.unbindView(view);
    }
  }

  protected handleProtocol = async (e: Event) => {
    if (e instanceof CustomEvent) {
      if (LoadPreviewMessage.type.is(e.detail)) {
        const response = await this.handleLoadPreview(e.detail);
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (RevealPreviewRangeMessage.type.is(e.detail)) {
        const response = await this.handleRevealPreviewRange(e.detail);
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (DidChangeTextDocumentMessage.type.is(e.detail)) {
        this.handleDidChangeTextDocument(e.detail);
      }
      if (HoveredOnEditorMessage.type.is(e.detail)) {
        this.handlePointerLeaveScroller();
      }
      if (DidExpandPreviewPaneMessage.type.is(e.detail)) {
        this.handleDidExpandPreviewPane(e.detail);
      }
      if (DidCollapsePreviewPaneMessage.type.is(e.detail)) {
        this.handleDidCollapsePreviewPane(e.detail);
      }
      if (ScrolledEditorMessage.type.is(e.detail)) {
        this.handleScrolledEditor(e.detail);
      }
      if (SelectedEditorMessage.type.is(e.detail)) {
        this.handleSelectedEditor(e.detail);
      }
    }
  };

  protected bindView(view: EditorView) {
    this._domClientY = view.dom.offsetTop;
    this._scroller = getScrollableParent(view.scrollDOM);
    this._scroller?.addEventListener("scroll", this.handlePointerScroll);
  }

  protected unbindView(view: EditorView) {
    this._scroller?.removeEventListener("scroll", this.handlePointerScroll);
    view.destroy();
  }

  protected handleLoadPreview = (
    message: RequestMessage<LoadPreviewMethod, LoadPreviewParams>
  ) => {
    const params = message.params;
    const textDocument = params.textDocument;
    const focused = params.focused;
    const visibleRange = params.visibleRange;
    const selectedRange = params.selectedRange;
    this._loadingRequest = message.id;
    this.loadTextDocument(textDocument, focused, visibleRange, selectedRange);
    return LoadPreviewMessage.type.response(message.id, {});
  };

  protected handleDidExpandPreviewPane = (
    _message: NotificationMessage<
      DidExpandPreviewPaneMethod,
      DidExpandPreviewPaneParams
    >
  ) => {
    this.scrollToRange(this._visibleRange);
  };

  protected handleDidCollapsePreviewPane = (
    _message: NotificationMessage<
      DidCollapsePreviewPaneMethod,
      DidCollapsePreviewPaneParams
    >
  ) => {
    this._userInitiatedScroll = false;
  };

  protected handleRevealPreviewRange = (
    message: RequestMessage<RevealPreviewRangeMethod, RevealPreviewRangeParams>
  ) => {
    const params = message.params;
    const textDocument = params.textDocument;
    const range = params.range;
    if (textDocument.uri !== this._textDocument?.uri) {
      this.scrollToRange(range);
    }
    return RevealPreviewRangeMessage.type.response(message.id, {});
  };

  protected handleDidChangeTextDocument = (
    message: NotificationMessage<
      DidChangeTextDocumentMethod,
      DidChangeTextDocumentParams
    >
  ) => {
    const params = message.params;
    const textDocument = params.textDocument;
    if (textDocument.uri === this._textDocument?.uri) {
      const contentChanges = params.contentChanges;
      const view = this._view;
      if (view) {
        this._scrollTarget = undefined;
        const changes = getClientChanges(view.state, contentChanges);
        for (const change of changes) {
          // Instead of simply passing in the changes array, each change must be applied individually.
          // This is because getClientChanges returns positions relative to the previous change, not the start document,
          // (And for some reason, setting TransactionSpec.sequential to true, will not correctly apply the changes).
          view.dispatch({ changes: [change] });
        }
      }
    }
  };
  protected handleScrolledEditor = (
    message: NotificationMessage<ScrolledEditorMethod, ScrolledEditorParams>
  ) => {
    if (this._loaded) {
      this._userInitiatedScroll = false;
      const params = message.params;
      const textDocument = params.textDocument;
      const range = params.visibleRange;
      const target = params.target;
      if (textDocument.uri === this._textDocument?.uri) {
        if (target === "element") {
          this.scrollToRange(range);
        } else {
          this.cacheVisibleRange(range);
        }
      }
    }
  };

  protected handleSelectedEditor = (
    message: NotificationMessage<SelectedEditorMethod, SelectedEditorParams>
  ) => {
    const params = message.params;
    const textDocument = params.textDocument;
    const selectedRange = params.selectedRange;
    const docChanged = params.docChanged;
    const userEvent = params.userEvent;
    if (textDocument.uri === this._textDocument?.uri) {
      if (!docChanged && userEvent) {
        this.selectRange(selectedRange, false);
      }
    }
  };

  protected loadTextDocument(
    textDocument: TextDocumentItem,
    focused: boolean | undefined,
    visibleRange: Range | undefined,
    selectedRange: Range | undefined
  ) {
    if (this._view) {
      this.unbindView(this._view);
      this._view.destroy();
    }
    this._scrollTarget = undefined;
    this._initialFocused = focused;
    this._initialVisibleRange = visibleRange;
    this._initialSelectedRange = selectedRange;
    this._loaded = false;
    this._textDocument = textDocument;
    const root = this.root;
    if (root) {
      this._scrollMargin = getBoxValues(this.scrollMargin);
      this._view = createEditorView(root, {
        textDocument,
        scrollMargin: this._scrollMargin,
        scrollToLineNumber: (visibleRange?.start.line ?? 0) + 1,
        onUpdate: (u) => {
          if (!syntaxParserRunning(u.view)) {
            this.onIdle();
          }
          if (u.heightChanged) {
            if (u.viewportChanged && !u.docChanged) {
              if (this._scrollTarget) {
                this.scrollToRange(this._scrollTarget);
              }
            }
            const visibleRange = this.measureVisibleRange();
            if (visibleRange) {
              this.cacheVisibleRange(visibleRange);
            }
          }
          if (u.selectionSet) {
            const cursorRange = u.state.selection.main;
            const anchor = cursorRange?.anchor;
            const head = cursorRange?.head;
            const uri = this._textDocument?.uri;
            if (uri) {
              this.emit(
                MessageProtocol.event,
                SelectedPreviewMessage.type.notification({
                  type: "screenplay",
                  textDocument: { uri },
                  selectedRange: {
                    start: offsetToPosition(u.state.doc, anchor),
                    end: offsetToPosition(u.state.doc, head),
                  },
                  docChanged: u.docChanged,
                  userEvent: u.transactions.some((tr) =>
                    tr.annotation(Transaction.userEvent)
                  ),
                })
              );
            }
          }
        },
      });
    }
  }

  protected cacheVisibleRange(range: Range) {
    this._visibleRange = range;
  }

  protected scrollToRange(range: Range | undefined) {
    const view = this._view;
    if (view) {
      if (range) {
        const doc = view.state.doc;
        const startLineNumber = range.start.line + 1;
        if (startLineNumber <= 1) {
          this._scrollTarget = undefined;
          scrollY(0, this._scroller);
        } else {
          this._scrollTarget = range;
          const line = doc.line(
            Math.min(Math.max(1, startLineNumber), doc.lines)
          );
          view.dispatch({
            effects: EditorView.scrollIntoView(
              EditorSelection.range(line.from, line.to),
              { y: "start" }
            ),
          });
        }
      }
    }
  }

  protected selectRange(range: Range, scrollIntoView: boolean) {
    const view = this._view;
    if (view) {
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

  protected onIdle = debounce(() => {
    if (!this._loaded) {
      const initialVisibleRange = this._initialVisibleRange;
      const initialSelectedRange = this._initialSelectedRange;
      if (initialVisibleRange) {
        // Restore visible range
        this.scrollToRange(initialVisibleRange);
      }
      if (initialSelectedRange) {
        //Restore selected range
        this.selectRange(initialSelectedRange, false);
      }
      if (this._textDocument && this._loadingRequest != null) {
        // Only fade in once formatting has finished being applied and height is stable
        this.root.style.opacity = "1";
        this._loadingRequest = undefined;
      }
      if (this._view) {
        this.bindView(this._view);
      }
      this._loaded = true;
    }
  }, 50);

  protected handlePointerEnterScroller = () => {
    this._userInitiatedScroll = true;
    if (this._textDocument) {
      this.emit(
        MessageProtocol.event,
        HoveredOnPreviewMessage.type.notification({
          type: "screenplay",
          textDocument: this._textDocument,
        })
      );
    }
  };

  protected handlePointerLeaveScroller = () => {
    this._userInitiatedScroll = false;
    if (this._textDocument) {
      this.emit(
        MessageProtocol.event,
        HoveredOffPreviewMessage.type.notification({
          type: "screenplay",
          textDocument: this._textDocument,
        })
      );
    }
  };

  protected handlePointerScroll = (e: Event) => {
    const visibleRange = this.measureVisibleRange();
    if (visibleRange) {
      if (
        visibleRange.start.line !== this._visibleRange?.start?.line ||
        visibleRange.end.line !== this._visibleRange?.end?.line
      ) {
        if (this._textDocument) {
          if (this._userInitiatedScroll) {
            this.cacheVisibleRange(visibleRange);
            this._scrollTarget = undefined;
            this.emit(
              MessageProtocol.event,
              ScrolledPreviewMessage.type.notification({
                type: "screenplay",
                textDocument: this._textDocument,
                visibleRange: visibleRange,
                target: e.target instanceof HTMLElement ? "element" : "window",
              })
            );
          }
        }
      }
    }
  };

  protected measureVisibleRange() {
    const scrollTarget = this._scroller;
    const view = this._view;
    if (view && scrollTarget) {
      const scrollClientHeight = getScrollClientHeight(scrollTarget);
      const insetBottom = this._scrollMargin.bottom ?? 0;
      const scrollTop = getScrollTop(scrollTarget) - CONTENT_PADDING_TOP;
      const scrollBottom =
        scrollTop + scrollClientHeight - this._domClientY - insetBottom;
      const visibleRange = getVisibleRange(view, scrollTop, scrollBottom);
      return visibleRange;
    }
    return undefined;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "sparkdown-screenplay-preview": SparkScreenplayPreview;
  }
}
