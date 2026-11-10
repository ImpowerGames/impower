import {
  acceptCompletion,
  closeCompletion,
  deleteBracketPair,
  startCompletion,
} from "@codemirror/autocomplete";
import {
  addCursorAbove,
  addCursorBelow,
  copyLineDown,
  copyLineUp,
  cursorCharLeft,
  cursorCharRight,
  cursorDocEnd,
  cursorDocStart,
  cursorGroupLeft,
  cursorGroupRight,
  cursorLineBoundaryBackward,
  cursorLineBoundaryForward,
  cursorLineBoundaryLeft,
  cursorLineBoundaryRight,
  cursorLineDown,
  cursorLineEnd,
  cursorLineStart,
  cursorLineUp,
  cursorMatchingBracket,
  cursorPageDown,
  cursorPageUp,
  cursorSyntaxLeft,
  cursorSyntaxRight,
  deleteCharBackward,
  deleteCharForward,
  deleteGroupBackward,
  deleteGroupForward,
  deleteLine,
  deleteLineBoundaryBackward,
  deleteLineBoundaryForward,
  deleteToLineEnd,
  indentLess,
  indentMore,
  indentSelection,
  insertBlankLine,
  insertNewlineAndIndent,
  moveLineDown,
  moveLineUp,
  redo,
  redoSelection,
  selectAll,
  selectCharLeft,
  selectCharRight,
  selectDocEnd,
  selectDocStart,
  selectGroupLeft,
  selectGroupRight,
  selectLine,
  selectLineBoundaryBackward,
  selectLineBoundaryForward,
  selectLineBoundaryLeft,
  selectLineBoundaryRight,
  selectLineDown,
  selectLineEnd,
  selectLineStart,
  selectLineUp,
  selectPageDown,
  selectPageUp,
  selectParentSyntax,
  selectSyntaxLeft,
  selectSyntaxRight,
  simplifySelection,
  splitLine,
  toggleBlockComment,
  toggleComment,
  toggleTabFocusMode,
  transposeChars,
  undo,
  undoSelection,
} from "@codemirror/commands";
import { foldAll, foldCode, unfoldAll, unfoldCode } from "@codemirror/language";
import { nextDiagnostic, openLintPanel } from "@codemirror/lint";
import {
  closeSearchPanel,
  gotoLine,
  selectNextOccurrence,
  selectSelectionMatches,
} from "@codemirror/search";
import type { EditorState } from "@codemirror/state";
import type { Command } from "@codemirror/view";
import { onEnterRulesCommand } from "@impower/codemirror-vscode-language/src/extensions/vscodeOnEnterRules";
import {
  closeReferencePanel,
  findReferences,
  formatDocument,
  jumpToDefinition,
  nextSignature,
  prevSignature,
  renameSymbol,
  showSignatureHelp,
  comboKeyName,
  editorShortcutEntries,
  normalizeCombo,
  shortcutPlatform,
  type EditorShortcutEntryState,
  type ShortcutPlatform,
  findNextMatch,
  findPreviousMatch,
  openFind,
} from "@impower/codemirror-vscode-lsp-client/src";
import type {
  EditorKeybinding,
  EditorShortcutGroup,
} from "@impower/spark-editor-protocol/src/protocols/editor/ReadEditorKeybindingsMessage";
import {
  closeCustomGotoLinePanel,
  closeCustomSearchPanel,
  openCustomGotoLinePanel,
} from "./extensions/customSearch";
import { leavePageKeysToPreview } from "./extensions/scriptEditorShortcuts";

type ShortcutCommand = {
  id: string;
  label: string;
  group: EditorShortcutGroup;
  runs?: readonly Command[];
  entries?: readonly string[];
  claims?: boolean;
};

export const EDITOR_SHORTCUT_COMMANDS: readonly ShortcutCommand[] = [
  { id: "undo", label: "Undo", group: "editing", runs: [undo] },
  { id: "redo", label: "Redo", group: "editing", runs: [redo] },
  { id: "undoSelection", label: "Undo a selection change", group: "editing", runs: [undoSelection] },
  { id: "redoSelection", label: "Redo a selection change", group: "editing", runs: [redoSelection] },
  { id: "indent", label: "Indent", group: "editing", runs: [indentMore] },
  { id: "dedent", label: "Dedent", group: "editing", runs: [indentLess] },
  { id: "reindent", label: "Reindent the selection", group: "editing", runs: [indentSelection] },
  { id: "format", label: "Format script", group: "editing", runs: [formatDocument] },
  { id: "toggleComment", label: "Toggle comment", group: "editing", runs: [toggleComment] },
  { id: "toggleBlockComment", label: "Toggle block comment", group: "editing", runs: [toggleBlockComment] },
  { id: "moveLineUp", label: "Move line up", group: "editing", runs: [moveLineUp] },
  { id: "moveLineDown", label: "Move line down", group: "editing", runs: [moveLineDown] },
  { id: "duplicateLine", label: "Duplicate line", group: "editing", runs: [copyLineDown] },
  { id: "duplicateLineUp", label: "Duplicate line above", group: "editing", runs: [copyLineUp] },
  { id: "deleteLine", label: "Delete line", group: "editing", runs: [deleteLine] },
  { id: "newLine", label: "New line", group: "editing", runs: [insertNewlineAndIndent, onEnterRulesCommand] },
  { id: "blankLine", label: "Insert a blank line below", group: "editing", runs: [insertBlankLine] },
  { id: "splitLine", label: "Split the line at the caret", group: "editing", runs: [splitLine] },
  { id: "deleteBack", label: "Delete the character before", group: "editing", runs: [deleteCharBackward, deleteBracketPair] },
  { id: "deleteForward", label: "Delete the character after", group: "editing", runs: [deleteCharForward] },
  { id: "deleteWordBack", label: "Delete the word before", group: "editing", runs: [deleteGroupBackward] },
  { id: "deleteWordForward", label: "Delete the word after", group: "editing", runs: [deleteGroupForward] },
  { id: "deleteToLineStart", label: "Delete to the line start", group: "editing", runs: [deleteLineBoundaryBackward] },
  { id: "deleteToLineEnd", label: "Delete to the line end", group: "editing", runs: [deleteLineBoundaryForward, deleteToLineEnd] },
  { id: "transpose", label: "Swap the characters around the caret", group: "editing", runs: [transposeChars] },
  { id: "selectAll", label: "Select all", group: "navigation", runs: [selectAll] },
  { id: "selectLine", label: "Select line", group: "navigation", runs: [selectLine] },
  { id: "expandSelection", label: "Expand the selection", group: "navigation", runs: [selectParentSyntax] },
  { id: "simplifySelection", label: "Keep only the main selection", group: "navigation", runs: [simplifySelection] },
  { id: "addCursorAbove", label: "Add a caret above", group: "navigation", runs: [addCursorAbove] },
  { id: "addCursorBelow", label: "Add a caret below", group: "navigation", runs: [addCursorBelow] },
  { id: "moveChar", label: "Move by character", group: "navigation", runs: [cursorCharLeft, cursorCharRight] },
  { id: "selectChar", label: "Select by character", group: "navigation", runs: [selectCharLeft, selectCharRight] },
  { id: "moveWord", label: "Move by word", group: "navigation", runs: [cursorGroupLeft, cursorGroupRight] },
  { id: "selectWord", label: "Select by word", group: "navigation", runs: [selectGroupLeft, selectGroupRight] },
  { id: "moveSyntax", label: "Move by syntax", group: "navigation", runs: [cursorSyntaxLeft, cursorSyntaxRight] },
  { id: "selectSyntax", label: "Select by syntax", group: "navigation", runs: [selectSyntaxLeft, selectSyntaxRight] },
  { id: "moveLineBoundary", label: "Move to the line start or end", group: "navigation", runs: [cursorLineBoundaryBackward, cursorLineBoundaryForward, cursorLineBoundaryLeft, cursorLineBoundaryRight, cursorLineStart, cursorLineEnd] },
  { id: "selectLineBoundary", label: "Select to the line start or end", group: "navigation", runs: [selectLineBoundaryBackward, selectLineBoundaryForward, selectLineBoundaryLeft, selectLineBoundaryRight, selectLineStart, selectLineEnd] },
  { id: "moveLine", label: "Move up or down a line", group: "navigation", runs: [cursorLineUp, cursorLineDown] },
  { id: "selectLineUpDown", label: "Select up or down a line", group: "navigation", runs: [selectLineUp, selectLineDown] },
  { id: "movePage", label: "Move up or down a page", group: "navigation", runs: [cursorPageUp, cursorPageDown] },
  { id: "selectPage", label: "Select up or down a page", group: "navigation", runs: [selectPageUp, selectPageDown] },
  { id: "moveDoc", label: "Go to the start or end of the script", group: "navigation", runs: [cursorDocStart, cursorDocEnd] },
  { id: "selectDoc", label: "Select to the start or end of the script", group: "navigation", runs: [selectDocStart, selectDocEnd] },
  { id: "matchingBracket", label: "Go to the matching bracket", group: "navigation", runs: [cursorMatchingBracket] },
  { id: "gotoLine", label: "Go to line", group: "navigation", runs: [openCustomGotoLinePanel, gotoLine], claims: true },
  { id: "closeGotoLine", label: "Close Go to line", group: "navigation", runs: [closeCustomGotoLinePanel] },
  { id: "fold", label: "Fold the block", group: "navigation", runs: [foldCode] },
  { id: "unfold", label: "Open a folded block", group: "navigation", runs: [unfoldCode] },
  { id: "foldAll", label: "Fold every block", group: "navigation", runs: [foldAll] },
  { id: "unfoldAll", label: "Open every folded block", group: "navigation", runs: [unfoldAll] },
  { id: "tabFocus", label: "Let Tab move focus", group: "navigation", runs: [toggleTabFocusMode] },
  { id: "search", label: "Find", group: "find", runs: [openFind] },
  { id: "escape", label: "Close Find, suggestions and extra carets", group: "find", runs: [closeCustomSearchPanel], claims: true },
  { id: "closeSearch", label: "Close Find", group: "find", runs: [closeSearchPanel] },
  { id: "findNext", label: "Next match", group: "find", runs: [findNextMatch] },
  { id: "findPrevious", label: "Previous match", group: "find", runs: [findPreviousMatch] },
  { id: "selectMatches", label: "Select every match", group: "find", runs: [selectSelectionMatches] },
  { id: "selectNextMatch", label: "Add the next match to the selection", group: "find", runs: [selectNextOccurrence] },
  { id: "suggestions", label: "Show suggestions", group: "story", runs: [startCompletion] },
  { id: "closeSuggestions", label: "Close suggestions", group: "story", runs: [closeCompletion] },
  { id: "acceptSuggestion", label: "Accept the suggestion", group: "story", runs: [acceptCompletion] },
  { id: "moveSuggestion", label: "Move through suggestions", group: "story", entries: ["nextSuggestion", "previousSuggestion", "nextSuggestionPage", "previousSuggestionPage"] },
  { id: "signature", label: "Show parameter hints", group: "story", runs: [showSignatureHelp] },
  { id: "signatureStep", label: "Previous or next parameter hint", group: "story", runs: [prevSignature, nextSignature] },
  { id: "definition", label: "Go to definition", group: "story", runs: [jumpToDefinition] },
  { id: "references", label: "Find references", group: "story", runs: [findReferences] },
  { id: "closeReferences", label: "Close references", group: "story", runs: [closeReferencePanel] },
  { id: "rename", label: "Rename", group: "story", runs: [renameSymbol] },
  { id: "problems", label: "Show problems", group: "story", runs: [openLintPanel] },
  { id: "nextProblem", label: "Next problem", group: "story", runs: [nextDiagnostic] },
  { id: "previewBeat", label: "Previous or next beat in the preview", group: "story", runs: [leavePageKeysToPreview], claims: true },
];

export { shortcutPlatform, type ShortcutPlatform };

const commandFor = (entry: EditorShortcutEntryState, run: Command | undefined) =>
  EDITOR_SHORTCUT_COMMANDS.find(
    (command) =>
      (run && command.runs?.includes(run)) || command.entries?.includes(entry.id),
  );

export function editorKeybindings(
  state: EditorState,
  platform: ShortcutPlatform = shortcutPlatform(),
): EditorKeybinding[] {
  const keys = new Map<string, string[]>();
  const claimed = new Set<string>();
  const add = (id: string, key: string) => {
    const list = keys.get(id) ?? [];
    if (!list.includes(key)) list.push(key);
    keys.set(id, list);
  };
  const take = (entry: EditorShortcutEntryState, run: Command, key: string) => {
    const slots = (entry.scope ?? "editor")
      .split(" ")
      .map((scope) => `${scope}|${key}`);
    if (slots.every((slot) => claimed.has(slot))) return;
    const command = commandFor(entry, run);
    if (!command) return;
    add(command.id, key);
    if (command.claims) slots.forEach((slot) => claimed.add(slot));
  };
  for (const entry of editorShortcutEntries(state, platform)) {
    for (const combo of entry.combos) {
      if (entry.run) take(entry, entry.run, comboKeyName(combo));
      if (entry.shift) take(entry, entry.shift, comboKeyName(normalizeCombo(`Shift+${combo}`, platform)));
    }
  }
  return EDITOR_SHORTCUT_COMMANDS.map(({ id, label, group }) => ({
    id,
    label,
    group,
    keys: keys.get(id) ?? [],
  }));
}

export function unlistedKeybindings(state: EditorState): EditorShortcutEntryState[] {
  return editorShortcutEntries(state).filter(
    (entry) =>
      (entry.run && !commandFor(entry, entry.run)) ||
      (entry.shift && !commandFor(entry, entry.shift)),
  );
}
