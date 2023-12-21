import { historyField } from "@codemirror/commands";
import { syntaxTreeAvailable } from "@codemirror/language";
import {
  Annotation,
  Compartment,
  EditorSelection,
  EditorState,
  Text,
  Transaction,
} from "@codemirror/state";
import { DecorationSet, EditorView, ViewUpdate } from "@codemirror/view";
import { DidParseTextDocumentMessage } from "../../../../../spark-editor-protocol/src/protocols/textDocument/DidParseTextDocumentMessage";
import {
  MessageConnection,
  ServerCapabilities,
} from "../../../../../spark-editor-protocol/src/types";
import { SparkProgram } from "../../../../../sparkdown/src/types/SparkProgram";
import {
  breakpointsChanged,
  getBreakpointLines,
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
  defaultState?: SerializableEditorState;
  stabilizationDuration?: number;
  getEditorState?: () => SerializableEditorState;
  setEditorState?: (value: SerializableEditorState) => void;
  onReady?: () => void;
  onViewUpdate?: (update: ViewUpdate) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onIdle?: () => void;
  onSelectionChanged?: (update: {
    selectedRange: {
      start: {
        line: number;
        character: number;
      };
      end: {
        line: number;
        character: number;
      };
    };
    docChanged: boolean;
  }) => void;
  onBreakpointsChanged?: (lines: number[]) => void;
  onHeightChanged?: () => void;
  onEdit?: (change: {
    transaction: Transaction;
    annotations: Annotation<any>[];
    before: Text;
    after: Text;
  }) => void;
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
  const defaultState = config?.defaultState;
  const stabilizationDuration = config?.stabilizationDuration ?? 200;
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
  const onEdit = config?.onEdit;
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
      readOnly.of(EditorState.readOnly.of(false)),
      editable.of(EditorView.editable.of(true)),
      versioning(),
      scrollMargins(scrollMargin),
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
          onBreakpointsChanged?.(getBreakpointLines(u.view));
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
    dispatch: (tr) => syncDispatch(tr, view, onEdit),
  });
  const disposable = serverConnection.onNotification(
    DidParseTextDocumentMessage.type,
    (params) => {
      const program = params.program;
      const version = params.textDocument.version;
      programContext.program = program;
      if (version === getDocumentVersion(view.state)) {
        view.dispatch(
          updateVariableWidgets({ variables: program.variables || {} })
        );
      }
    }
  );
  return [view, disposable];
};

export default createEditorView;
