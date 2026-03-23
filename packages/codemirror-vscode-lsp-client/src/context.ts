import { redo, selectAll, undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { jumpToDefinition, jumpToDefinitionKeymap } from "./definition";
import { formatDocument, formatKeymap } from "./formatting";
import { findReferences, findReferencesKeymap } from "./references";
import { renameKeymap, renameSymbol } from "./rename";

export type ContextMenuItem =
  | {
      label: string;
      shortcut?: string;
      command: (view: EditorView) => void;
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

export async function cut(view: EditorView) {
  const ranges = view.state.selection.ranges.filter((r) => !r.empty);
  const texts = ranges.map((r) => view.state.sliceDoc(r.from, r.to));
  if (texts.length > 0) {
    try {
      await navigator.clipboard.writeText(texts.join("\n"));
      // Dispatch a deletion transaction to remove the cut text
      const changes = ranges.map((r) => ({
        from: r.from,
        to: r.to,
        insert: "",
      }));
      view.dispatch({ changes });
    } catch (err) {
      console.error("Clipboard access denied.");
    }
  }
}

export async function copy(view: EditorView) {
  // Get text from all active cursor selections (multicursor support)
  const texts = view.state.selection.ranges
    .filter((r) => !r.empty)
    .map((r) => view.state.sliceDoc(r.from, r.to));

  if (texts.length > 0) {
    try {
      // Modern clipboard API writes
      await navigator.clipboard.writeText(texts.join("\n"));
    } catch (err) {
      console.error("Clipboard access denied.");
    }
  }
}

export async function paste(view: EditorView) {
  try {
    // Browsers often restrict readText() if it wasn't triggered by a keyboard interaction.
    // We wrap it in a try-catch to display an elegant error if blocked.
    const text = await navigator.clipboard.readText();

    // CodeMirror's native replaceSelection gracefully inserts text at all current cursors
    view.dispatch(view.state.replaceSelection(text));
  } catch (err) {
    console.error("Browser blocked automated paste.");
  }
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
    shortcut: getShortcutLabel("Mod-Shift-z"),
  },
];

export const textContextMenuItems: ContextMenuItem[] = [
  {
    label: "Cut",
    command: cut,
    shortcut: getShortcutLabel("Mod-x"),
  },
  {
    label: "Copy",
    command: copy,
    shortcut: getShortcutLabel("Mod-c"),
  },
  {
    label: "Paste",
    command: paste,
    shortcut: getShortcutLabel("Mod-v"),
  },
  {
    label: "Select All",
    command: selectAll,
    shortcut: getShortcutLabel("Mod-a"),
  },
];

export const lspContextMenuItems: ContextMenuItem[] = [
  {
    label: "Rename Symbol",
    command: renameSymbol,
    shortcut: getShortcutLabel(renameKeymap[0]?.key),
  },
  {
    label: "Format Document",
    command: formatDocument,
    shortcut: getShortcutLabel(formatKeymap[0]?.key),
  },
  { type: "separator" },
  {
    label: "Find References",
    command: findReferences,
    shortcut: getShortcutLabel(findReferencesKeymap[0]?.key),
  },
  {
    label: "Go to Definition",
    command: jumpToDefinition,
    shortcut: getShortcutLabel(jumpToDefinitionKeymap[0]?.key),
  },
];

export const defaultContextMenuItems: ContextMenuItem[] = [
  ...historyContextMenuItems,
  { type: "separator" },
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
