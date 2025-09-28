import { historyField } from "@codemirror/commands";
import { syntaxParserRunning } from "@codemirror/language";
import { search } from "@codemirror/search";
import {
  Compartment,
  EditorSelection,
  EditorState,
  SelectionRange,
  Transaction,
  TransactionSpec,
} from "@codemirror/state";
import {
  DecorationSet,
  EditorView,
  ViewUpdate,
  panels,
} from "@codemirror/view";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import {
  DidCompileTextDocumentMessage,
  DidCompileTextDocumentMethod,
  DidCompileTextDocumentParams,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/DidCompileTextDocumentMessage";
import {
  MessageConnection,
  ServerCapabilities,
} from "@impower/spark-editor-protocol/src/types";
import { NotificationMessage } from "@impower/spark-engine/src";
import { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { foldedField } from "../../../cm-folded/foldedField";
import {
  getHighlightLineNumbers,
  highlightsChanged,
} from "../../../cm-highlight-lines/highlightLines";
import { FileSystemReader } from "../../../cm-language-client/types/FileSystemReader";
import {
  getPinpointLineNumbers,
  pinpointsChanged,
} from "../../../cm-pinpoints/pinpoints";
import {
  updateVariableWidgets,
  variableWidgets,
} from "../../../cm-variable-widgets/variableWidgets";
import { getDocumentVersion } from "../../../cm-versioning/versioning";
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

export const readOnly = new Compartment();

export const editable = new Compartment();

interface EditorConfig {
  serverConnection: MessageConnection;
  serverCapabilities: ServerCapabilities;
  fileSystemReader?: FileSystemReader;
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
    head: number
  ) => void;
  onBreakpointsChanged?: (update: ViewUpdate, lineNumbers: number[]) => void;
  onPinpointsChanged?: (update: ViewUpdate, lineNumbers: number[]) => void;
  onHighlightsChanged?: (update: ViewUpdate, lineNumbers: number[]) => void;
  onHeightChanged?: () => void;
  changeFilter?: (tr: Transaction) => boolean | readonly number[];
  transactionFilter?: (
    tr: Transaction
  ) => TransactionSpec | readonly TransactionSpec[];
  transactionExtender?: (
    tr: Transaction
  ) => Pick<TransactionSpec, "effects" | "annotations"> | null;
}

const createEditorView = (
  parent: HTMLElement,
  config: EditorConfig
): [EditorView, { dispose: () => void }] => {
  const textDocument = config.textDocument;
  const serverConnection = config.serverConnection;
  const serverCapabilities = config.serverCapabilities;
  const fileSystemReader = config.fileSystemReader;
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
      { history: historyField, folded: foldedField }
    );
  }
  const restoredExtensions = restoredState
    ? [
        historyField.init(() => restoredState?.field(historyField)),
        foldedField.init(
          () => restoredState?.field(foldedField) as DecorationSet
        ),
      ]
    : [];
  let prevBreakpointLineNumbers = breakpointLineNumbers;
  let prevPinpointLineNumbers = pinpointLineNumbers;
  let prevHighlightLineNumbers = highlightLineNumbers;
  const initialDocState = EditorState.create({ doc });
  const scrollToLine =
    scrollToLineNumber != null &&
    scrollToLineNumber >= 1 &&
    scrollToLineNumber <= initialDocState.doc.lines
      ? initialDocState.doc.line(scrollToLineNumber)
      : undefined;
  const scrollTo = scrollToLine
    ? EditorView.scrollIntoView(
        EditorSelection.range(scrollToLine.from, scrollToLine.to),
        { y: "start" }
      )
    : undefined;
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
        // breakpointsField.init(() => {
        //   const gutterMarkers: Range<GutterMarker>[] =
        //     breakpointLineNumbers?.map((lineNumber) => {
        //       // Using state.doc.line() errors on Mac, so must use initialDocState.doc.line() instead
        //       return breakpointMarker.range(
        //         initialDocState.doc.line(lineNumber).from
        //       );
        //     }) ?? [];
        //   return RangeSet.of(gutterMarkers, true);
        // }),
        // pinpointsField.init(() => {
        //   let decorations = RangeSet.empty;
        //   if (pinpointLineNumbers) {
        //     decorations = decorations.update({
        //       add: pinpointLineNumbers
        //         .filter(
        //           (lineNumber) =>
        //             typeof lineNumber === "number" &&
        //             lineNumber <= initialDocState.doc.lines
        //         )
        //         .map((lineNumber) => {
        //           // Using state.doc.line() errors on Mac, so must use initialDocState.doc.line() instead
        //           return pinpointDeco.range(
        //             initialDocState.doc.line(lineNumber).from
        //           );
        //         }),
        //       sort: true,
        //     });
        //   }
        //   return decorations;
        // }),
        // highlightsField.init(() => {
        //   let decorations = RangeSet.empty;
        //   if (highlightLineNumbers) {
        //     decorations = decorations.update({
        //       add: highlightLineNumbers
        //         .filter(
        //           (lineNumber) =>
        //             typeof lineNumber === "number" &&
        //             lineNumber <= initialDocState.doc.lines
        //         )
        //         .map((lineNumber) => {
        //           // Using state.doc.line() errors on Mac, so must use initialDocState.doc.line() instead
        //           return highlightDeco.range(
        //             initialDocState.doc.line(lineNumber).from
        //           );
        //         }),
        //       sort: true,
        //     });
        //   }
        //   return decorations;
        // }),
        EditorView.scrollMargins.of(() => {
          return scrollMargin ?? null;
        }),
        EditorView.theme(
          {
            "& .cm-panels.cm-panels-top": {
              top: `${top}px !important`,
            },
            "& .cm-panels.cm-panels-bottom": {
              bottom: `${bottom}px !important`,
            },
          },
          { dark: true }
        ),
        sparkdownLanguageExtension({
          textDocument,
          serverConnection,
          serverCapabilities,
          fileSystemReader,
        }),
        variableWidgets({
          fileSystemReader,
          programContext,
        }),
        EditorState.changeFilter.of(
          (tr: Transaction): boolean | readonly number[] => {
            if (changeFilter) {
              return changeFilter(tr);
            }
            return true;
          }
        ),
        EditorState.transactionFilter.of(
          (tr: Transaction): TransactionSpec | readonly TransactionSpec[] => {
            if (transactionFilter) {
              return transactionFilter(tr);
            }
            return tr;
          }
        ),
        EditorState.transactionExtender.of(
          (
            tr: Transaction
          ): Pick<TransactionSpec, "effects" | "annotations"> | null => {
            if (transactionExtender) {
              return transactionExtender(tr);
            }
            return null;
          }
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
          // if (u.docChanged || breakpointsChanged(u)) {
          //   const currentBreakpointLineNumbers = getBreakpointLineNumbers(
          //     u.view
          //   );
          //   if (
          //     JSON.stringify(currentBreakpointLineNumbers) !==
          //     JSON.stringify(prevBreakpointLineNumbers)
          //   ) {
          //     prevBreakpointLineNumbers = currentBreakpointLineNumbers;
          //     onBreakpointsChanged?.(u, currentBreakpointLineNumbers);
          //   }
          // }
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
      ],
    }),
  });
  const handleProtocol = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidCompileTextDocumentMessage.type.isNotification(message)) {
        onParse(message);
      }
    }
  };
  const onParse = (
    message: NotificationMessage<
      DidCompileTextDocumentMethod,
      DidCompileTextDocumentParams
    >
  ) => {
    const params = message.params;
    const program = params.program;
    const version = params.textDocument.version;
    programContext.program = program;
    if (version === getDocumentVersion(view.state)) {
      view.dispatch(
        updateVariableWidgets({
          variables: {}, // TODO
        })
      );
    }
  };
  window.addEventListener(MessageProtocol.event, handleProtocol);
  const disposable = {
    dispose: () => {
      window.removeEventListener(MessageProtocol.event, handleProtocol);
    },
  };
  return [view, disposable];
};

export default createEditorView;
