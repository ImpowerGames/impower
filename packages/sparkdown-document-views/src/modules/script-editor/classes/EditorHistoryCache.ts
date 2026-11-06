import { history, historyField, isolateHistory } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { convertFromPosition } from "@impower/codemirror-vscode-lsp-client/src";
import type {
  SerializableEditorSelection,
  SerializableHistoryState,
} from "../types/editor";

export interface CachedEditorHistory {
  selection: SerializableEditorSelection;
  history: SerializableHistoryState;
}

interface Entry extends CachedEditorHistory {
  text: string;
}

export interface CachedTextEdit {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  newText: string;
}

export const EDITOR_HISTORY_CACHE_LIMIT = 20;

const LINE_BREAKS = /\r\n?/g;

const normalize = (text: string) => text.replace(LINE_BREAKS, "\n");

export class EditorHistoryCache {
  protected readonly _entries = new Map<string, Entry>();

  protected _root: string | undefined;

  protected readonly _open = new Map<object, string>();

  protected readonly _recorded = new Map<string, number | string>();

  constructor(readonly limit = EDITOR_HISTORY_CACHE_LIMIT) {}

  get size() {
    return this._entries.size;
  }

  uris() {
    return [...this._entries.keys()];
  }

  useRoot(root: string | undefined) {
    if (root !== this._root) {
      this._root = root;
      this.clear();
    }
  }

  holdOpen(editor: object, uri: string | undefined) {
    if (uri) {
      this._open.set(editor, uri);
    } else {
      this._open.delete(editor);
    }
  }

  isOpen(uri: string) {
    return [...this._open.values()].includes(uri);
  }

  save(uri: string, state: EditorState) {
    const json = state.toJSON({ history: historyField }) as {
      selection: SerializableEditorSelection;
      history?: SerializableHistoryState;
    };
    if (!json.history) {
      return;
    }
    this._entries.delete(uri);
    this._entries.set(uri, {
      text: state.doc.toString(),
      selection: json.selection,
      history: json.history,
    });
    while (this._entries.size > this.limit) {
      const oldest = this._entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this._entries.delete(oldest);
    }
  }

  restore(uri: string, text: string): CachedEditorHistory | undefined {
    const entry = this._entries.get(uri);
    if (!entry) {
      return undefined;
    }
    if (entry.text !== normalize(text)) {
      this._entries.delete(uri);
      return undefined;
    }
    return { selection: entry.selection, history: entry.history };
  }

  record(
    uri: string,
    before: string,
    edits: readonly CachedTextEdit[],
    request?: number | string,
  ) {
    if (this.isOpen(uri) || (request != null && this._recorded.get(uri) === request)) {
      return undefined;
    }
    if (request != null) {
      this._recorded.set(uri, request);
    }
    const doc = normalize(before);
    const entry = this._entries.get(uri);
    const state =
      entry && entry.text === doc
        ? EditorState.fromJSON(
            { doc, selection: entry.selection, history: entry.history },
            { extensions: [history()] },
            { history: historyField },
          )
        : EditorState.create({ doc, extensions: [history()] });
    const changes = edits.map((edit) => ({
      from: convertFromPosition(state.doc, edit.range.start),
      to: convertFromPosition(state.doc, edit.range.end),
      insert: normalize(edit.newText),
    }));
    const transaction = state.update({
      changes,
      userEvent: "input.replace.all",
      annotations: isolateHistory.of("full"),
    });
    this.save(uri, transaction.state);
    return transaction.state.doc.toString();
  }

  clear() {
    this._entries.clear();
    this._recorded.clear();
  }
}

export const sharedEditorHistory = new EditorHistoryCache();
