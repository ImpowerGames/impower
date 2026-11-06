import {
  acceptCompletion,
  closeCompletion,
  deleteBracketPair,
  moveCompletionSelection,
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
  findNext,
  findPrevious,
  gotoLine,
  openSearchPanel,
  selectNextOccurrence,
  selectSelectionMatches,
} from "@codemirror/search";
import {
  Compartment,
  Facet,
  Prec,
  type EditorState,
  type Extension,
} from "@codemirror/state";
import {
  keymap,
  type Command,
  type EditorView,
  type KeyBinding,
} from "@codemirror/view";
import { jumpToDefinition } from "./definition";
import { formatDocument } from "./formatting";
import { closeReferencePanel, findReferences } from "./references";
import { renameSymbol } from "./rename";
import {
  codeMirrorKey,
  comboLabel,
  normalizeCombo,
  shortcutPlatform,
  type ShortcutPlatform,
} from "./shortcutCombo";
import {
  activeCombos,
  resolveShortcuts,
  type ShortcutCombos,
} from "./shortcutRules";
import {
  EDITOR_SHORTCUT_ROWS,
  EDITOR_SHORTCUTS,
  isShortcutRow,
  platformKeys,
  type EditorShortcutId,
  type ShortcutEntry,
  type ShortcutPrecedence,
} from "./shortcutTable";
import { nextSignature, prevSignature, showSignatureHelp } from "./signature";

export type ShortcutCommand =
  | Command
  | { readonly run?: Command; readonly shift?: Command };

export type ShortcutCommands = Readonly<
  Partial<Record<EditorShortcutId, ShortcutCommand>>
>;

const shifted = (run: Command, shift: Command) => ({ run, shift });

export const EDITOR_SHORTCUT_COMMANDS: ShortcutCommands = {
  undo,
  redo,
  format: formatDocument,
  rename: renameSymbol,
  suggestions: startCompletion,
  fold: foldCode,
  unfold: unfoldCode,
  search: openSearchPanel,
  definition: jumpToDefinition,
  references: findReferences,
  undoSelection,
  redoSelection,
  indent: indentMore,
  dedent: indentLess,
  reindent: indentSelection,
  toggleComment,
  toggleBlockComment,
  moveLineUp,
  moveLineDown,
  duplicateLineUp: copyLineUp,
  duplicateLine: copyLineDown,
  deleteLine,
  blankLine: insertBlankLine,
  selectAll,
  selectLine,
  expandSelection: selectParentSyntax,
  addCursorAbove,
  addCursorBelow,
  matchingBracket: cursorMatchingBracket,
  foldAll,
  unfoldAll,
  tabFocus: toggleTabFocusMode,
  findNext,
  findPrevious,
  selectMatches: selectSelectionMatches,
  selectNextMatch: selectNextOccurrence,
  gotoLine,
  problems: openLintPanel,
  nextProblem: nextDiagnostic,
  signature: showSignatureHelp,
  previousSignature: prevSignature,
  nextSignature,
  acceptSuggestion: acceptCompletion,
  closeSuggestions: closeCompletion,
  nextSuggestion: moveCompletionSelection(true),
  previousSuggestion: moveCompletionSelection(false),
  nextSuggestionPage: moveCompletionSelection(true, "page"),
  previousSuggestionPage: moveCompletionSelection(false, "page"),
  chooseSuggestion: acceptCompletion,
  closeSearch: closeSearchPanel,
  deleteBracketPair,
  indentWithTab: shifted(indentMore, indentLess),
  cursorSyntaxLeft: shifted(cursorSyntaxLeft, selectSyntaxLeft),
  cursorSyntaxRight: shifted(cursorSyntaxRight, selectSyntaxRight),
  simplifySelection,
  cursorCharLeft: shifted(cursorCharLeft, selectCharLeft),
  cursorGroupLeft: shifted(cursorGroupLeft, selectGroupLeft),
  cursorLineBoundaryLeft: shifted(cursorLineBoundaryLeft, selectLineBoundaryLeft),
  cursorCharRight: shifted(cursorCharRight, selectCharRight),
  cursorGroupRight: shifted(cursorGroupRight, selectGroupRight),
  cursorLineBoundaryRight: shifted(cursorLineBoundaryRight, selectLineBoundaryRight),
  cursorLineUp: shifted(cursorLineUp, selectLineUp),
  cursorDocStartByArrow: shifted(cursorDocStart, selectDocStart),
  cursorPageUpByArrow: shifted(cursorPageUp, selectPageUp),
  cursorLineDown: shifted(cursorLineDown, selectLineDown),
  cursorDocEndByArrow: shifted(cursorDocEnd, selectDocEnd),
  cursorPageDownByArrow: shifted(cursorPageDown, selectPageDown),
  cursorPageUp: shifted(cursorPageUp, selectPageUp),
  cursorPageDown: shifted(cursorPageDown, selectPageDown),
  cursorLineBoundaryBackward: shifted(cursorLineBoundaryBackward, selectLineBoundaryBackward),
  cursorDocStart: shifted(cursorDocStart, selectDocStart),
  cursorLineBoundaryForward: shifted(cursorLineBoundaryForward, selectLineBoundaryForward),
  cursorDocEnd: shifted(cursorDocEnd, selectDocEnd),
  newLine: shifted(insertNewlineAndIndent, insertNewlineAndIndent),
  deleteCharBackward: shifted(deleteCharBackward, deleteCharBackward),
  deleteCharForward,
  deleteGroupBackward,
  deleteGroupForward,
  deleteLineBoundaryBackward,
  deleteLineBoundaryForward,
  macCharLeft: shifted(cursorCharLeft, selectCharLeft),
  macCharRight: shifted(cursorCharRight, selectCharRight),
  macLineUp: shifted(cursorLineUp, selectLineUp),
  macLineDown: shifted(cursorLineDown, selectLineDown),
  macLineStart: shifted(cursorLineStart, selectLineStart),
  macLineEnd: shifted(cursorLineEnd, selectLineEnd),
  macDeleteForward: deleteCharForward,
  macDeleteBackward: deleteCharBackward,
  macDeleteToLineEnd: deleteToLineEnd,
  macDeleteWordBackward: deleteGroupBackward,
  macSplitLine: splitLine,
  macTranspose: transposeChars,
  macPageDown: cursorPageDown,
  closeReferences: closeReferencePanel,
};

export interface EditorShortcutsState {
  readonly platform: ShortcutPlatform;
  readonly combos: ShortcutCombos;
  readonly commands: ShortcutCommands;
}

const defaultShortcutsState = (): EditorShortcutsState => {
  const platform = shortcutPlatform();
  return {
    platform,
    combos: resolveShortcuts(EDITOR_SHORTCUT_ROWS, {}, platform),
    commands: EDITOR_SHORTCUT_COMMANDS,
  };
};

const editorShortcutsState = Facet.define<
  EditorShortcutsState,
  EditorShortcutsState
>({
  combine: (values) => values[0] ?? defaultShortcutsState(),
});

const PRECEDENCES: readonly ShortcutPrecedence[] = ["highest", "high", "default"];

const entryPrecedence = (entry: ShortcutEntry): ShortcutPrecedence =>
  entry.prec ?? (isShortcutRow(entry) ? "high" : "default");

const entryCombos = (entry: ShortcutEntry, state: EditorShortcutsState) =>
  isShortcutRow(entry)
    ? activeCombos(entry, state.combos, state.platform)
    : [normalizeCombo(platformKeys(entry.keys, state.platform), state.platform)].filter(
        Boolean,
      );

export function shortcutKeyBindings(
  state: EditorShortcutsState,
  precedence: ShortcutPrecedence,
): KeyBinding[] {
  const bindings: KeyBinding[] = [];
  for (const entry of EDITOR_SHORTCUTS as readonly ShortcutEntry[]) {
    if (entryPrecedence(entry) !== precedence) {
      continue;
    }
    const command = state.commands[entry.id as EditorShortcutId];
    if (!command) {
      continue;
    }
    const { run, shift } =
      typeof command === "function" ? { run: command, shift: undefined } : command;
    for (const combo of entryCombos(entry, state)) {
      bindings.push({
        key: codeMirrorKey(combo, state.platform),
        run,
        shift,
        scope: entry.scope,
        preventDefault: entry.preventDefault ?? isShortcutRow(entry),
      });
    }
  }
  return bindings;
}

const PREC_WRAPPERS: Readonly<
  Record<ShortcutPrecedence, (extension: Extension) => Extension>
> = {
  highest: Prec.highest,
  high: Prec.high,
  default: (extension) => extension,
};

const generatedKeymaps: Extension = PRECEDENCES.map((precedence) =>
  PREC_WRAPPERS[precedence](
    keymap.compute([editorShortcutsState], (state) =>
      shortcutKeyBindings(state.facet(editorShortcutsState), precedence),
    ),
  ),
);

const shortcutsCompartment = new Compartment();

export interface EditorShortcutsConfig {
  readonly combos?: ShortcutCombos;
  readonly commands?: ShortcutCommands;
  readonly platform?: ShortcutPlatform;
}

const shortcutsStateOf = (config: EditorShortcutsConfig) => {
  const platform = config.platform ?? shortcutPlatform();
  return editorShortcutsState.of({
    platform,
    combos: config.combos ?? resolveShortcuts(EDITOR_SHORTCUT_ROWS, {}, platform),
    commands: { ...EDITOR_SHORTCUT_COMMANDS, ...config.commands },
  });
};

export function editorShortcuts(config: EditorShortcutsConfig = {}): Extension {
  return [shortcutsCompartment.of(shortcutsStateOf(config)), generatedKeymaps];
}

export function setEditorShortcuts(
  view: EditorView,
  combos: ShortcutCombos,
): void {
  const current = view.state.facet(editorShortcutsState);
  if (current.combos === combos) {
    return;
  }
  view.dispatch({
    effects: shortcutsCompartment.reconfigure(
      shortcutsStateOf({
        combos,
        commands: current.commands,
        platform: current.platform,
      }),
    ),
  });
}

export function shortcutCombosFor(
  state: EditorState,
  id: EditorShortcutId,
): string[] {
  const shortcuts = state.facet(editorShortcutsState);
  const entry = (EDITOR_SHORTCUTS as readonly ShortcutEntry[]).find(
    (candidate) => candidate.id === id,
  );
  return entry ? entryCombos(entry, shortcuts) : [];
}

export function shortcutLabelFor(
  state: EditorState,
  id: EditorShortcutId,
): string | undefined {
  const combo = shortcutCombosFor(state, id)[0];
  return combo
    ? comboLabel(combo, state.facet(editorShortcutsState).platform)
    : undefined;
}
