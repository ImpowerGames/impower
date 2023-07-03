import { historyField } from "@codemirror/commands";
import { syntaxTreeAvailable } from "@codemirror/language";
import {
  Annotation,
  ChangeSet,
  EditorSelection,
  EditorState,
  Text,
} from "@codemirror/state";
import { DecorationSet, EditorView, ViewUpdate } from "@codemirror/view";
import { foldedField } from "../../../cm-folded/foldedField";
import { LanguageServerConnection } from "../../../cm-language-client";
import { scrollMargins } from "../../../cm-scroll-margins/scrollMargins";
import { syncDispatch } from "../../../cm-sync/syncDispatch";
import EDITOR_EXTENSIONS from "../constants/EDITOR_EXTENSIONS";
import EDITOR_THEME from "../constants/EDITOR_THEME";
import {
  SerializableEditorSelection,
  SerializableEditorState,
  SerializableFoldedState,
  SerializableHistoryState,
} from "../types/editor";
import { lockBodyScrolling, unlockBodyScrolling } from "./bodyScrolling";
import { sparkdownLanguageExtension } from "./sparkdownLanguageExtension";

interface EditorConfig {
  connection: LanguageServerConnection;
  textDocument: { uri: string; version: number };
  doc?: string;
  disableBodyScrollLocking?: number;
  contentPadding?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  defaultState?: SerializableEditorState;
  getEditorState?: () => SerializableEditorState;
  setEditorState?: (value: SerializableEditorState) => void;
  getCursor?: () => {
    anchor: number;
    head: number;
    fromLine: number;
    toLine: number;
  };
  setCursor?: (range: {
    anchor: number;
    head: number;
    fromLine: number;
    toLine: number;
  }) => void;
  onReady?: () => void;
  onViewUpdate?: (update: ViewUpdate) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onEdit?: (change: {
    before: Text;
    after: Text;
    changes: ChangeSet;
    annotations: Annotation<any>[];
  }) => void;
}

const createEditorView = (
  parent: HTMLElement,
  config: EditorConfig
): EditorView => {
  const textDocument = config.textDocument;
  const connection = config.connection;
  const disableBodyScrollLocking = config?.disableBodyScrollLocking;
  const contentPadding = config?.contentPadding;
  const defaultState = config?.defaultState;
  const onReady = config?.onReady;
  const onViewUpdate = config?.onViewUpdate;
  const onBlur = config?.onBlur;
  const onFocus = config?.onFocus;
  const getCursor = config?.getCursor;
  const setCursor = config?.setCursor;
  const getEditorState = config?.getEditorState;
  const setEditorState = config?.setEditorState;
  const onEdit = config?.onEdit;
  const doc = config?.doc ?? "";
  const selection =
    defaultState?.selection != null
      ? EditorSelection.fromJSON(defaultState?.selection)
      : { anchor: 0, head: 0 };
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
      scrollMargins(contentPadding),
      sparkdownLanguageExtension({ textDocument, connection }),
      EditorView.updateListener.of((u) => {
        const parsed = syntaxTreeAvailable(u.state);
        if (parsed) {
          onReady?.();
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
        if (!disableBodyScrollLocking) {
          if (focused) {
            lockBodyScrolling();
          } else {
            unlockBodyScrolling();
          }
        }
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
        const cursorRange = u.state.selection.main;
        const anchor = cursorRange?.anchor;
        const head = cursorRange?.head;
        const fromLine = u.state.doc.lineAt(anchor)?.number;
        const toLine = u.state.doc.lineAt(head)?.number;
        const cursor = getCursor?.();
        if (
          cursor?.fromLine !== fromLine ||
          cursor?.toLine !== toLine ||
          cursor?.anchor !== anchor ||
          cursor?.head !== head
        ) {
          setCursor?.({
            anchor,
            head,
            fromLine,
            toLine,
          });
        }
      }),
    ],
  });
  const view: EditorView = new EditorView({
    state: startState,
    parent,
    dispatch: (tr) => syncDispatch(tr, view, onEdit),
  });
  return view;
};

export default createEditorView;
