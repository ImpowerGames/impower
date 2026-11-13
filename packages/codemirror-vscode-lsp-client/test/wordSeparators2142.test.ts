import { selectNextOccurrence } from "@codemirror/search";
import { cursorGroupLeft, cursorGroupRight } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { convertConfigToLanguageData } from "../../codemirror-vscode-language/src/utils/convertConfigToLanguageData";
import { wordAt } from "../../codemirror-vscode-language/src/utils/wordAt";
import { evaluatableExpressionRange } from "@impower/sparkdown/src/compiler/utils/evaluatableExpressionRange";
import { hoverExpressionAt, hoverExpressions } from "../src";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const LANGUAGES = ["sparkdown", "sparkdown-luau"] as const;
const configOf = (language: string) =>
  JSON.parse(readFileSync(join(ROOT, "packages", "sparkdown", "language", `${language}.language-config.json`), "utf8"));

const VSCODE_DEFAULT_SEPARATORS = "`~!@#$%^&*()-=+[{]}\\|;:'\",.<>/?";

const ROWS: [text: string, inside: string, word: string, name: string, hover: string | null][] = [
  ["bg-color", "color", "color", "color", "color"],
  ["don't", "t", "t", "don't", "t"],
  ["a-b", "b", "b", "b", "b"],
];

const DOC = ROWS.map(([text]) => `  ${text} `).join("\n");
const lineStart = (row: number) => DOC.split("\n").slice(0, row).join("\n").length + (row ? 1 : 0) + 2;
const inside = (row: number) => lineStart(row) + ROWS[row]![0].lastIndexOf(ROWS[row]![1]);
const rows = () => ROWS.map((row, index) => [row[0], row, index] as const);

const stateOf = (language: string, selection?: number, extensions: unknown[] = []) =>
  EditorState.create({
    doc: DOC,
    selection: selection === undefined ? undefined : { anchor: selection },
    extensions: [EditorState.languageData.of(() => [convertConfigToLanguageData(configOf(language))]), ...(extensions as [])],
  });

const vscodeClass = (char: string | undefined) =>
  char === undefined || /\s/.test(char) ? "space" : VSCODE_DEFAULT_SEPARATORS.includes(char) ? "separator" : "regular";

const vscodeWordAt = (text: string, pos: number) => {
  if (vscodeClass(text[pos]) !== "regular") return null;
  let from = pos;
  let to = pos + 1;
  while (vscodeClass(text[from - 1]) === "regular") from -= 1;
  while (vscodeClass(text[to]) === "regular") to += 1;
  return text.slice(from, to);
};

const views: EditorView[] = [];
afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  document.body.innerHTML = "";
});

const mount = (state: EditorState) => {
  const view = new EditorView({ state, parent: document.body });
  views.push(view);
  return view;
};

describe.each(LANGUAGES)("the web editor splits words at - and ' like VS Code in %s (#2142)", (language) => {
  it("keeps - and ' out of the word characters", () => {
    expect(configOf(language).wordChars ?? "").not.toMatch(/[-']/);
  });

  it.each(rows())("double-click inside %s selects the part VS Code selects", (_, [, , word], row) => {
    const state = stateOf(language);
    const range = state.wordAt(inside(row))!;
    expect(state.sliceDoc(range.from, range.to)).toBe(word);
    expect(vscodeWordAt(DOC, inside(row))).toBe(word);
  });

  it.each(rows())("next occurrence from inside %s selects the part", (_, [, , word], row) => {
    const view = mount(stateOf(language, inside(row)));
    selectNextOccurrence(view);
    const range = view.state.selection.main;
    expect(view.state.sliceDoc(range.from, range.to)).toBe(word);
  });

  it.each(rows())("word movement right from the start of %s stops at the separator", (text, _, row) => {
    const view = mount(stateOf(language, lineStart(row)));
    cursorGroupRight(view);
    expect(view.state.selection.main.head).toBe(lineStart(row) + text.search(/[-']/));
  });

  it.each(rows())("word movement left from the end of %s stops after the separator", (text, _, row) => {
    const view = mount(stateOf(language, lineStart(row) + text.length));
    cursorGroupLeft(view);
    expect(view.state.selection.main.head).toBe(lineStart(row) + text.search(/[-']/) + 1);
  });
});

describe.each(LANGUAGES)("the web editor's name readers keep their reading in %s (#2142)", (language) => {
  it.each(rows())("rename and completion read the wordPattern name in %s", (_, [, , , name], row) => {
    const range = wordAt(stateOf(language), inside(row))!;
    expect(DOC.slice(range.from, range.to)).toBe(name);
  });

  it.each(rows())("hover evaluates what VS Code's debugger evaluates in %s", (_, [, , , , hover], row) => {
    const line = DOC.split("\n")[row]!;
    const character = inside(row) - (lineStart(row) - 2);
    const range = evaluatableExpressionRange(line, character);
    const hovered = hoverExpressionAt(stateOf(language, undefined, [hoverExpressions.of(evaluatableExpressionRange)]), inside(row));
    expect(hovered?.text ?? null).toBe(range ? line.slice(range.start, range.end) : null);
    expect(hovered?.text ?? null).toBe(hover);
  });
});
