import { isolateHistory } from "@codemirror/commands";
import {
  ChangeSet,
  type EditorState,
  StateEffect,
  StateField,
} from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  convertFromPosition,
  LSPPlugin,
} from "@impower/codemirror-vscode-lsp-client/src";
import { stillExpected } from "@impower/sparkdown/src/compiler/utils/closeMatch";
import type { EditorFix } from "@impower/spark-editor-protocol/src/protocols/editor/ApplyEditorEditMessage";

interface InsertedText {
  from: number;
  to: number;
  text: string;
}

interface AppliedFix {
  id: number | string;
  inverse: ChangeSet;
  inserted: InsertedText[];
}

const FIX_EVENT = "input.fix";

const recordFix = StateEffect.define<AppliedFix | null>();

const appliedFixField = StateField.define<AppliedFix | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(recordFix)) {
        return effect.value;
      }
    }
    if (!value || !tr.docChanged) {
      return value;
    }
    return {
      id: value.id,
      inverse: value.inverse.map(tr.changes),
      inserted: value.inserted.map(({ from, to, text }) => ({
        from: tr.changes.mapPos(from, -1),
        to: tr.changes.mapPos(to, 1),
        text,
      })),
    };
  },
});

export const editorFixes = () => appliedFixField;

const currentChanges = (view: EditorView, fix: EditorFix) => {
  const plugin = LSPPlugin.get(view);
  if (
    plugin &&
    (fix.version == null ||
      plugin.client.workspace.getFile(fix.uri)?.version !== fix.version)
  ) {
    return null;
  }
  return {
    base: plugin?.syncedDoc ?? view.state.doc,
    toNow: (offset: number, assoc = -1) =>
      plugin ? plugin.unsyncedChanges.mapPos(offset, assoc) : offset,
  };
};

const insertedTexts = (changes: ChangeSet): InsertedText[] => {
  const inserted: InsertedText[] = [];
  changes.iterChanges((_fromA, _toA, fromB, toB, text) => {
    inserted.push({ from: fromB, to: toB, text: text.toString() });
  });
  return inserted;
};

const dispatchFix = (
  view: EditorView,
  changes: ChangeSet,
  record: AppliedFix | null,
) => {
  view.dispatch({
    changes,
    userEvent: FIX_EVENT,
    annotations: isolateHistory.of("full"),
    effects: recordFix.of(record),
  });
};

export const applyEditorFix = (
  view: EditorView,
  fix: EditorFix,
  id: number | string,
): boolean => {
  const current = currentChanges(view, fix);
  if (!current) {
    return false;
  }
  const { base, toNow } = current;
  const length = base.length;
  const inBase = (offset: number) => offset >= 0 && offset <= length;
  if (
    fix.range.start.line >= base.lines ||
    fix.range.end.line >= base.lines ||
    !fix.changes.every((c) => inBase(c.from) && inBase(c.to) && c.from <= c.to)
  ) {
    return false;
  }
  if (fix.expect !== undefined) {
    const from = toNow(convertFromPosition(base, fix.range.start), 1);
    const to = toNow(convertFromPosition(base, fix.range.end), -1);
    if (
      !stillExpected(
        view.state.doc.toString(),
        from,
        Math.max(from, to),
        fix.expect,
        fix.kind,
      )
    ) {
      return false;
    }
  }
  const changes = ChangeSet.of(
    fix.changes.map((c) => {
      const from = toNow(c.from, 1);
      return { from, to: Math.max(from, toNow(c.to, -1)), insert: c.insert };
    }),
    view.state.doc.length,
  );
  const inverse = changes.invert(view.state.doc);
  dispatchFix(view, changes, {
    id,
    inverse,
    inserted: insertedTexts(changes),
  });
  return true;
};

const stillInserted = (state: EditorState, fix: AppliedFix) =>
  fix.inserted.every(
    ({ from, to, text }) =>
      from <= to && to <= state.doc.length && state.sliceDoc(from, to) === text,
  );

export const undoEditorFix = (view: EditorView, id: number | string) => {
  const fix = view.state.field(appliedFixField, false);
  if (!fix || fix.id !== id || !stillInserted(view.state, fix)) {
    return false;
  }
  dispatchFix(view, fix.inverse, null);
  return true;
};
