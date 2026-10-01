import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  onEnterRulesCommand,
  vscodeOnEnterRules,
} from "@impower/codemirror-vscode-language/src/extensions/vscodeOnEnterRules";
import CONFIG_DEFINITION from "@impower/sparkdown/language/sparkdown.language-config.json";
import { afterEach, describe, expect, it } from "vitest";

// Enter between `{` and `}` in a brace body (#1228), through the web editor's
// own Enter command and the generated language configuration: the cursor goes
// to an indented line of its own and the `}` to the line below it, at the
// block line's indentation, with no whitespace left around either.

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
});

/** Press Enter at the `|` in `source`; returns the document with `|` at the
 *  cursor. */
const pressEnter = (source: string): string => {
  const cursor = source.indexOf("|");
  view = new EditorView({
    state: EditorState.create({
      doc: source.replace("|", ""),
      selection: EditorSelection.cursor(cursor),
      extensions: [vscodeOnEnterRules(CONFIG_DEFINITION as any)],
    }),
    parent: document.body,
  });
  expect(onEnterRulesCommand(view)).toBe(true);
  const doc = view.state.doc.toString();
  const head = view.state.selection.main.head;
  return doc.slice(0, head) + "|" + doc.slice(head);
};

describe("Enter between `{` and `}` in a brace body", () => {
  it.each([
    [
      "an accepted block completion, `{ | }`",
      "layout hud with\n  column.panel {\n    row.item { | }\n  }\nend\n",
      "layout hud with\n  column.panel {\n    row.item {\n      |\n    }\n  }\nend\n",
    ],
    [
      "an auto-closed `{|}`",
      "style card with\n  &.wide {|}\nend\n",
      "style card with\n  &.wide {\n    |\n  }\nend\n",
    ],
    [
      "a block in a body with no indentation",
      "animation fade with\ntiming {  |  }\nend\n",
      "animation fade with\ntiming {\n  |\n}\nend\n",
    ],
    [
      "a block opened inside another on one line",
      "morph blink with\n  keyframes { from { |} }\nend\n",
      "morph blink with\n  keyframes { from {\n    |\n  } }\nend\n",
    ],
  ])("%s", (_name, before, after) => {
    expect(pressEnter(before)).toBe(after);
  });
});
