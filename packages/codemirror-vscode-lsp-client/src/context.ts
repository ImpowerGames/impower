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
      /** The touch menu leaves this item out when nothing is selected. */
      needsSelection?: boolean;
      /** The touch menu reopens for the new selection after this item runs. */
      keepsMenuOpen?: boolean;
      /** While this returns true, the menu shows the item greyed out and
       *  clicking it does nothing. */
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

/**
 * What the menu's Paste inserts: the text last copied or cut in any editor on
 * the page, one piece per copied selection range. Menu Paste reads only this,
 * because reading the system clipboard makes the browser ask the user for
 * access. It is held in memory and never stored.
 */
let menuClipboard: { pieces: string[]; linewise: boolean } | null = null;

/**
 * Passes `pieces`, joined by line breaks, through one of the editor's
 * clipboard filters, as CodeMirror does for keyboard copy and paste. Text a
 * filter changes is split into its lines, which become the pieces: CodeMirror
 * gives each line of a filtered text to its own range when the counts match.
 */
function filterPieces(
  state: EditorState,
  filters: readonly ((text: string, state: EditorState) => string)[],
  pieces: string[],
) {
  const joined = pieces.join(state.lineBreak);
  const text = filters.reduce((t, filter) => filter(t, state), joined);
  return text === joined ? pieces : state.toText(text).toJSON();
}

/**
 * Records a copy for menu Paste and returns the text CodeMirror puts on the
 * system clipboard for it, after the editor's clipboard output filters. A
 * copy of bare carets is `linewise`: each piece is a whole line, and pasting
 * it at carets inserts it above their lines as CodeMirror's keyboard paste
 * does.
 */
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

/** The selected text of each non-empty range, as the menu copies it. */
function selectedPieces(view: EditorView) {
  return view.state.selection.ranges
    .filter((r) => !r.empty)
    .map((r) => view.state.sliceDoc(r.from, r.to));
}

/** Records the selection for menu Paste and also puts it on the system
 *  clipboard so other apps can paste it. A write the browser refuses is
 *  ignored: the menu's buffer still holds the text. */
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
  // Android's selection toolbar leaves a caret, with its handle, at the end
  // of what it copied.
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

/**
 * Inserts the menu's buffer. When there is one piece per selection range,
 * each range gets its own piece; otherwise every range gets all the pieces
 * joined by line breaks, as CodeMirror's native multi-cursor paste does. The
 * text goes through the editor's clipboard input filters first, as a
 * keyboard paste does.
 */
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
  // CodeMirror pastes a line-wise copy as whole lines only while the text is
  // still the copied text, so an input filter that changes it ends that.
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
