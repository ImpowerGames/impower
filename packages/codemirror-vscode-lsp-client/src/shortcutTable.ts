import type { ShortcutPlatform } from "./shortcutCombo";

export type PlatformKeys =
  | string
  | {
      readonly key?: string;
      readonly mac?: string;
      readonly win?: string;
      readonly linux?: string;
    };

export type ShortcutPrecedence = "highest" | "high" | "default";

export const SHORTCUT_GROUPS = [
  { id: "editing", legend: "Editing shortcuts" },
  { id: "navigation", legend: "Navigation shortcuts" },
  { id: "lines", legend: "Lines and selection" },
  { id: "find", legend: "Find and problems" },
  { id: "story", legend: "Story and app" },
] as const;

export type ShortcutGroupId = (typeof SHORTCUT_GROUPS)[number]["id"];

interface ShortcutBindingOptions {
  readonly scope?: string;
  readonly prec?: ShortcutPrecedence;
  readonly preventDefault?: boolean;
}

export interface ShortcutRow extends ShortcutBindingOptions {
  readonly id: string;
  readonly name: string;
  readonly detail: string;
  readonly group: ShortcutGroupId;
  readonly keys: PlatformKeys;
  readonly aliases?: readonly PlatformKeys[];
}

export interface FixedShortcut extends ShortcutBindingOptions {
  readonly id: string;
  readonly fixed: true;
  readonly keys: PlatformKeys;
  readonly shift?: true;
}

export type ShortcutEntry = ShortcutRow | FixedShortcut;

export const isShortcutRow = (entry: ShortcutEntry): entry is ShortcutRow =>
  !("fixed" in entry);

export const platformKeys = (
  keys: PlatformKeys,
  platform: ShortcutPlatform,
): string =>
  typeof keys === "string" ? keys : (keys[platform] ?? keys.key ?? "");

const SEARCH_PANEL = "editor search-panel";
const GOTO_LINE_PANEL = "editor gotoline-panel";

export const EDITOR_SHORTCUTS = [
  { id: "undo", group: "editing", name: "Undo", detail: "Undo the last change.", keys: "Mod+Z" },
  {
    id: "redo",
    group: "editing",
    name: "Redo",
    detail: "Redo the last change you undid.",
    keys: { key: "Mod+Y", mac: "Mod+Shift+Z" },
    aliases: ["Mod+Shift+Z", "Mod+Y"],
  },
  {
    id: "format",
    group: "editing",
    name: "Format script",
    detail: "Tidy the whole script.",
    keys: "Mod+S",
    aliases: ["Shift+Alt+F"],
  },
  { id: "rename", group: "editing", name: "Rename", detail: "Rename something everywhere it is used.", keys: "F2" },
  {
    id: "suggestions",
    group: "editing",
    name: "Show suggestions",
    detail: "Show suggestions for possible names and keywords.",
    keys: "Ctrl+Space",
    aliases: [{ mac: "Alt+`" }, { mac: "Alt+I" }],
  },
  {
    id: "fold",
    group: "navigation",
    name: "Fold a block",
    detail: "Fold the current block.",
    keys: { key: "Mod+Shift+[", mac: "Mod+Alt+[" },
  },
  {
    id: "unfold",
    group: "navigation",
    name: "Open a folded block",
    detail: "Open the current block.",
    keys: { key: "Mod+Shift+]", mac: "Mod+Alt+]" },
  },
  {
    id: "search",
    group: "navigation",
    name: "Search",
    detail: "Find text in the script, and replace it.",
    keys: "Mod+F",
    scope: SEARCH_PANEL,
  },
  { id: "definition", group: "navigation", name: "Go to definition", detail: "Jump to where a name is declared.", keys: "F12" },
  { id: "references", group: "navigation", name: "Find references", detail: "List every use of a name.", keys: "Shift+F12" },
  { id: "undoSelection", group: "lines", name: "Undo a selection change", detail: "Put the caret and selection back where they were.", keys: "Mod+U" },
  {
    id: "redoSelection",
    group: "lines",
    name: "Redo a selection change",
    detail: "Move the caret and selection forward again.",
    keys: { key: "Alt+U", mac: "Mod+Shift+U" },
  },
  { id: "indent", group: "lines", name: "Indent", detail: "Move the selected lines one step in.", keys: "Mod+]" },
  { id: "dedent", group: "lines", name: "Dedent", detail: "Move the selected lines one step out.", keys: "Mod+[" },
  { id: "reindent", group: "lines", name: "Reindent the selection", detail: "Indent the selected lines the way the script expects.", keys: "Mod+Alt+\\" },
  { id: "toggleComment", group: "lines", name: "Toggle comment", detail: "Comment out the selected lines, or bring them back.", keys: "Mod+/" },
  { id: "toggleBlockComment", group: "lines", name: "Toggle block comment", detail: "Wrap the selection in a block comment, or unwrap it.", keys: "Shift+Alt+A" },
  { id: "moveLineUp", group: "lines", name: "Move line up", detail: "Move the selected lines up one line.", keys: "Alt+Up" },
  { id: "moveLineDown", group: "lines", name: "Move line down", detail: "Move the selected lines down one line.", keys: "Alt+Down" },
  { id: "duplicateLineUp", group: "lines", name: "Duplicate line above", detail: "Copy the selected lines above themselves.", keys: "Shift+Alt+Up" },
  { id: "duplicateLine", group: "lines", name: "Duplicate line", detail: "Copy the selected lines below themselves.", keys: "Shift+Alt+Down" },
  { id: "deleteLine", group: "lines", name: "Delete line", detail: "Delete the selected lines.", keys: "Mod+Shift+K" },
  { id: "blankLine", group: "lines", name: "Insert a blank line below", detail: "Start a new line under this one, wherever the caret is.", keys: "Mod+Enter" },
  { id: "selectAll", group: "lines", name: "Select all", detail: "Select the whole script.", keys: "Mod+A" },
  {
    id: "selectLine",
    group: "lines",
    name: "Select line",
    detail: "Select the whole line, or the next one.",
    keys: { key: "Alt+L", mac: "Ctrl+L" },
  },
  { id: "expandSelection", group: "lines", name: "Expand the selection", detail: "Grow the selection to the enclosing piece of the script.", keys: "Mod+I" },
  { id: "addCursorAbove", group: "lines", name: "Add a caret above", detail: "Add a caret on the line above.", keys: "Mod+Alt+Up" },
  { id: "addCursorBelow", group: "lines", name: "Add a caret below", detail: "Add a caret on the line below.", keys: "Mod+Alt+Down" },
  { id: "matchingBracket", group: "lines", name: "Go to the matching bracket", detail: "Jump to the bracket that pairs with this one.", keys: "Mod+Shift+\\" },
  {
    id: "foldAll",
    group: "lines",
    name: "Fold every block",
    detail: "Fold every block in the script.",
    keys: "Ctrl+Alt+[",
  },
  {
    id: "unfoldAll",
    group: "lines",
    name: "Open every folded block",
    detail: "Open every folded block in the script.",
    keys: "Ctrl+Alt+]",
  },
  {
    id: "tabFocus",
    group: "lines",
    name: "Let Tab move focus",
    detail: "Make Tab leave the editor instead of indenting, until you press this again.",
    keys: { key: "Ctrl+M", mac: "Shift+Alt+M" },
  },
  {
    id: "findNext",
    group: "find",
    name: "Next match",
    detail: "Go to the next match of the search.",
    keys: "F3",
    aliases: ["Mod+G"],
    scope: SEARCH_PANEL,
  },
  {
    id: "findPrevious",
    group: "find",
    name: "Previous match",
    detail: "Go to the previous match of the search.",
    keys: "Shift+F3",
    aliases: ["Mod+Shift+G"],
    scope: SEARCH_PANEL,
  },
  { id: "selectMatches", group: "find", name: "Select every match", detail: "Select every copy of the selected text.", keys: "Mod+Shift+L" },
  { id: "selectNextMatch", group: "find", name: "Add the next match to the selection", detail: "Select the next copy of the selected text as well.", keys: "Mod+D" },
  {
    id: "gotoLine",
    group: "find",
    name: "Go to line",
    detail: "Jump to a line by its number.",
    keys: "Mod+G",
    aliases: ["Mod+Alt+G"],
    scope: GOTO_LINE_PANEL,
  },
  { id: "problems", group: "find", name: "Show problems", detail: "Open the Problems panel with every script's problems.", keys: "Mod+Shift+M" },
  { id: "nextProblem", group: "find", name: "Next problem", detail: "Go to the next problem in the script.", keys: "F8" },
  { id: "signature", group: "story", name: "Show parameter hints", detail: "Show what a function call expects.", keys: "Mod+Shift+Space" },
  { id: "previousSignature", group: "story", name: "Previous parameter hint", detail: "Show the previous form of the function being called.", keys: "Mod+Shift+Up" },
  { id: "nextSignature", group: "story", name: "Next parameter hint", detail: "Show the next form of the function being called.", keys: "Mod+Shift+Down" },
  { id: "previousBeat", group: "story", name: "Previous beat in the preview", detail: "Move the preview back one beat.", keys: "PageUp" },
  { id: "nextBeat", group: "story", name: "Next beat in the preview", detail: "Move the preview on one beat.", keys: "PageDown" },
  { id: "acceptSuggestion", fixed: true, keys: "Tab", prec: "highest" },
  { id: "closeSuggestions", fixed: true, keys: "Escape", prec: "highest" },
  { id: "nextSuggestion", fixed: true, keys: "Down", prec: "highest" },
  { id: "previousSuggestion", fixed: true, keys: "Up", prec: "highest" },
  { id: "nextSuggestionPage", fixed: true, keys: "PageDown", prec: "highest" },
  { id: "previousSuggestionPage", fixed: true, keys: "PageUp", prec: "highest" },
  { id: "chooseSuggestion", fixed: true, keys: "Enter", prec: "highest" },
  { id: "closeSearch", fixed: true, keys: "Escape", scope: SEARCH_PANEL, prec: "highest" },
  { id: "closeGotoLine", fixed: true, keys: "Escape", scope: GOTO_LINE_PANEL, prec: "high" },
  { id: "deleteBracketPair", fixed: true, keys: "Backspace", prec: "high" },
  { id: "newLineByRules", fixed: true, keys: "Enter", prec: "high" },
  { id: "indentWithTab", fixed: true, shift: true, keys: "Tab" },
  { id: "cursorSyntaxLeft", fixed: true, shift: true, keys: { key: "Alt+Left", mac: "Ctrl+Left" } },
  { id: "cursorSyntaxRight", fixed: true, shift: true, keys: { key: "Alt+Right", mac: "Ctrl+Right" } },
  { id: "simplifySelection", fixed: true, keys: "Escape" },
  { id: "cursorCharLeft", fixed: true, shift: true, keys: "Left", preventDefault: true },
  { id: "cursorGroupLeft", fixed: true, shift: true, keys: { key: "Mod+Left", mac: "Alt+Left" }, preventDefault: true },
  { id: "cursorLineBoundaryLeft", fixed: true, shift: true, keys: { mac: "Mod+Left" }, preventDefault: true },
  { id: "cursorCharRight", fixed: true, shift: true, keys: "Right", preventDefault: true },
  { id: "cursorGroupRight", fixed: true, shift: true, keys: { key: "Mod+Right", mac: "Alt+Right" }, preventDefault: true },
  { id: "cursorLineBoundaryRight", fixed: true, shift: true, keys: { mac: "Mod+Right" }, preventDefault: true },
  { id: "cursorLineUp", fixed: true, shift: true, keys: "Up", preventDefault: true },
  { id: "cursorDocStartByArrow", fixed: true, shift: true, keys: { mac: "Mod+Up" } },
  { id: "cursorPageUpByArrow", fixed: true, shift: true, keys: { mac: "Ctrl+Up" } },
  { id: "cursorLineDown", fixed: true, shift: true, keys: "Down", preventDefault: true },
  { id: "cursorDocEndByArrow", fixed: true, shift: true, keys: { mac: "Mod+Down" } },
  { id: "cursorPageDownByArrow", fixed: true, shift: true, keys: { mac: "Ctrl+Down" } },
  { id: "cursorPageUp", fixed: true, shift: true, keys: "PageUp" },
  { id: "cursorPageDown", fixed: true, shift: true, keys: "PageDown" },
  { id: "cursorLineBoundaryBackward", fixed: true, shift: true, keys: "Home", preventDefault: true },
  { id: "cursorDocStart", fixed: true, shift: true, keys: "Mod+Home" },
  { id: "cursorLineBoundaryForward", fixed: true, shift: true, keys: "End", preventDefault: true },
  { id: "cursorDocEnd", fixed: true, shift: true, keys: "Mod+End" },
  { id: "newLine", fixed: true, shift: true, keys: "Enter" },
  { id: "deleteCharBackward", fixed: true, shift: true, keys: "Backspace", preventDefault: true },
  { id: "deleteCharForward", fixed: true, keys: "Delete", preventDefault: true },
  { id: "deleteGroupBackward", fixed: true, keys: { key: "Mod+Backspace", mac: "Alt+Backspace" }, preventDefault: true },
  { id: "deleteGroupForward", fixed: true, keys: { key: "Mod+Delete", mac: "Alt+Delete" }, preventDefault: true },
  { id: "deleteLineBoundaryBackward", fixed: true, keys: { mac: "Mod+Backspace" }, preventDefault: true },
  { id: "deleteLineBoundaryForward", fixed: true, keys: { mac: "Mod+Delete" }, preventDefault: true },
  { id: "macCharLeft", fixed: true, shift: true, keys: { mac: "Ctrl+B" } },
  { id: "macCharRight", fixed: true, shift: true, keys: { mac: "Ctrl+F" } },
  { id: "macLineUp", fixed: true, shift: true, keys: { mac: "Ctrl+P" } },
  { id: "macLineDown", fixed: true, shift: true, keys: { mac: "Ctrl+N" } },
  { id: "macLineStart", fixed: true, shift: true, keys: { mac: "Ctrl+A" } },
  { id: "macLineEnd", fixed: true, shift: true, keys: { mac: "Ctrl+E" } },
  { id: "macDeleteForward", fixed: true, keys: { mac: "Ctrl+D" } },
  { id: "macDeleteBackward", fixed: true, keys: { mac: "Ctrl+H" } },
  { id: "macDeleteToLineEnd", fixed: true, keys: { mac: "Ctrl+K" } },
  { id: "macDeleteWordBackward", fixed: true, keys: { mac: "Ctrl+Alt+H" } },
  { id: "macSplitLine", fixed: true, keys: { mac: "Ctrl+O" } },
  { id: "macTranspose", fixed: true, keys: { mac: "Ctrl+T" } },
  { id: "macPageDown", fixed: true, keys: { mac: "Ctrl+V" } },
  { id: "closeReferences", fixed: true, keys: "Escape" },
  { id: "cut", fixed: true, keys: "Mod+X" },
  { id: "copy", fixed: true, keys: "Mod+C" },
  { id: "paste", fixed: true, keys: "Mod+V" },
] as const satisfies readonly ShortcutEntry[];

export type EditorShortcutId = (typeof EDITOR_SHORTCUTS)[number]["id"];

export type EditorShortcutRowId = Exclude<
  (typeof EDITOR_SHORTCUTS)[number],
  { readonly fixed: true }
>["id"];

export const EDITOR_SHORTCUT_ROWS: readonly ShortcutRow[] = (
  EDITOR_SHORTCUTS as readonly ShortcutEntry[]
).filter(isShortcutRow);
