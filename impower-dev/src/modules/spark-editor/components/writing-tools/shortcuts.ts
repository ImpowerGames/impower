import type {
  EditorKeybinding,
  EditorShortcutGroup,
} from "@impower/spark-editor-protocol/src/protocols/editor/ReadEditorKeybindingsMessage";

export type ShortcutGroup = EditorShortcutGroup | "app";

export type ShortcutRow = { id: string; label: string; keys: string[] };

export type ShortcutSection = {
  group: ShortcutGroup;
  title: string;
  rows: ShortcutRow[];
};

const SECTIONS: readonly [ShortcutGroup, string][] = [
  ["editing", "Editing"],
  ["navigation", "Navigation"],
  ["find", "Find"],
  ["story", "Story"],
  ["app", "App"],
];

export const APP_SHORTCUTS: readonly ShortcutRow[] = [
  { id: "sync", label: "Sync with Google Drive", keys: ["Ctrl-s"] },
  {
    id: "undoFileChange",
    label: "Undo a change to your files, outside the script",
    keys: ["Mod-z"],
  },
  {
    id: "redoFileChange",
    label: "Redo a change to your files, outside the script",
    keys: ["Mod-y", "Mod-Shift-z"],
  },
];

const MODIFIER_ORDER = ["Mod", "Ctrl", "Cmd", "Meta", "Shift", "Alt"];

const KEY_NAMES: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Escape: "Esc",
  " ": "Space",
  PageUp: "Page Up",
  PageDown: "Page Down",
};

export function comboLabel(combo: string, mac: boolean): string {
  const parts = combo.split(/-(?!$)/);
  const key = parts.pop() ?? "";
  if (/^[A-Z]$/.test(key) && !parts.includes("Shift")) parts.push("Shift");
  const modifiers = [...parts].sort(
    (a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b),
  );
  const named = modifiers.map((modifier) => {
    if (modifier === "Mod") return mac ? "Cmd" : "Ctrl";
    if (modifier === "Meta" || modifier === "Cmd") return "Cmd";
    if (modifier === "Alt") return mac ? "Option" : "Alt";
    return modifier;
  });
  const keyName = KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key);
  return [...named, keyName].join("+");
}

export function shortcutSections(
  commands: readonly EditorKeybinding[],
): ShortcutSection[] {
  return SECTIONS.map(([group, title]) => ({
    group,
    title,
    rows:
      group === "app"
        ? [...APP_SHORTCUTS]
        : commands
            .filter((command) => command.group === group)
            .map(({ id, label, keys }) => ({ id, label, keys })),
  }));
}
