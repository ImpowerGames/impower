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

const foldExtension = codeFolding();

const getFolded = (
  state: EditorState,
  from: number,
  to: number
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

export const defaultFoldConfig = {
  placeholderText: "…",
};

export const foldWidget = Decoration.replace({
  widget: new (class extends WidgetType {
    toDOM(view: EditorView): HTMLElement {
      const { state } = view;
      const conf: {
        placeholderDOM?: (
          view: EditorView,
          callback: (e: Event) => void
        ) => HTMLElement;
        placeholderText: string;
      } = defaultFoldConfig;
      const onclick = (event: Event): void => {
        const line = view.lineBlockAt(
          view.posAtDOM(event.target as HTMLElement)
        );
        const folded = getFolded(view.state, line.from, line.to);
        if (folded) {
          view.dispatch({ effects: unfoldEffect.of(folded) });
        }
        event.preventDefault();
      };
      if (conf.placeholderDOM) {
        return conf.placeholderDOM(view, onclick);
      }
      const element = document.createElement("span");
      element.textContent = conf.placeholderText;
      element.setAttribute("aria-label", state.phrase("folded code"));
      element.title = state.phrase("unfold");
      element.className = "cm-foldPlaceholder";
      element.onclick = onclick;
      return element;
    }
  })(),
});

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
        return { from, to, value: foldWidget };
      }),
      true
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
