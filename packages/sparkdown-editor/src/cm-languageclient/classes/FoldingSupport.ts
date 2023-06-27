import { foldGutter, foldService } from "@codemirror/language";
import {
  EditorState,
  StateEffect,
  StateField,
  Transaction,
  TransactionSpec,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewUpdate,
} from "@codemirror/view";
import { FoldingRange } from "vscode-languageserver-protocol";
import FeatureSupport from "./FeatureSupport";

const foldableMark = Decoration.mark({ class: "cm-foldable" });

const clearFoldablesEffect = StateEffect.define<{}>();

const addFoldableEffect = StateEffect.define<{
  kind?: string;
  from: number;
  to: number;
}>({
  map: ({ kind, from, to }, change) => ({
    kind,
    from: change.mapPos(from),
    to: change.mapPos(to),
  }),
});

const setFoldables = (
  state: EditorState,
  ranges: FoldingRange[]
): TransactionSpec => {
  const effects: StateEffect<unknown>[] = [];
  effects.push(clearFoldablesEffect.of({}));
  effects.push(
    ...ranges.map((r) => {
      const effect = {
        kind: r.kind,
        from: state.doc.line(r.startLine + 1).from,
        to: state.doc.line(r.endLine + 1).to,
      };
      return addFoldableEffect.of(effect);
    })
  );
  return { effects };
};

const foldableDecorationsField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations: DecorationSet, tr: Transaction) {
    decorations = decorations.map(tr.changes);
    for (let e of tr.effects) {
      if (e.is(clearFoldablesEffect)) {
        decorations = Decoration.none;
      }
      if (e.is(addFoldableEffect)) {
        decorations = decorations.update({
          add: [foldableMark.range(e.value.from, e.value.to)],
        });
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const foldingRangesService = foldService.of((state, from, to) => {
  const ranges = state.field(foldableDecorationsField, false);
  if (!ranges) {
    return null;
  }
  let result = null;
  const line = state.doc.lineAt(from).number;
  ranges.between(0, state.doc.length - 1, (f, t) => {
    const startLine = state.doc.lineAt(f).number;
    if (line === startLine) {
      result = { from: to, to: t };
      return false;
    }
    return;
  });
  return result;
});

const foldingChanged = (update: ViewUpdate): boolean => {
  return update.transactions.some((t) =>
    t.effects.some((e) => e.is(clearFoldablesEffect) || e.is(addFoldableEffect))
  );
};

class FoldingSupport extends FeatureSupport<FoldingRange[]> {
  constructor() {
    super([
      foldableDecorationsField,
      foldingRangesService,
      foldGutter({
        openText: "v",
        closedText: ">",
        foldingChanged,
      }),
    ]);
  }
  override transaction(
    state: EditorState,
    ranges: FoldingRange[]
  ): TransactionSpec {
    return setFoldables(state, ranges);
  }
}

export const foldingSupport = new FoldingSupport();
