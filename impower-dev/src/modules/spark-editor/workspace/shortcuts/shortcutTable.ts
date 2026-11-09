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
