import { ensureSyntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { vscodeLanguage } from "@impower/codemirror-vscode-language/src";
import { sparkdownGrammarFor } from "@impower/sparkdown/src/compiler/utils/sparkdownGrammarFor";
import {
  SPARKDOWN_EMBEDDED_LANGUAGES,
  SPARKDOWN_LANGUAGE_CONFIGS,
  sparkdownLanguageFor,
} from "@impower/sparkdown/src/compiler/utils/sparkdownLanguageFor";
import { afterEach, describe, expect, it } from "vitest";

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

const SD_URI = "file:///main.sd";

const EXTENSION = vscodeLanguage({
  name: "sparkdown",
  grammar: sparkdownGrammarFor(SD_URI),
  language: sparkdownLanguageFor(SD_URI),
  configs: SPARKDOWN_LANGUAGE_CONFIGS as never,
  embeddedLanguages: SPARKDOWN_EMBEDDED_LANGUAGES,
});

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
});

const open = (source: string) => {
  const anchor = source.indexOf("[");
  const cursor = source.indexOf("|");
  const doc = source.replace(/[[\]|]/g, "");
  const selection =
    anchor >= 0
      ? EditorSelection.range(anchor, source.indexOf("]") - 1)
      : EditorSelection.cursor(cursor);
  const state = EditorState.create({ doc, selection, extensions: EXTENSION });
  expect(ensureSyntaxTree(state, state.doc.length, 10_000)).not.toBeNull();
  view = new EditorView({ state, parent: document.body });
  return view;
};

const show = (editor: EditorView) => {
  const doc = editor.state.doc.toString();
  const { from, to } = editor.state.selection.main;
  return from === to
    ? doc.slice(0, from) + "|" + doc.slice(from)
    : doc.slice(0, from) + "[" + doc.slice(from, to) + "]" + doc.slice(to);
};

const type = (editor: EditorView, text: string) => {
  for (const ch of text) {
    const { from, to } = editor.state.selection.main;
    const insert = () =>
      editor.state.update({
        changes: { from, to, insert: ch },
        selection: EditorSelection.cursor(from + ch.length),
      });
    const handled = editor.state
      .facet(EditorView.inputHandler)
      .some((handler) => handler(editor, from, to, ch, insert));
    if (!handled) {
      editor.dispatch(insert());
    }
  }
  return show(editor);
};

const SCENE = (line: string) => `Intro\n  ${line}\n`;

const CASES: [typed: string, before: string, after: string][] = [
  ["`", "A `raw {1+1}|x now`", "A `raw {1+1}`|x now`"],
  ["`", "A raw |x now", "A raw `|x now"],
  ["`", "A raw | now", "A raw `|` now"],
  ["`", "A raw|", "A raw`|`"],
  ["`", "A raw|.", "A raw`|`."],
  ["`", "A `raw|`", "A `raw`|``"],
  ["`abc`", "A |", "A `abc`|"],
  ["`", "A [raw] now", "A `[raw]` now"],
  ['"', "A raw |x now", 'A raw "|x now'],
  ['"', "A raw | now", 'A raw "|" now'],
  ['"', "A raw|", 'A raw"|'],
  ['"', "A raw|.", 'A raw"|.'],
  ['"', 'A "raw|"', 'A "raw"|"'],
  ['"abc"', "A |", 'A "abc"|'],
  ['"', "A [raw] now", 'A "[raw]" now'],
  ["~~", "A raw |x now", "A raw ~~|x now"],
  ["~~", "A raw | now", "A raw ~~|~~ now"],
  ["~~", "A raw|", "A raw~~|~~"],
  ["~~", "A ~~raw|~~", "A ~~raw~~|~~"],
  ["~~abc~~", "A |", "A ~~abc~~|~~"],
  ["~~", "A [raw] now", "A ~~|~~ now"],
];

describe("auto-closing pairs in the web editor match VS Code", () => {
  it.each(CASES)("typing %j into `%s` gives `%s`", (typed, before, after) => {
    const editor = open(SCENE(before));
    expect(type(editor, typed)).toBe(SCENE(after));
  });

  it("steps over one cursor's auto-inserted closer while another cursor inserts", () => {
    const doc = "Intro\n  first\n  second\n";
    const first = doc.indexOf("first") + "first".length;
    const state = EditorState.create({
      doc,
      selection: EditorSelection.cursor(first),
      extensions: [EXTENSION, EditorState.allowMultipleSelections.of(true)],
    });
    expect(ensureSyntaxTree(state, state.doc.length, 10_000)).not.toBeNull();
    const editor = new EditorView({ state, parent: document.body });
    view = editor;
    type(editor, "`");
    const second = editor.state.doc.toString().indexOf("second");
    editor.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(first + 1),
        EditorSelection.cursor(second),
      ]),
    });
    type(editor, "`");
    expect(editor.state.doc.toString()).toBe("Intro\n  first``\n  `second\n");
    expect(editor.state.selection.ranges.map((range) => range.head)).toEqual([
      first + 2,
      second + 1,
    ]);
  });
});
