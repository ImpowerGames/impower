import type { Command } from "@codemirror/view";
import { onEnterRulesCommand } from "@impower/codemirror-vscode-language/src/extensions/vscodeOnEnterRules";
import {
  editorShortcuts,
  type ShortcutCombos,
  type ShortcutCommands,
} from "@impower/codemirror-vscode-lsp-client/src";
import {
  closeCustomGotoLinePanel,
  closeCustomSearchPanel,
  openCustomGotoLinePanel,
} from "./customSearch";

export const leavePageKeysToPreview: Command = () => true;

export const SCRIPT_EDITOR_COMMANDS: ShortcutCommands = {
  gotoLine: openCustomGotoLinePanel,
  closeGotoLine: closeCustomGotoLinePanel,
  closeSearch: closeCustomSearchPanel,
  newLineByRules: onEnterRulesCommand,
  previousBeat: leavePageKeysToPreview,
  nextBeat: leavePageKeysToPreview,
};

export const scriptEditorShortcuts = (combos?: ShortcutCombos) =>
  editorShortcuts({ combos, commands: SCRIPT_EDITOR_COMMANDS });
