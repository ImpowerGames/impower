import {
  codeFolding,
  foldable,
  foldedRanges,
  unfoldEffect,
} from "@codemirror/language";
import { EditorState, StateField } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { foldingPlaceholderDOM } from "@impower/codemirror-vscode-lsp-client/src";

const foldExtension = codeFolding();

const getFolded = (
  state: EditorState,
  from: number,
  to: number,
): { from: number; to: number } | null => {
  let found: { from: number; to: number } | null = null;
  foldedRanges(state)?.between(from, to, (from, to) => {
    if (!found || found.from > from) {
      found = { from, to };
    }
  });
  return found;
};

export const isAllFolded = (state: EditorState): boolean => {
  for (let i = 1; i < state.doc.lines; i += 1) {
    const line = state.doc.line(i);
    const range = foldable(state, line.from, line.to);
    if (range) {
      const from = range?.from;
      const to = range?.to;
      if (!getFolded(state, from, to)) {
        return false;
      }
    }
  }
  return true;
};

class RestoredFoldWidget extends WidgetType {
  toDOM(view: EditorView): HTMLElement {
    let hiddenLines = 0;
    view.state.field(foldedField).between(0, view.state.doc.length, (from, to, value) => {
      if (value.spec.widget === this) {
        hiddenLines =
          view.state.doc.lineAt(to).number - view.state.doc.lineAt(from).number;
        return false;
      }
      return undefined;
    });
    const onclick = (event: Event): void => {
      const line = view.lineBlockAt(
        view.posAtDOM(event.target as HTMLElement),
      );
      const folded = getFolded(view.state, line.from, line.to);
      if (folded) {
        view.dispatch({ effects: unfoldEffect.of(folded) });
      }
      event.preventDefault();
    };
    return foldingPlaceholderDOM(view, onclick, hiddenLines);
  }
}

const toJSON = (value: DecorationSet): { from: number; to: number }[] => {
  const folded: { from: number; to: number }[] = [];
  const iter = value.iter(0);
  while (iter?.value) {
    const from = iter?.from;
    const to = iter?.to;
    folded.push({ from, to });
    iter.next();
  }
  return folded;
};

const fromJSON = (json: { from: number; to: number }[]): DecorationSet => {
  if (json) {
    return Decoration.set(
      json.map(({ from, to }) => {
        return Decoration.replace({ widget: new RestoredFoldWidget() }).range(from, to);
      }),
      true,
    );
  }
  console.error("Invalid JSON:", json);
  return Decoration.none;
};

export const foldedField: StateField<DecorationSet> & {
  spec: {
    toJSON: (value: DecorationSet) => { from: number; to: number }[];
    fromJSON: (value: { from: number; to: number }[]) => DecorationSet;
  };
} = Array.isArray(foldExtension) ? foldExtension[0] : foldExtension;
foldedField.spec.toJSON = toJSON;
foldedField.spec.fromJSON = fromJSON;
