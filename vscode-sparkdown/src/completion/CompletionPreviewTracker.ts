import type { PreviewCompletionParams } from "@impower/spark-editor-protocol/src/protocols/textDocument/PreviewCompletionMessage";
import {
  CompletionCandidate,
  completionChanges,
  Placement,
  sameChanges,
  SelectedCompletion,
  TextChange,
} from "./completionEdits";

export class CompletionPreviewTracker {
  protected _open = false;
  get open() {
    return this._open;
  }

  protected _session = 0;

  protected _request = 0;

  protected _uri: string | null = null;

  protected _focused: {
    version: number;
    placement: Placement;
    selected: SelectedCompletion;
    changes: TextChange[] | null;
  } | null = null;

  protected _candidates: {
    uri: string;
    items: readonly CompletionCandidate[];
  } | null = null;

  constructor(
    protected readonly send: (params: PreviewCompletionParams) => void,
  ) {}

  offered(uri: string, items: readonly CompletionCandidate[]) {
    this._candidates = { uri, items };
    const focused = this._focused;
    if (this._open && this._uri === uri && focused) {
      const changes = this.changesFor(uri, focused.selected, focused.placement);
      if (!sameNullableChanges(changes, focused.changes)) {
        this.focus(uri, { ...focused, changes });
      }
    }
  }

  observed(
    uri: string,
    version: number,
    placement: Placement,
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
      sameSelection(focused.selected, selected) &&
      sameCursors(focused.placement, placement)
    ) {
      return;
    }
    this.focus(uri, {
      version,
      placement,
      selected,
      changes: this.changesFor(uri, selected, placement),
    });
  }

  changed(uri: string, version: number, changes: readonly TextChange[]) {
    if (!this._open || this._uri !== uri || changes.length === 0) {
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

  left(uri: string, version: number | null) {
    if (this._open && this._uri === uri) {
      this.close(uri, version);
    }
  }

  reset() {
    this._open = false;
    this._uri = null;
    this._focused = null;
  }

  resend() {
    const focused = this._focused;
    if (this._open && this._uri && focused) {
      this.focus(this._uri, focused);
    }
  }

  protected changesFor(
    uri: string,
    selected: SelectedCompletion,
    placement: Placement,
  ) {
    const candidates = this._candidates;
    if (!candidates || candidates.uri !== uri) {
      return null;
    }
    return completionChanges(selected, candidates.items, placement);
  }

  protected focus(uri: string, focused: NonNullable<typeof this._focused>) {
    this._focused = focused;
    this.send({
      textDocument: { uri, version: focused.version },
      session: this._session,
      request: ++this._request,
      state: "focus",
      contentChanges: focused.changes,
      selectedRange: {
        start: focused.placement.primary.active,
        end: focused.placement.primary.active,
      },
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

const sameCursors = (a: Placement, b: Placement) =>
  JSON.stringify([a.primary, a.others]) ===
  JSON.stringify([b.primary, b.others]);
