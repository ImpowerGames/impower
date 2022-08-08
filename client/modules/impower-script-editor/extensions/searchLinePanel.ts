import {
  EditorSelection,
  EditorState,
  Extension,
  Facet,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { Command, EditorView, keymap } from "@codemirror/view";

export interface SearchLineState {
  search: string;
  open?: boolean;
}

export interface SearchLineQuery {
  search: string;
}

export interface SearchLineConfig {
  onOpen?: (view: EditorView) => void;
  onClose?: (view: EditorView) => void;
}

const searchLineConfigFacet: Facet<
  SearchLineConfig,
  Required<SearchLineConfig>
> = Facet.define({
  combine(configs) {
    return {
      onOpen: configs.find((c) => c.onOpen)?.onOpen,
      onClose: configs.find((c) => c.onClose)?.onClose,
    };
  },
});

export const toggleSearchLinePanel = StateEffect.define<boolean>();

export const setSearchLineQuery = StateEffect.define<SearchLineQuery>();

export const searchLineField = StateField.define<SearchLineState>({
  create() {
    return { search: "" };
  },
  update(value, tr) {
    tr.effects.forEach((e) => {
      if (e.is(setSearchLineQuery)) {
        value = { search: e.value.search, open: value.open };
      }
      if (e.is(toggleSearchLinePanel)) {
        value = {
          search: value.search,
          open: e.value,
        };
      }
    });
    return value;
  },
});

export const getSearchLineQuery = (state: EditorState): SearchLineQuery => {
  const query = state.field(searchLineField, false);
  return query || { search: "" };
};

export const openSearchLinePanel: Command = (view) => {
  const state = view.state.field(searchLineField, false);
  if (state && state.open) {
    return false;
  }
  const config = view.state.facet(searchLineConfigFacet);
  const query = { search: "" };
  config?.onOpen?.(view);
  view.dispatch({
    effects: [toggleSearchLinePanel.of(true), setSearchLineQuery.of(query)],
  });
  return true;
};

export const closeSearchLinePanel: Command = (view) => {
  const state = view.state.field(searchLineField, false);
  if (!state || !state.open) {
    return false;
  }
  const config = view.state.facet(searchLineConfigFacet);
  config?.onClose?.(view);
  view.dispatch({ effects: toggleSearchLinePanel.of(false) });
  return true;
};

export const searchLineCommand = (
  f: (view: EditorView, state: SearchLineState) => boolean
): Command => {
  return (view): boolean => {
    const state = view.state.field(searchLineField, false);
    return state ? f(view, state) : openSearchLinePanel(view);
  };
};

/// Command that shows a dialog asking the user for a line number, and
/// when a valid position is provided, moves the cursor to that line.
///
/// Supports line numbers, relative line offsets prefixed with `+` or
/// `-`, document percentages suffixed with `%`, and an optional
/// column position by adding `:` and a second number after the line
/// number.
export const searchLine = searchLineCommand((view, { search }) => {
  if (!search) {
    return false;
  }

  const match = /^([+-])?(\d+)?(:\d+)?(%)?$/.exec(search);
  if (!match) {
    return false;
  }

  const startLine = view.state.doc.lineAt(view.state.selection.main.head);
  const [, sign, ln, cl, percent] = match;
  const col = cl ? +cl.slice(1) : 0;
  let line = ln ? +ln : startLine.number;
  if (ln && percent) {
    let pc = line / 100;
    if (sign) {
      pc =
        pc * (sign === "-" ? -1 : 1) + startLine.number / view.state.doc.lines;
    }
    line = Math.round(view.state.doc.lines * pc);
  } else if (ln && sign) {
    line = line * (sign === "-" ? -1 : 1) + startLine.number;
  }
  const docLine = view.state.doc.line(
    Math.max(1, Math.min(view.state.doc.lines, line))
  );
  view.dispatch({
    selection: EditorSelection.cursor(
      docLine.from + Math.max(0, Math.min(col, docLine.length))
    ),
    scrollIntoView: true,
    userEvent: "select.goto",
  });

  return true;
});

export const searchLineKeymap = [
  { key: "Alt-g", run: openSearchLinePanel },
  { key: "Ctrl-g", run: openSearchLinePanel },
];

export const searchLinePanel = (config?: SearchLineConfig): Extension => {
  const searchExtensions = [searchLineField, keymap.of(searchLineKeymap)];
  return config
    ? [searchLineConfigFacet.of(config), ...searchExtensions]
    : searchExtensions;
};
