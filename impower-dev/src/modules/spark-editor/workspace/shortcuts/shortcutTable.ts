import { shortcutPlatform } from "@impower/codemirror-vscode-lsp-client/src/shortcutCombo";
import { usualCombo } from "@impower/codemirror-vscode-lsp-client/src/shortcutRules";
import {
  EDITOR_SHORTCUT_ROWS,
  SHORTCUT_GROUPS,
  type EditorShortcutRowId,
  type ShortcutRow,
} from "@impower/codemirror-vscode-lsp-client/src/shortcutTable";

export const APP_SHORTCUT_ROWS = [
  {
    id: "playFromHere",
    group: "story",
    name: "Play from here",
    detail: "Play the story from the caret, or stop it.",
    keys: "",
  },
  {
    id: "replayBeat",
    group: "story",
    name: "Replay beat",
    detail: "Play the beat the stopped preview shows, once, and end on its still.",
    keys: "Mod+Alt+Enter",
  },
  {
    id: "stepOver",
    group: "story",
    name: "Step over",
    detail: "While paused, run to the next statement, passing over a call.",
    keys: "F10",
  },
  {
    id: "stepInto",
    group: "story",
    name: "Step into",
    detail: "While paused, run to the next statement, entering a call.",
    keys: { key: "F11", mac: "Ctrl+F11" },
    aliases: ["Ctrl+F11"],
  },
  {
    id: "stepOut",
    group: "story",
    name: "Step out",
    detail: "While paused, run until the current call returns.",
    keys: { key: "Shift+F11", mac: "Ctrl+Shift+F11" },
    aliases: ["Ctrl+Shift+F11"],
  },
  {
    id: "previousChoice",
    group: "story",
    name: "Previous choice in the preview",
    detail: "While playing, roll the story back to the last choice it played.",
    keys: "Shift+PageUp",
  },
  {
    id: "nextChoice",
    group: "story",
    name: "Next choice in the preview",
    detail: "While playing, roll the story on to the next choice it played.",
    keys: "Shift+PageDown",
  },
] as const satisfies readonly ShortcutRow[];

export type AppShortcutId = (typeof APP_SHORTCUT_ROWS)[number]["id"];

export type ShortcutId = EditorShortcutRowId | AppShortcutId;

export const SHORTCUT_ROWS: readonly ShortcutRow[] = [
  ...EDITOR_SHORTCUT_ROWS,
  ...APP_SHORTCUT_ROWS,
];

export const SHORTCUT_SECTIONS = SHORTCUT_GROUPS.map((group) => ({
  ...group,
  rows: SHORTCUT_ROWS.filter((row) => row.group === group.id),
}));

export const SHORTCUT_PLATFORM = shortcutPlatform();

export type ShortcutPreferenceKey = `shortcut${Capitalize<ShortcutId>}`;

export const shortcutPreferenceKey = (id: string) =>
  `shortcut${id.charAt(0).toUpperCase()}${id.slice(1)}` as ShortcutPreferenceKey;

export const SHORTCUT_PREFERENCE_KEYS: readonly ShortcutPreferenceKey[] =
  SHORTCUT_ROWS.map((row) => shortcutPreferenceKey(row.id));

export const SHORTCUT_PREFERENCES = Object.fromEntries(
  SHORTCUT_ROWS.map((row) => [
    shortcutPreferenceKey(row.id),
    { default: usualCombo(row, SHORTCUT_PLATFORM) },
  ]),
) as { readonly [K in ShortcutPreferenceKey]: { readonly default: string } };
