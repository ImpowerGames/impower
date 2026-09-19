import type { PreviewCompletionParams } from "@impower/spark-editor-protocol/src/protocols/textDocument/PreviewCompletionMessage";
import {
  CompletionCandidate,
  completionChanges,
  Position,
  sameChanges,
  SelectedCompletion,
  TextChange,
} from "./completionEdits";

/**
 * Follows VS Code's suggestion list in one window and turns what it reports
 * into `textDocument/previewCompletion` notifications: one for every newly
 * highlighted suggestion (the first, a change, a return to an earlier one, and
 * the same one after the document changed under it) and one when the list
 * closes.
 *
 * VS Code has no public event for the suggestion list. It does tell inline
 * completion providers which suggestion is highlighted while the inline
 * completion model is active, and asks them again with nothing highlighted
 * once the list closes. The extension activates that model whenever it
 * answers a request for suggestions (see `activateCompletionPreview`), and
 * feeds each answer, each highlight report, each document change and each
 * change of editor here.
 *
 * Nothing here imports `vscode`, so the tests drive it with plain values.
 */
export class CompletionPreviewTracker {
  /** Whether a list is open, as far as the reports so far say. */
  protected _open = false;
  get open() {
    return this._open;
  }

  /** Increases each time a list opens. */
  protected _session = 0;

  /** Increases with every notification, across sessions. */
  protected _request = 0;

  /** The document the open list is in. */
  protected _uri: string | null = null;

  /** The last highlight reported: its document version, the cursor and the
   *  edit. */
  protected _focused: {
    version: number;
    cursor: Position;
    selected: SelectedCompletion;
    changes: TextChange[] | null;
  } | null = null;

  /** The language server's items for the latest request, by document. */
  protected _candidates: {
    uri: string;
    items: readonly CompletionCandidate[];
  } | null = null;

  constructor(
    protected readonly send: (params: PreviewCompletionParams) => void,
  ) {}

  /** The language server answered a request for suggestions in `uri`. */
  offered(uri: string, items: readonly CompletionCandidate[]) {
    this._candidates = { uri, items };
    const focused = this._focused;
    if (this._open && this._uri === uri && focused) {
      // A fresh answer while the list is open replaces the items the
      // highlight was matched against; report it again if its edit changed.
      const changes = this.changesFor(uri, focused.selected);
      if (!sameNullableChanges(changes, focused.changes)) {
        this.focus(uri, { ...focused, changes });
      }
    }
  }

  /**
   * VS Code asked the inline provider for `uri` at `version` with the cursor
   * at `cursor`, reporting `selected` as highlighted in the suggestion list,
   * or nothing.
   */
  observed(
    uri: string,
    version: number,
    cursor: Position,
    selected: SelectedCompletion | undefined,
  ) {
    if (!selected) {
      if (this._open && this._uri === uri) {
        this.close(uri, version);
      }
      return;
    }
    if (this._open && this._uri !== uri) {
      this.close(this._uri!, null);
    }
    if (!this._open) {
      this._open = true;
      this._uri = uri;
      this._session += 1;
      this._focused = null;
    }
    const focused = this._focused;
    if (
      focused &&
      focused.version === version &&
      sameSelection(focused.selected, selected)
    ) {
      // Asked again about the highlight already reported.
      return;
    }
    this.focus(uri, {
      version,
      cursor,
      selected,
      changes: this.changesFor(uri, selected),
    });
  }

  /**
   * `uri` changed to `version` by `changes`. When a list is open there and the
   * change is exactly the edit of the highlighted suggestion, the suggestion
   * was accepted and the list closed with it. Any other change is an edit made
   * while browsing: the list stays open, and the next report of the highlight
   * is a new one, since its edit is now against another version.
   */
  changed(uri: string, version: number, changes: readonly TextChange[]) {
    if (!this._open || this._uri !== uri || changes.length === 0) {
      // No change to the text: VS Code reports saves and changes of the
      // unsaved marker this way.
      return;
    }
    const focused = this._focused;
    if (
      focused?.changes &&
      version === focused.version + 1 &&
      sameChanges(changes, focused.changes)
    ) {
      this.close(uri, version, {
        version: focused.version,
        contentChanges: focused.changes,
      });
      return;
    }
    this._focused = null;
  }

  /**
   * The author left the editor holding the open list: another editor became
   * active, the document closed, or the cursor was moved with the mouse. The
   * list does not survive any of them.
   */
  left(uri: string, version: number | null) {
    if (this._open && this._uri === uri) {
      this.close(uri, version);
    }
  }

  /** Forget any open list without reporting it, as when the preview it
   *  would be reported to is gone. */
  reset() {
    this._open = false;
    this._uri = null;
    this._focused = null;
  }

  protected changesFor(uri: string, selected: SelectedCompletion) {
    const candidates = this._candidates;
    if (!candidates || candidates.uri !== uri) {
      return null;
    }
    return completionChanges(selected, candidates.items);
  }

  protected focus(uri: string, focused: NonNullable<typeof this._focused>) {
    this._focused = focused;
    this.send({
      textDocument: { uri, version: focused.version },
      session: this._session,
      request: ++this._request,
      state: "focus",
      contentChanges: focused.changes,
      selectedRange: { start: focused.cursor, end: focused.cursor },
    });
  }

  protected close(
    uri: string,
    version: number | null,
    accepted?: PreviewCompletionParams["accepted"],
  ) {
    const session = this._session;
    const lastVersion = this._focused?.version;
    this._open = false;
    this._uri = null;
    this._focused = null;
    this.send({
      textDocument: { uri, version: version ?? lastVersion ?? 0 },
      session,
      request: ++this._request,
      state: "close",
      ...(accepted ? { accepted } : {}),
    });
  }
}

const sameSelection = (a: SelectedCompletion, b: SelectedCompletion) =>
  a.text === b.text &&
  a.range.start.line === b.range.start.line &&
  a.range.start.character === b.range.start.character &&
  a.range.end.line === b.range.end.line &&
  a.range.end.character === b.range.end.character;

const sameNullableChanges = (a: TextChange[] | null, b: TextChange[] | null) =>
  a && b ? sameChanges(a, b) : a === b;
