import {
  codeFolding,
  foldGutter,
  foldKeymap,
  foldService,
} from "@codemirror/language";
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
  keymap,
} from "@codemirror/view";
import { FoldingRange } from "../../../../../spark-editor-protocol/src/types";
import { FeatureSupport } from "../../types/FeatureSupport";

const foldingTheme = EditorView.baseTheme({
  "&light": {
    "--fold-open-color": "#000000",
    "--fold-closed-color": "#000000",
  },

  "&dark": {
    "--fold-open-color": "#cccccc",
    "--fold-closed-color": "#cccccc",
  },
  "& .cm-foldGutter": {
    width: "16px",
  },
  "& .cm-foldGutter .cm-gutterElement .cm-fold-open": {
    color: "var(--fold-open-color)",
  },
  "& .cm-foldGutter .cm-gutterElement .cm-fold-closed": {
    color: "var(--fold-closed-color)",
  },
});

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
  ranges.between(from, to, (f, t) => {
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

export default class FoldingSupport implements FeatureSupport<FoldingRange[]> {
  load() {
    return [
      foldingTheme,
      foldableDecorationsField,
      foldingRangesService,
      codeFolding({ placeholderText: "⋯" }),
      foldGutter({
        markerDOM: (open: boolean) => {
          const dom = document.createElement("span");
          dom.textContent = "⌵";
          dom.style.fontSize = "0.9em";
          dom.style.position = "relative";
          dom.style.top = "-1px";
          dom.style.textAlign = "center";
          if (open) {
            dom.className = "cm-fold-open";
            dom.style.opacity = "0.5";
          } else {
            dom.className = "cm-fold-closed";
            dom.style.transform = "translateX(-2px) rotate(-90deg)";
            dom.style.opacity = "1";
          }
          return dom;
        },
        foldingChanged,
      }),
      keymap.of([...foldKeymap]),
    ];
  }

  transaction(state: EditorState, ranges: FoldingRange[]): TransactionSpec {
    return setFoldables(state, ranges);
  }
}
