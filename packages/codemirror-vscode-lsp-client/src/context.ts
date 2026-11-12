import { redo, selectAll, undo } from "@codemirror/commands";
import { EditorSelection, EditorState, Extension, Facet } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { changeColor, documentColorAt } from "./color";
import { jumpToDefinition } from "./definition";
import { coarsePointer } from "./pointer";
import { findReferences } from "./tools";
import { renameSymbol } from "./rename";
import { shortcutCommandFor } from "./shortcuts";
import { EDITOR_SHORTCUT_ROWS, type EditorShortcutId } from "./shortcutTable";
import { wordAt } from "../../codemirror-vscode-language/src/utils/wordAt";

export type ContextMenuItem =
  | {
      label?: string;
      icon?: string;
      shortcut?: EditorShortcutId;
      command: (view: EditorView) => void;
      when?: (state: EditorState, pos: number) => boolean;
      needsSelection?: boolean;
      keepsMenuOpen?: boolean;
      keepsSelection?: boolean;
      disabled?: () => boolean;
    }
  | { type: "separator" };

let menuClipboard: { pieces: string[]; linewise: boolean } | null = null;

function filterPieces(
  state: EditorState,
  filters: readonly ((text: string, state: EditorState) => string)[],
  pieces: string[],
) {
  const joined = pieces.join(state.lineBreak);
  const text = filters.reduce((t, filter) => filter(t, state), joined);
  return text === joined ? pieces : state.toText(text).toJSON();
}

export function recordMenuClipboard(
  state: EditorState,
  pieces: string[],
  linewise = false,
) {
  const copied = filterPieces(
    state,
    state.facet(EditorView.clipboardOutputFilter),
    pieces,
  );
  menuClipboard = { pieces: copied, linewise };
  return copied.join(state.lineBreak);
}

function selectedPieces(view: EditorView) {
  return view.state.selection.ranges
    .filter((r) => !r.empty)
    .map((r) => view.state.sliceDoc(r.from, r.to));
}

function copySelection(view: EditorView, pieces: string[]) {
  const text = recordMenuClipboard(view.state, pieces);
  navigator.clipboard?.writeText(text).catch(() => {});
}

export function cut(view: EditorView) {
  const pieces = selectedPieces(view);
  if (pieces.length === 0) {
    return;
  }
  copySelection(view, pieces);
  view.dispatch({
    changes: view.state.selection.ranges.filter((r) => !r.empty),
    userEvent: "delete.cut",
  });
}

export function copy(view: EditorView) {
  const selection = view.state.selection;
  const pieces = selectedPieces(view);
  if (pieces.length === 0) {
    return;
  }
  copySelection(view, pieces);
  if (view.state.facet(coarsePointer)) {
    view.dispatch({
      selection: EditorSelection.create(
        selection.ranges.map((r) => EditorSelection.cursor(r.to)),
        selection.mainIndex,
      ),
      userEvent: "select.touch",
    });
  }
}

const pasteRefusedHandler = Facet.define<
  (view: EditorView) => void,
  ((view: EditorView) => void) | null
>({
  combine: (values) => values.at(-1) ?? null,
});

export function onPasteRefused(handler: (view: EditorView) => void): Extension {
  return pasteRefusedHandler.of(handler);
}

const systemClipboard = () =>
  typeof navigator.clipboard?.readText === "function"
    ? navigator.clipboard
    : null;

export function pasteAvailable() {
  return systemClipboard() != null || menuClipboard !== null;
}

function bufferText(state: EditorState) {
  return menuClipboard ? menuClipboard.pieces.join(state.lineBreak) : null;
}

export function paste(view: EditorView) {
  const clipboard = systemClipboard();
  if (!clipboard) {
    pasteBuffer(view);
    return;
  }
  clipboard.readText().then(
    (text) => {
      const buffered = bufferText(view.state);
      if (
        buffered !== null &&
        (text === buffered || text === buffered + view.state.lineBreak)
      ) {
        pasteBuffer(view);
      } else if (text) {
        pastePieces(view, view.state.toText(text).toJSON(), false, true);
      }
    },
    () => {
      view.state.facet(pasteRefusedHandler)?.(view);
      pasteBuffer(view);
    },
  );
}

function pasteBuffer(view: EditorView) {
  if (!menuClipboard) {
    return;
  }
  pastePieces(view, menuClipboard.pieces, menuClipboard.linewise, false);
}

function pastePieces(
  view: EditorView,
  copied: readonly string[],
  copiedLinewise: boolean,
  fromSystem: boolean,
) {
  const { state } = view;
  const pieces = filterPieces(
    state,
    state.facet(EditorView.clipboardInputFilter),
    [...copied],
  );
  const linewise = copiedLinewise && pieces.length === copied.length && pieces.every((p, i) => p === copied[i]);
  const joined = pieces.join(state.lineBreak);
  const perRange =
    pieces.length === state.selection.ranges.length &&
    (!fromSystem || pieces.length > 1);
  let i = 0;
  const pieceFor = () => (perRange ? pieces[i++]! : joined);
  let spec;
  if (linewise && state.selection.ranges.every((r) => r.empty)) {
    let lastLine = -1;
    spec = state.changeByRange((range) => {
      const line = state.doc.lineAt(range.from);
      if (line.from === lastLine) {
        return { range };
      }
      lastLine = line.from;
      const insert = pieceFor() + state.lineBreak;
      return {
        changes: { from: line.from, insert },
        range: EditorSelection.cursor(range.from + insert.length),
      };
    });
  } else if (perRange) {
    spec = state.changeByRange((range) => {
      const insert = pieceFor();
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.cursor(range.from + insert.length),
      };
    });
  } else {
    spec = state.replaceSelection(joined);
  }
  view.dispatch(spec, { userEvent: "input.paste", scrollIntoView: true });
}

export const historyContextMenuItems: ContextMenuItem[] = [
  {
    label: "Undo",
    command: undo,
    shortcut: "undo",
  },
  {
    label: "Redo",
    command: redo,
    shortcut: "redo",
  },
];

export const textContextMenuItems: ContextMenuItem[] = [
  {
    label: "Cut",
    command: cut,
    shortcut: "cut",
    needsSelection: true,
  },
  {
    label: "Copy",
    command: copy,
    shortcut: "copy",
    needsSelection: true,
  },
  {
    label: "Paste",
    command: paste,
    shortcut: "paste",
    disabled: () => !pasteAvailable(),
  },
  {
    label: "Select all",
    command: selectAll,
    shortcut: "selectAll",
    keepsMenuOpen: true,
  },
];

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const onName = (state: EditorState, pos: number) => {
  const word = wordAt(state, pos);
  if (!word) {
    return false;
  }
  const hash = state.sliceDoc(word.from - 1, word.from) === "#" ? word.from - 1 : word.from;
  return !HEX_COLOR.test(state.sliceDoc(hash, word.to));
};

const shortcutContextMenuItem = (
  id: EditorShortcutId,
  when: (state: EditorState, pos: number) => boolean,
): ContextMenuItem => ({
  label: EDITOR_SHORTCUT_ROWS.find((row) => row.id === id)?.name,
  shortcut: id,
  command: (view) => shortcutCommandFor(view.state, id)?.(view),
  when,
  keepsSelection: true,
});

export const lspContextMenuItems: ContextMenuItem[] = [
  {
    label: "Rename",
    command: renameSymbol,
    shortcut: "rename",
    when: onName,
  },
  shortcutContextMenuItem("format", (state) => !state.readOnly),
  { type: "separator" },
  {
    label: "Find references",
    command: findReferences,
    shortcut: "references",
    when: onName,
  },
  {
    label: "Go to definition",
    command: jumpToDefinition,
    shortcut: "definition",
    when: onName,
  },
];

export const colorContextMenuItems: ContextMenuItem[] = [
  {
    label: "Change color",
    command: changeColor,
    when: (state, pos) => documentColorAt(state, pos) != null,
  },
];

export const defaultContextMenuItems: ContextMenuItem[] = [
  ...textContextMenuItems,
  { type: "separator" },
  ...lspContextMenuItems,
  { type: "separator" },
  ...colorContextMenuItems,
];
