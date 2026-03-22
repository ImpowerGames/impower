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
  PanelConstructor,
  ViewUpdate,
  panels,
  scrollPastEnd,
  showPanel,
} from "@codemirror/view";
import {
  LSPClient,
  Workspace,
} from "@impower/codemirror-vscode-lsp-client/src";
import {
  isAndroid,
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

export const readOnlyConfig = new Compartment();

export const editableConfig = new Compartment();

export const scrollMarginsConfig = new Compartment();

export const editorAttributesConfig = new Compartment();

// Create a panel that returns an empty div
const emptyPanel: PanelConstructor = () => ({
  dom: document.createElement("div"),
});

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
  mobileTopContainer?: HTMLElement;
  mobileBottomContainer?: HTMLElement;
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
  const mobileTopContainer = config.mobileTopContainer;
  const mobileBottomContainer = config.mobileBottomContainer;
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

  document.body.style.setProperty("--cm-top-offset", `${top}px`);
  document.body.style.setProperty("--cm-bottom-offset", `${bottom}px`);

  const header = document.querySelector("header");
  const footer = document.querySelector("footer");

  const syncLayout = () => {
    if (!isMobile()) {
      return;
    }

    const vv = window.visualViewport;
    if (!vv) return;

    // LOCKDOWN FIRST: Force scroll to 0 before reading viewport math
    // This stops the browser's native scroll from poisoning our calculations
    if (window.scrollY !== 0 || window.scrollX !== 0) {
      window.scrollTo(0, 0);
    }

    const keyboardHeight = window.innerHeight - vv.height;
    const keyboardOpen = keyboardHeight > 0;

    // Dynamically reconfigure editorAttributes via Compartment
    view.dispatch({
      effects: editorAttributesConfig.reconfigure(
        EditorView.editorAttributes.of({
          "data-platform": isIOS()
            ? "ios"
            : isAndroid()
              ? "android"
              : "desktop",
          "data-keyboard": keyboardOpen ? "open" : "closed",
          style: "",
        }),
      ),
    });

    // Update CSS variables
    const body = document.body;
    body.style.setProperty("--cm-keyboard-height", `${keyboardHeight}px`);
    body.style.setProperty("--vv-offset-top", `${vv.offsetTop}px`);
    body.style.setProperty("--vv-height", `${vv.height}px`);
    document.documentElement.classList.add(
      isIOS() ? "ios" : isAndroid() ? "android" : "desktop",
    );

    if (header) {
      header.style.display = "block";
    }
    if (footer) {
      footer.style.display = "block";
    }

    // Dynamically reconfigure scroll margins via Compartment
    view.dispatch({
      effects: scrollMarginsConfig.reconfigure(
        EditorView.scrollMargins.of(() => ({
          ...scrollMargin,
          bottom: keyboardHeight,
        })),
      ),
    });

    if (keyboardOpen) {
      document.documentElement.classList.add("keyboard-open");
    } else {
      document.documentElement.classList.remove("keyboard-open");
    }

    if (keyboardOpen && view.hasFocus) {
      // Ensure cursor is visible
      view.dispatch({
        effects: EditorView.scrollIntoView(view.state.selection.main, {
          y: "center",
        }),
      });
    }
  };

  // Create Editor View
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
        panels({
          topContainer: isMobile() ? mobileTopContainer : undefined,
          bottomContainer: isMobile() ? mobileBottomContainer : undefined,
        }),
        search({
          createPanel: (view) => new SearchPanel(view),
          scrollToMatch: (range: SelectionRange) =>
            EditorView.scrollIntoView(range, { y: "center" }),
          top: true,
        }),
        statusPanel(),
        gotoLinePanel(),
        readOnlyConfig.of(EditorState.readOnly.of(false)),
        editableConfig.of(EditorView.editable.of(true)),
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
        scrollMarginsConfig.of(
          EditorView.scrollMargins.of(() => ({
            ...scrollMargin,
            bottom: scrollMargin?.bottom,
          })),
        ),
        editorAttributesConfig.of(
          EditorView.editorAttributes.of({
            "data-platform": isIOS()
              ? "ios"
              : isAndroid()
                ? "android"
                : "desktop",
            style: "",
          }),
        ),
        EditorView.theme(
          {
            "&": {
              height: "100% !important",
              display: "flex !important",
              flexDirection: "column !important",
              overscrollBehavior: "contain !important",
            },
            "& *": {
              overscrollBehavior: "contain !important",
            },
            ".cm-scroller": {
              flexGrow: "1 !important",
              overflow: "auto !important",
              WebkitOverflowScrolling: "touch !important",
            },
            "& .cm-panels.cm-panels-top": {
              top: `var(--cm-top-offset) !important`,
            },
            // Replaces global CSS for panels
            ".cm-panels-bottom": {
              left: "0 !important",
              right: "0 !important",
              flexShrink: "0 !important",
              willChange: "transform !important",
            },
            // Platform specific logic inside the theme using the body classes
            "&[data-platform=ios] .cm-panels-bottom": {
              top: "0 !important",
              bottom: "auto !important",
              transition: "transform 0.05s linear",
              transform:
                "translateY(calc(var(--vv-offset-top) + var(--vv-height) - 100%))",
            },
            "&[data-platform=android] .cm-panels-bottom": {
              bottom: `var(--cm-bottom-offset) !important`,
              top: "auto !important",
              transition: "transform 0.05s linear",
              transform: "translateY(calc(-1 * var(--cm-keyboard-height)))",
            },
            "&[data-platform=android][data-keyboard=open] .cm-panels-bottom": {
              transform:
                "translateY(calc(-1 * var(--cm-keyboard-height) + var(--cm-bottom-offset)))",
            },
          },
          { dark: true },
        ),
        scrollPastEnd(),
        // This ensures the bottom panel container always has at least one child
        showPanel.of(emptyPanel),
        EditorView.domEventHandlers({
          touchstart: (event, view) => {
            // 1. Stop the native browser tap/focus/scroll behavior
            event.preventDefault();

            // 2. Get the exact screen coordinates of the tap
            const touch = event.changedTouches[0]!;
            const pos = view.posAtCoords({
              x: touch.clientX,
              y: touch.clientY,
            });

            // 3. If they tapped inside the text, manually move the cursor there
            if (pos !== null) {
              view.dispatch({
                selection: { anchor: pos, head: pos },
              });
            }

            // 4. Manually focus the editor's internal element without scrolling the body
            view.contentDOM.focus({ preventScroll: true });

            // 5. Return true to tell CodeMirror we successfully handled the event
            return true;
          },
        }),
        EditorView.domEventObservers({
          focus: () => {
            syncLayout();
          },
          blur: () => {
            syncLayout();
          },
        }),
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

  syncLayout();

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
