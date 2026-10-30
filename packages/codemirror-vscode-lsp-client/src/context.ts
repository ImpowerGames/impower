import { redo, selectAll, undo } from "@codemirror/commands";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { jumpToDefinition, jumpToDefinitionKeymap } from "./definition";
import { formatDocument, formatKeymap } from "./formatting";
import { findReferences, findReferencesKeymap } from "./references";
import { renameKeymap, renameSymbol } from "./rename";

export type ContextMenuItem =
  | {
      label?: string;
      icon?: string;
      shortcut?: string;
      command: (view: EditorView) => void;
      needsSelection?: boolean;
      keepsMenuOpen?: boolean;
      disabled?: () => boolean;
    }
  | { type: "separator" };

export function getShortcutLabel(key: string) {
  return key
    .split("-")
    .map((k) => {
      if (k === "Mod") {
        return /Mac/.test(navigator.platform) ? "Cmd" : "Ctrl";
      }
      return k.length === 1 ? k.toUpperCase() : k;
    })
    .join("+");
}

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
  if (isMobile()) {
    view.dispatch({
      selection: EditorSelection.create(
        selection.ranges.map((r) => EditorSelection.cursor(r.to)),
        selection.mainIndex,
      ),
      userEvent: "select.touch",
    });
  }
}

export function paste(view: EditorView) {
  if (!menuClipboard) {
    return;
  }
  const { state } = view;
  const pieces = filterPieces(
    state,
    state.facet(EditorView.clipboardInputFilter),
    menuClipboard.pieces,
  );
  const linewise = menuClipboard.linewise && pieces === menuClipboard.pieces;
  const joined = pieces.join(state.lineBreak);
  const perRange = pieces.length === state.selection.ranges.length;
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
    shortcut: getShortcutLabel("Mod-z"),
  },
  {
    label: "Redo",
    command: redo,
    shortcut: getShortcutLabel("Mod-y"),
  },
];

export const textContextMenuItems: ContextMenuItem[] = [
  {
    label: "Cut",
    command: cut,
    shortcut: getShortcutLabel("Mod-x"),
    needsSelection: true,
  },
  {
    label: "Copy",
    command: copy,
    shortcut: getShortcutLabel("Mod-c"),
    needsSelection: true,
  },
  {
    label: "Paste",
    command: paste,
    shortcut: getShortcutLabel("Mod-v"),
    disabled: () => menuClipboard === null,
  },
  {
    label: "Select All",
    command: selectAll,
    shortcut: getShortcutLabel("Mod-a"),
    keepsMenuOpen: true,
  },
];

export const lspContextMenuItems: ContextMenuItem[] = [
  {
    label: "Rename Symbol",
    command: renameSymbol,
    shortcut: getShortcutLabel(renameKeymap[0]?.key!),
  },
  {
    label: "Format Document",
    command: formatDocument,
    shortcut: getShortcutLabel(formatKeymap[0]?.key!),
  },
  { type: "separator" },
  {
    label: "Find References",
    command: findReferences,
    shortcut: getShortcutLabel(findReferencesKeymap[0]?.key!),
  },
  {
    label: "Go to Definition",
    command: jumpToDefinition,
    shortcut: getShortcutLabel(jumpToDefinitionKeymap[0]?.key!),
  },
];

export const defaultContextMenuItems: ContextMenuItem[] = [
  ...textContextMenuItems,
  { type: "separator" },
  ...lspContextMenuItems,
];

export function isMobile() {
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    ) ||
    (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
    navigator.maxTouchPoints > 0
  );
}

export function isIOS() {
  return isMobile() && /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isAndroid() {
  return isMobile() && !isIOS();
}
