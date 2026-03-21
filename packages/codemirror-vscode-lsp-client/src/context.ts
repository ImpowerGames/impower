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
      const key = k.length === 1 ? k.toUpperCase() : k;
      if (key === "Mod") {
        return /Mac/.test(navigator.platform) ? "Cmd" : "Ctrl";
      }
      return key;
    })
    .join("+");
}

export const defaultContextMenuItems: ContextMenuItem[] = [
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
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}
