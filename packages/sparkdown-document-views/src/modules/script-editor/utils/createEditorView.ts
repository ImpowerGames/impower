import { historyField } from "@codemirror/commands";
import { syntaxTreeAvailable } from "@codemirror/language";
import {
  Compartment,
  EditorSelection,
  EditorState,
  Range,
  RangeSet,
  Transaction,
  TransactionSpec,
} from "@codemirror/state";
import {
  DecorationSet,
  EditorView,
  GutterMarker,
  ViewUpdate,
} from "@codemirror/view";
import { DidParseTextDocumentMessage } from "../../../../../spark-editor-protocol/src/protocols/textDocument/DidParseTextDocumentMessage";
import {
  MessageConnection,
  ServerCapabilities,
} from "../../../../../spark-editor-protocol/src/types";
import { SparkProgram } from "../../../../../sparkdown/src/types/SparkProgram";
import {
  breakpointMarker,
  breakpointsChanged,
  breakpointsField,
  getBreakpointPositions,
} from "../../../cm-breakpoints/breakpoints";
import { foldedField } from "../../../cm-folded/foldedField";
import { FileSystemReader } from "../../../cm-language-client/types/FileSystemReader";
import { offsetToPosition } from "../../../cm-language-client/utils/offsetToPosition";
import { scrollMargins } from "../../../cm-scroll-margins/scrollMargins";
import { syncDispatch } from "../../../cm-sync/syncDispatch";
import {
  updateVariableWidgets,
  variableWidgets,
} from "../../../cm-variable-widgets/variableWidgets";
import {
  getDocumentVersion,
  versioning,
} from "../../../cm-versioning/versioning";
import debounce from "../../../utils/debounce";
import EDITOR_EXTENSIONS from "../constants/EDITOR_EXTENSIONS";
import EDITOR_THEME from "../constants/EDITOR_THEME";
import {
  SerializableEditorSelection,
  SerializableEditorState,
  SerializableFoldedState,
  SerializableHistoryState,
} from "../types/editor";
import { sparkdownLanguageExtension } from "./sparkdownLanguageExtension";
import { search } from "@codemirror/search";
import { SearchPanel } from "../panels/SearchPanel";

export const readOnly = new Compartment();

export const editable = new Compartment();

interface SerializableRange {
  start: {
    line: number;
    character: number;
  };
  end: {
    line: number;
    character: number;
  };
}

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
  defaultState?: SerializableEditorState;
  stabilizationDuration?: number;
  breakpointRanges?: SerializableRange[];
  getEditorState?: () => SerializableEditorState;
  setEditorState?: (value: SerializableEditorState) => void;
  onReady?: () => void;
  onViewUpdate?: (update: ViewUpdate) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onIdle?: () => void;
  onSelectionChanged?: (update: {
    selectedRange: SerializableRange;
    docChanged: boolean;
  }) => void;
  onBreakpointsChanged?: (ranges: SerializableRange[]) => void;
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
  const defaultState = config?.defaultState;
  const stabilizationDuration = config?.stabilizationDuration ?? 200;
  const breakpointRanges = config?.breakpointRanges;
  const onReady = config?.onReady;
  const onViewUpdate = config?.onViewUpdate;
  const onBlur = config?.onBlur;
  const onFocus = config?.onFocus;
  const onIdle = config?.onIdle ?? (() => {});
  const onSelectionChanged = config?.onSelectionChanged;
  const onBreakpointsChanged = config?.onBreakpointsChanged;
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
  const startState = EditorState.create({
    doc,
    selection,
    extensions: [
      ...restoredExtensions,
      EditorView.theme(EDITOR_THEME, { dark: true }),
      EDITOR_EXTENSIONS,
      search({ createPanel: (view) => new SearchPanel(view), top: true }),
      readOnly.of(EditorState.readOnly.of(false)),
      editable.of(EditorView.editable.of(true)),
      versioning(),
      breakpointsField.init((state) => {
        const gutterMarkers: Range<GutterMarker>[] =
          breakpointRanges?.map((range) => {
            const line = state.doc.line(range.start.line + 1);
            const pos = line.from + range.start.character;
            return breakpointMarker.range(pos);
          }) ?? [];
        return RangeSet.of(gutterMarkers, true);
      }),
      scrollMargins(scrollMargin),
      EditorView.theme(
        {
          "& .cm-panels.cm-panels-top": {
            top: `${top}px !important`,
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
        const parsed = syntaxTreeAvailable(u.state);
        if (parsed) {
          onReady?.();
        }
        debouncedIdle();
        if (u.heightChanged) {
          onHeightChanged?.();
        }
        if (u.selectionSet) {
          const cursorRange = u.state.selection.main;
          const anchor = cursorRange?.anchor;
          const head = cursorRange?.head;
          const startPos = Math.min(anchor, head);
          const endPos = Math.max(anchor, head);
          const selectedRange = {
            start: offsetToPosition(u.state.doc, startPos),
            end: offsetToPosition(u.state.doc, endPos),
          };
          const docChanged = u.docChanged;
          onSelectionChanged?.({ selectedRange, docChanged });
        }
        if (breakpointsChanged(u)) {
          onBreakpointsChanged?.(
            getBreakpointPositions(u.view).map((pos) => {
              return {
                start: offsetToPosition(u.state.doc, pos),
                end: offsetToPosition(u.state.doc, pos),
              };
            })
          );
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
  });
  const view: EditorView = new EditorView({
    state: startState,
    parent,
    dispatchTransactions: (trs, view) => syncDispatch(trs, view),
  });
  const onParse = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidParseTextDocumentMessage.type.isNotification(message)) {
        const params = message.params;
        const program = params.program;
        const version = params.textDocument.version;
        programContext.program = program;
        if (version === getDocumentVersion(view.state)) {
          view.dispatch(
            updateVariableWidgets({ variables: /* program.variables || */ {} })
          );
        }
      }
    }
  };
  window.addEventListener(DidParseTextDocumentMessage.method, onParse);
  const disposable = {
    dispose: () => {
      window.removeEventListener(DidParseTextDocumentMessage.method, onParse);
    },
  };
  return [view, disposable];
};

export default createEditorView;
