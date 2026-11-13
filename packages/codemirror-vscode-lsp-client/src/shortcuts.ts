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
import { nextDiagnostic } from "@codemirror/lint";
import {
  closeSearchPanel,
  gotoLine,
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
  ViewPlugin,
  type Command,
  type EditorView,
  type KeyBinding,
} from "@codemirror/view";
import { jumpToDefinition } from "./definition";
import { formatDocument } from "./formatting";
import { renameSymbol } from "./rename";
import { noteEditorKeydown, noteShortcutHandled } from "./shortcutDispatch";
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
import {
  findNextMatch,
  findPreviousMatch,
  findReferences,
  openFind,
  openProblems,
} from "./tools";
import {
  cursorWordLeft,
  cursorWordRight,
  deleteWordLeft,
  deleteWordRight,
  selectNextOccurrence,
  selectWordLeft,
  selectWordRight,
} from "./wordOperations";

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
  search: openFind,
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
  findNext: findNextMatch,
  findPrevious: findPreviousMatch,
  selectMatches: selectSelectionMatches,
  selectNextMatch: selectNextOccurrence,
  gotoLine,
  problems: openProblems,
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
  cursorWordLeft: shifted(cursorWordLeft, selectWordLeft),
  cursorLineBoundaryLeft: shifted(cursorLineBoundaryLeft, selectLineBoundaryLeft),
  cursorCharRight: shifted(cursorCharRight, selectCharRight),
  cursorWordRight: shifted(cursorWordRight, selectWordRight),
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
  deleteWordLeft,
  deleteWordRight,
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
  macDeleteWordBackward: deleteWordLeft,
  macSplitLine: splitLine,
  macTranspose: transposeChars,
  macPageDown: cursorPageDown,
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

let dispatchingEvent: KeyboardEvent | null = null;

const reportsHandling =
  (id: string, command: Command | undefined): Command | undefined =>
    command &&
    ((view) => {
      const handled = command(view);
      if (handled && dispatchingEvent) {
        noteShortcutHandled(dispatchingEvent, id);
      }
      return handled;
    });

const dispatchTracking = ViewPlugin.fromClass(
  class {
    readonly listener = (event: KeyboardEvent) => {
      dispatchingEvent = event;
      noteEditorKeydown(event);
    };

    constructor(readonly view: EditorView) {
      view.dom.addEventListener("keydown", this.listener, true);
    }

    destroy() {
      this.view.dom.removeEventListener("keydown", this.listener, true);
    }
  },
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
        run: reportsHandling(entry.id, run),
        shift: reportsHandling(entry.id, shift),
        scope: entry.scope,
        preventDefault: entry.preventDefault ?? isShortcutRow(entry),
      });
    }
  }
  if (precedence === "high") {
    bindings.push(...appClaimBindings(state));
  }
  return bindings;
}

const EDITOR_SHORTCUT_IDS: ReadonlySet<string> = new Set(
  (EDITOR_SHORTCUTS as readonly ShortcutEntry[]).map((entry) => entry.id),
);

const claimForApp: Command = () => true;

function appClaimBindings(state: EditorShortcutsState): KeyBinding[] {
  return Object.entries(state.combos)
    .filter(([id, combo]) => combo && !EDITOR_SHORTCUT_IDS.has(id))
    .map(([id, combo]) => ({
      key: codeMirrorKey(combo, state.platform),
      run: reportsHandling(id, claimForApp),
      scope: "editor search-panel",
      preventDefault: true,
    }));
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
  return [
    shortcutsCompartment.of(shortcutsStateOf(config)),
    dispatchTracking,
    generatedKeymaps,
  ];
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

export interface EditorShortcutEntryState {
  readonly id: EditorShortcutId;
  readonly combos: readonly string[];
  readonly run?: Command;
  readonly shift?: Command;
  readonly scope?: string;
  readonly precedence: ShortcutPrecedence;
  readonly fixed: boolean;
}

export function editorShortcutEntries(
  state: EditorState,
  platform?: ShortcutPlatform,
): EditorShortcutEntryState[] {
  const current = state.facet(editorShortcutsState);
  const shortcuts =
    !platform || platform === current.platform
      ? current
      : {
          ...current,
          platform,
          combos: resolveShortcuts(EDITOR_SHORTCUT_ROWS, {}, platform),
        };
  return PRECEDENCES.flatMap((precedence) =>
    (EDITOR_SHORTCUTS as readonly ShortcutEntry[])
      .filter((entry) => entryPrecedence(entry) === precedence)
      .flatMap((entry) => {
        const command = shortcuts.commands[entry.id as EditorShortcutId];
        if (!command) {
          return [];
        }
        const { run, shift } =
          typeof command === "function" ? { run: command, shift: undefined } : command;
        return [
          {
            id: entry.id as EditorShortcutId,
            combos: entryCombos(entry, shortcuts),
            run,
            shift,
            scope: entry.scope,
            precedence,
            fixed: !isShortcutRow(entry),
          },
        ];
      }),
  );
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

export function shortcutCommandFor(
  state: EditorState,
  id: EditorShortcutId,
): Command | undefined {
  const command = state.facet(editorShortcutsState).commands[id];
  return typeof command === "function" ? command : command?.run;
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
