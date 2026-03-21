import { historyField } from "@codemirror/commands";
import { syntaxParserRunning } from "@codemirror/language";
import { search } from "@codemirror/search";
import {
  Compartment,
  EditorSelection,
  EditorState,
  Range,
  RangeSet,
  SelectionRange,
  Text,
  Transaction,
  TransactionSpec,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  GutterMarker,
  ViewUpdate,
  panels,
} from "@codemirror/view";
import {
  LSPClient,
  Workspace,
} from "@impower/codemirror-vscode-lsp-client/src";
import {
  isIOS,
  isMobile,
} from "@impower/codemirror-vscode-lsp-client/src/context";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import {
  InitializeParams,
  InitializeResult,
  MessageConnection,
} from "@impower/spark-editor-protocol/src/types";
import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import {
  breakpointMarker,
  breakpointsChanged,
  breakpointsField,
  getBreakpointLineNumbers,
} from "../../../cm-breakpoints/breakpoints";
import { foldedField } from "../../../cm-folded/foldedField";
import {
  getHighlightLineNumbers,
  highlightDeco,
  highlightsChanged,
  highlightsField,
} from "../../../cm-highlight-lines/highlightLines";
import {
  getPinpointLineNumbers,
  pinpointDeco,
  pinpointsChanged,
  pinpointsField,
} from "../../../cm-pinpoints/pinpoints";
import { variableWidgets } from "../../../cm-variable-widgets/variableWidgets";
import debounce from "../../../utils/debounce";
import EDITOR_EXTENSIONS from "../constants/EDITOR_EXTENSIONS";
import EDITOR_THEME from "../constants/EDITOR_THEME";
import { gotoLinePanel } from "../panels/GotoLinePanel";
import { SearchPanel } from "../panels/SearchPanel";
import { statusPanel } from "../panels/StatusPanel";
import {
  SerializableEditorSelection,
  SerializableEditorState,
  SerializableFoldedState,
  SerializableHistoryState,
} from "../types/editor";
import { sparkdownLanguageExtension } from "./sparkdownLanguageExtension";

const NEWLINE_REGEX = /\r\n|\r|\n/g;

export const readOnly = new Compartment();

export const editable = new Compartment();

export const marginConf = new Compartment();

interface EditorConfig {
  serverWorker: Worker;
  serverConnection: MessageConnection;
  serverInitializeParams: InitializeParams;
  serverInitializeResult: InitializeResult;
  serverWorkspace: (client: LSPClient) => Workspace;
  textDocument: { uri: string; version: number; text: string };
  scrollMargin?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  top: number;
  bottom: number;
  defaultState?: SerializableEditorState;
  stabilizationDuration?: number;
  breakpointLineNumbers?: number[];
  pinpointLineNumbers?: number[];
  highlightLineNumbers?: number[];
  topContainer?: HTMLElement;
  bottomContainer?: HTMLElement;
  scrollToLineNumber?: number;
  getEditorState?: () => SerializableEditorState;
  setEditorState?: (value: SerializableEditorState) => void;
  onReady?: () => void;
  onViewUpdate?: (update: ViewUpdate) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onIdle?: () => void;
  onSelectionChanged?: (
    update: ViewUpdate,
    anchor: number,
    head: number,
  ) => void;
  onBreakpointsChanged?: (update: ViewUpdate, lineNumbers: number[]) => void;
  onPinpointsChanged?: (update: ViewUpdate, lineNumbers: number[]) => void;
  onHighlightsChanged?: (update: ViewUpdate, lineNumbers: number[]) => void;
  onHeightChanged?: () => void;
  changeFilter?: (tr: Transaction) => boolean | readonly number[];
  transactionFilter?: (
    tr: Transaction,
  ) => TransactionSpec | readonly TransactionSpec[];
  transactionExtender?: (
    tr: Transaction,
  ) => Pick<TransactionSpec, "effects" | "annotations"> | null;
}

const createEditorView = (
  parent: HTMLElement,
  config: EditorConfig,
): [EditorView, { dispose: () => void }] => {
  const textDocument = config.textDocument;
  const serverWorker = config.serverWorker;
  const serverConnection = config.serverConnection;
  const serverInitializeParams = config.serverInitializeParams;
  const serverInitializeResult = config.serverInitializeResult;
  const serverWorkspace = config.serverWorkspace;
  const scrollMargin = config?.scrollMargin;
  const top = config?.top;
  const bottom = config?.bottom;
  const defaultState = config?.defaultState;
  const stabilizationDuration = config?.stabilizationDuration ?? 50;
  const breakpointLineNumbers = config?.breakpointLineNumbers;
  const pinpointLineNumbers = config?.pinpointLineNumbers;
  const highlightLineNumbers = config?.highlightLineNumbers;
  const topContainer = config.topContainer;
  const bottomContainer = config.bottomContainer;
  const scrollToLineNumber = config?.scrollToLineNumber;
  const onReady = config?.onReady;
  const onViewUpdate = config?.onViewUpdate;
  const onBlur = config?.onBlur;
  const onFocus = config?.onFocus;
  const onIdle = config?.onIdle ?? (() => {});
  const onSelectionChanged = config?.onSelectionChanged;
  const onBreakpointsChanged = config?.onBreakpointsChanged;
  const onPinpointsChanged = config?.onPinpointsChanged;
  const onHighlightsChanged = config?.onHighlightsChanged;
  const onHeightChanged = config?.onHeightChanged;
  const debouncedIdle = debounce(onIdle, stabilizationDuration);
  const getEditorState = config?.getEditorState;
  const setEditorState = config?.setEditorState;
  const changeFilter = config?.changeFilter;
  const transactionFilter = config?.transactionFilter;
  const transactionExtender = config?.transactionExtender;
  const doc = config?.textDocument.text ?? "";
  const selection =
    defaultState?.selection != null
      ? EditorSelection.fromJSON(defaultState?.selection)
      : { anchor: 0, head: 0 };

  const programContext: {
    program?: SparkProgram;
  } = {};

  let restoredState: EditorState | undefined;
  if (defaultState?.selection) {
    const selection = defaultState?.selection;
    const history = defaultState?.history;
    const folded = defaultState?.folded;
    restoredState = EditorState.fromJSON(
      {
        doc,
        selection,
        history,
        folded,
      },
      {},
      { history: historyField, folded: foldedField },
    );
  }
  const restoredExtensions = restoredState
    ? [
        historyField.init(() => restoredState?.field(historyField)),
        foldedField.init(
          () => restoredState?.field(foldedField) as DecorationSet,
        ),
      ]
    : [];

  let prevBreakpointLineNumbers = breakpointLineNumbers;
  let prevPinpointLineNumbers = pinpointLineNumbers;
  let prevHighlightLineNumbers = highlightLineNumbers;

  // Using state.doc.line() errors on Mac
  const lines = doc.replace(NEWLINE_REGEX, "\n").split("\n");
  const initialText = Text.of(lines);
  const scrollToLine =
    scrollToLineNumber != null &&
    scrollToLineNumber >= 1 &&
    scrollToLineNumber <= initialText.lines
      ? initialText.line(scrollToLineNumber)
      : undefined;
  const scrollTo = scrollToLine
    ? EditorView.scrollIntoView(
        EditorSelection.range(scrollToLine.from, scrollToLine.to),
        { y: "start" },
      )
    : undefined;

  document.documentElement.style.setProperty("--cm-top-offset", `${top}px`);
  document.documentElement.style.setProperty(
    "--cm-bottom-offset",
    `${bottom}px`,
  );

  const view: EditorView = new EditorView({
    parent,
    scrollTo,
    state: EditorState.create({
      doc,
      selection,
      extensions: [
        ...restoredExtensions,
        EditorView.theme(EDITOR_THEME, { dark: true }),
        EDITOR_EXTENSIONS,
        panels({ topContainer, bottomContainer }),
        search({
          createPanel: (view) => new SearchPanel(view),
          scrollToMatch: (range: SelectionRange) =>
            EditorView.scrollIntoView(range, { y: "center" }),
          top: true,
        }),
        statusPanel(),
        gotoLinePanel(),
        readOnly.of(EditorState.readOnly.of(false)),
        editable.of(EditorView.editable.of(true)),
        breakpointsField.init(() => {
          const gutterMarkers: Range<GutterMarker>[] =
            breakpointLineNumbers
              ?.map((lineNumber) => {
                try {
                  // Using state.doc.line() errors on Mac, so must use initialText.line() instead
                  return breakpointMarker.range(
                    initialText.line(lineNumber).from,
                  ) as Range<GutterMarker>;
                } catch {
                  return null;
                }
              })
              .filter((r): r is Range<GutterMarker> => Boolean(r)) ?? [];
          return RangeSet.of(gutterMarkers, true);
        }),
        pinpointsField.init(() => {
          let decorations = RangeSet.empty;
          if (pinpointLineNumbers) {
            decorations = decorations.update({
              add: pinpointLineNumbers
                .map((lineNumber) => {
                  try {
                    // Using state.doc.line() errors on Mac, so must use initialText.line() instead
                    return pinpointDeco.range(
                      initialText.line(lineNumber).from,
                    );
                  } catch {
                    return null;
                  }
                })
                .filter((r): r is Range<Decoration> => Boolean(r)),
              sort: true,
            });
          }
          return decorations;
        }),
        highlightsField.init(() => {
          let decorations = RangeSet.empty;
          if (highlightLineNumbers) {
            decorations = decorations.update({
              add: highlightLineNumbers
                .map((lineNumber) => {
                  try {
                    // Using state.doc.line() errors on Mac, so must use initialText.line() instead
                    return highlightDeco.range(
                      initialText.line(lineNumber).from,
                    );
                  } catch {
                    return null;
                  }
                })
                .filter((r): r is Range<Decoration> => Boolean(r)),
              sort: true,
            });
          }
          return decorations;
        }),
        sparkdownLanguageExtension({
          textDocument,
          serverWorker,
          serverConnection,
          serverInitializeParams,
          serverInitializeResult,
          serverWorkspace,
        }),
        variableWidgets({
          programContext,
        }),
        EditorState.changeFilter.of(
          (tr: Transaction): boolean | readonly number[] => {
            if (changeFilter) {
              return changeFilter(tr);
            }
            return true;
          },
        ),
        EditorState.transactionFilter.of(
          (tr: Transaction): TransactionSpec | readonly TransactionSpec[] => {
            if (transactionFilter) {
              return transactionFilter(tr);
            }
            return tr;
          },
        ),
        EditorState.transactionExtender.of(
          (
            tr: Transaction,
          ): Pick<TransactionSpec, "effects" | "annotations"> | null => {
            if (transactionExtender) {
              return transactionExtender(tr);
            }
            return null;
          },
        ),
        EditorView.updateListener.of((u) => {
          const parsing = syntaxParserRunning(u.view);
          if (!parsing) {
            onReady?.();
            debouncedIdle();
          }
          if (u.heightChanged) {
            onHeightChanged?.();
          }
          if (u.selectionSet) {
            const cursorRange = u.state.selection.main;
            const anchor = cursorRange?.anchor;
            const head = cursorRange?.head;
            onSelectionChanged?.(u, anchor, head);
          }
          if (u.docChanged || breakpointsChanged(u)) {
            const currentBreakpointLineNumbers = getBreakpointLineNumbers(
              u.view,
            );
            if (
              JSON.stringify(currentBreakpointLineNumbers) !==
              JSON.stringify(prevBreakpointLineNumbers)
            ) {
              prevBreakpointLineNumbers = currentBreakpointLineNumbers;
              onBreakpointsChanged?.(u, currentBreakpointLineNumbers);
            }
          }
          if (u.docChanged || pinpointsChanged(u)) {
            const currentPinpointLineNumbers = getPinpointLineNumbers(u.view);
            if (
              JSON.stringify(currentPinpointLineNumbers) !==
              JSON.stringify(prevPinpointLineNumbers)
            ) {
              prevPinpointLineNumbers = currentPinpointLineNumbers;
              onPinpointsChanged?.(u, currentPinpointLineNumbers);
            }
          }
          if (u.docChanged || highlightsChanged(u)) {
            const currentHighlightLineNumbers = getHighlightLineNumbers(u.view);
            if (
              JSON.stringify(currentHighlightLineNumbers) !==
              JSON.stringify(prevHighlightLineNumbers)
            ) {
              prevHighlightLineNumbers = currentHighlightLineNumbers;
              onHighlightsChanged?.(u, currentHighlightLineNumbers);
            }
          }
          onViewUpdate?.(u);
          const json: {
            history: SerializableHistoryState;
            folded: SerializableFoldedState;
          } = u.state.toJSON({
            history: historyField,
            folded: foldedField,
          });
          const selection =
            u.view.state.selection.toJSON() as SerializableEditorSelection;
          const history = json?.history;
          const folded = json?.folded;
          const transaction = u.transactions?.[0];
          const userEvent = transaction?.isUserEvent("undo")
            ? "undo"
            : transaction?.isUserEvent("redo")
              ? "redo"
              : undefined;
          const focused = u.view.hasFocus;
          const snippet = Boolean(parent.querySelector(".cm-snippetField"));
          const lint = Boolean(parent.querySelector(".cm-panel-lint"));
          const selected =
            selection?.ranges?.[selection.main]?.head !==
            selection?.ranges?.[selection.main]?.anchor;
          const editorState = {
            doc,
            selection,
            history,
            userEvent,
            focused,
            selected,
            snippet,
            folded,
          };
          if (parent) {
            if (snippet) {
              parent.classList.add("cm-snippet");
            } else {
              parent.classList.remove("cm-snippet");
            }
            if (lint) {
              parent.classList.add("cm-lint");
            } else {
              parent.classList.remove("cm-lint");
            }
          }
          if (
            JSON.stringify(getEditorState?.() || {}) !==
            JSON.stringify(editorState)
          ) {
            setEditorState?.(editorState);
          }
          if (u.focusChanged) {
            if (u.view.hasFocus) {
              onFocus?.();
            } else {
              onBlur?.();
            }
          }
          setEditorState?.(editorState);
        }),
        EditorView.domEventHandlers({
          focus: (event, view) => {
            document.body.classList.add("keyboard-open");
          },
          blur: (event, view) => {
            document.body.classList.remove("keyboard-open");
          },
        }),
        marginConf.of(
          EditorView.scrollMargins.of(() => ({
            ...scrollMargin,
            bottom: scrollMargin?.bottom,
          })),
        ),
        EditorView.theme(
          {
            "& .cm-panels.cm-panels-top": {
              top: `var(--cm-top-offset) !important`,
            },
            "& .cm-panels.cm-panels-bottom": {
              bottom: `var(--cm-bottom-offset) !important`,
            },
          },
          { dark: true },
        ),
      ],
    }),
  });
  const handleProtocol = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      // TODO:
      // if (CompiledProgramMessage.type.isNotification(message)) {
      //   onParse(message);
      // }
    }
  };

  const header = document.querySelector("header");
  const footer = document.querySelector("footer");

  const footerHeight = 80;
  const extraYMarginOffset = 0;
  const extraBottomOffset = 20;

  const syncLayout = () => {
    if (!isMobile()) {
      return;
    }

    const vv = window.visualViewport;
    if (!vv) return;

    // 1. LOCKDOWN FIRST: Force scroll to 0 before reading viewport math
    // This stops the browser's native scroll from poisoning our calculations
    if (window.scrollY !== 0 || window.scrollX !== 0) {
      window.scrollTo(0, 0);
    }

    const keyboardHeight = window.innerHeight - vv.height;
    const bottomOffset = keyboardHeight + footerHeight;

    // Update the CSS variable used by .cm-panels-bottom
    document.documentElement.style.setProperty(
      "--cm-bottom-offset",
      `${bottomOffset}px`,
    );

    // 1. Dynamically reconfigure scroll margins via Compartment
    view.dispatch({
      effects: marginConf.reconfigure(
        EditorView.scrollMargins.of(() => ({
          bottom: bottomOffset + extraBottomOffset,
        })),
      ),
    });

    if (header) {
      header.style.display = "block";
    }
    if (footer) {
      footer.style.display = "block";
    }

    // Update CSS variables for padding-bottom
    document.documentElement.style.setProperty(
      "--keyboard-height",
      `${keyboardHeight}px`,
    );
    document.documentElement.style.setProperty(
      "--viewport-offset-top",
      `${vv.offsetTop}px`,
    );

    // Position Header: Locked to the top of the visual viewport
    if (header) {
      header.style.transform = `translate3d(0, ${vv.offsetTop}px, 0)`;
    }

    if (footer) {
      if (isIOS()) {
        const visibleBottomY = vv.offsetTop + vv.height;
        footer.style.top = "0px";
        footer.style.bottom = "auto";
        footer.style.transform = `translate3d(0, ${visibleBottomY - footer.offsetHeight}px, 0)`;
      } else {
        footer.style.bottom = "0px";
        footer.style.top = "auto";
        footer.style.transform = `translate3d(0, ${-keyboardHeight}px, 0)`;
      }
    }

    // Ensure cursor is visible
    if (view.hasFocus && keyboardHeight > 0) {
      view.dispatch({
        effects: EditorView.scrollIntoView(view.state.selection.main, {
          y: "center",
          yMargin: bottomOffset + extraYMarginOffset,
        }),
      });
    }
  };

  syncLayout();

  // Listen for selection changes inside CodeMirror
  view.dom.addEventListener("click", () => setTimeout(syncLayout, 100));
  view.dom.addEventListener("focusin", () => setTimeout(syncLayout, 100));

  window.visualViewport?.addEventListener("resize", syncLayout);
  window.visualViewport?.addEventListener("scroll", syncLayout);
  window.addEventListener(MessageProtocol.event, handleProtocol);
  const disposable = {
    dispose: () => {
      window.visualViewport?.removeEventListener("resize", syncLayout);
      window.visualViewport?.removeEventListener("scroll", syncLayout);
      window.removeEventListener(MessageProtocol.event, handleProtocol);
    },
  };
  return [view, disposable];
};

export default createEditorView;
