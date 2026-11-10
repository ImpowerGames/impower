import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  onEnterRulesCommand,
  vscodeOnEnterRules,
} from "@impower/codemirror-vscode-language/src/extensions/vscodeOnEnterRules";
import LUAU_CONFIG_DEFINITION from "@impower/sparkdown/language/sparkdown-luau.language-config.json";
import STORY_CONFIG_DEFINITION from "@impower/sparkdown/language/sparkdown.language-config.json";
import { afterEach, describe, expect, it } from "vitest";

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
});

const pressEnter = (source: string, config: unknown): string => {
  const cursor = source.indexOf("|");
  view = new EditorView({
    state: EditorState.create({
      doc: source.replace("|", ""),
      selection: EditorSelection.cursor(cursor),
      extensions: [vscodeOnEnterRules(config as any)],
    }),
    parent: document.body,
  });
  expect(onEnterRulesCommand(view)).toBe(true);
  const doc = view.state.doc.toString();
  const head = view.state.selection.main.head;
  return doc.slice(0, head) + "|" + doc.slice(head);
};

describe.each([
  ["sparkdown.language-config.json", STORY_CONFIG_DEFINITION],
  ["sparkdown-luau.language-config.json", LUAU_CONFIG_DEFINITION],
])("Enter between `{` and `}` in a brace body with %s", (_file, config) => {
  it.each([
    [
      "an accepted block completion, `{ | }`",
      "layout hud {\n  column.panel {\n    row.item { | }\n  }\n}\n",
      "layout hud {\n  column.panel {\n    row.item {\n      |\n    }\n  }\n}\n",
    ],
    [
      "an auto-closed `{|}`",
      "style card {\n  &.wide {|}\n}\n",
      "style card {\n  &.wide {\n    |\n  }\n}\n",
    ],
    [
      "a block in a body with no indentation",
      "animation fade {\ntiming {  |  }\n}\n",
      "animation fade {\ntiming {\n  |\n}\n}\n",
    ],
    [
      "a block opened inside another on one line",
      "morph blink {\n  keyframes { from { |} }\n}\n",
      "morph blink {\n  keyframes { from {\n    |\n  } }\n}\n",
    ],
  ])("%s", (_name, before, after) => {
    expect(pressEnter(before, config)).toBe(after);
  });
});
