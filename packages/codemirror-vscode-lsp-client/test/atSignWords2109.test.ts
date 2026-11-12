import { selectNextOccurrence } from "@codemirror/search";
import { cursorGroupRight } from "@codemirror/commands";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { convertConfigToLanguageData } from "../../codemirror-vscode-language/src/utils/convertConfigToLanguageData";
import { wordAt } from "../../codemirror-vscode-language/src/utils/wordAt";
import { evaluatableExpressionRange } from "../../../vscode-sparkdown/src/debugger/evaluatableExpressionRange";
import { hoverExpressionAt, lspContextMenuItems, renameSymbol } from "../src";
import { LSPClient } from "../src/client";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const LANGUAGES = ["sparkdown", "sparkdown-luau"] as const;
const configOf = (language: string) =>
  JSON.parse(readFileSync(join(ROOT, "packages", "sparkdown", "language", `${language}.language-config.json`), "utf8"));
const VSCODE_DEFAULT_SEPARATORS = "`~!@#$%^&*()-=+[{]}\\|;:'\",.<>/?";
const separatorsOf = (language: string): string =>
  JSON.parse(readFileSync(join(ROOT, "vscode-sparkdown", "package.json"), "utf8")).contributes.configurationDefaults[`[${language}]`]?.[
    "editor.wordSeparators"
  ] ?? VSCODE_DEFAULT_SEPARATORS;

const ROWS: [text: string, inside: string][] = [
  ["mia@night", "night"],
  ["@hovered", "hovered"],
  ["@native", "native"],
  ["@click", "click"],
  ["@/a+/", "a"],
  ["_x", "x"],
  ["a_b", "b"],
];

const DOC = ROWS.map(([text]) => `  ${text} `).join("\n");
const lineStart = (row: number) => DOC.split("\n").slice(0, row).join("\n").length + (row ? 1 : 0) + 2;
const inside = (row: number) => lineStart(row) + ROWS[row]![0].indexOf(ROWS[row]![1]) + 1;

const stateOf = (language: string, extra: Record<string, unknown> = {}, selection?: number) =>
  EditorState.create({
    doc: DOC,
    selection: selection === undefined ? undefined : { anchor: selection },
    extensions: [EditorState.languageData.of(() => [{ ...convertConfigToLanguageData(configOf(language)), ...extra }])],
  });

const vscodeClass = (separators: string, char: string | undefined) =>
  char === undefined || /\s/.test(char) ? "space" : separators.includes(char) ? "separator" : "regular";

const vscodeWordAt = (separators: string, text: string, pos: number) => {
  let at = pos;
  if (vscodeClass(separators, text[at]) !== "regular") at -= 1;
  if (vscodeClass(separators, text[at]) !== "regular") return null;
  let from = at;
  let to = at + 1;
  while (vscodeClass(separators, text[from - 1]) === "regular") from -= 1;
  while (vscodeClass(separators, text[to]) === "regular") to += 1;
  return text.slice(from, to);
};

const vscodeWordEndRight = (separators: string, text: string, pos: number) => {
  let at = pos;
  while (vscodeClass(separators, text[at]) === "space") at += 1;
  const kind = vscodeClass(separators, text[at]);
  while (at < text.length && vscodeClass(separators, text[at]) === kind) at += 1;
  return at;
};

const vscodePatternWordAt = (pattern: RegExp, text: string, pos: number) => {
  for (const match of text.matchAll(new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`))) {
    const from = match.index ?? 0;
    if (from > pos) break;
    if (pos <= from + match[0].length && match[0].length > 0) return match[0];
  }
  return null;
};

const views: EditorView[] = [];
afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

const mount = (state: EditorState) => {
  const view = new EditorView({ state, parent: document.body });
  views.push(view);
  return view;
};

describe.each(LANGUAGES)("the web editor and VS Code read the same words in %s (#2109, #2138)", (language) => {
  const separators = separatorsOf(language);

  it("takes VS Code's default separators but for the @", () => {
    expect(separators).toBe("`~!#$%^&*()-=+[{]}\\|;:'\",.<>/?");
  });

  it.each(ROWS.map((row, index) => [row[0], index] as const))("double-click in %s selects the same word", (_, row) => {
    const state = stateOf(language);
    const word = state.wordAt(inside(row))!;
    expect(state.sliceDoc(word.from, word.to)).toBe(vscodeWordAt(separators, DOC, inside(row)));
  });

  it.each(ROWS.map((row, index) => [row[0], index] as const))("next occurrence from inside %s selects the same word", (_, row) => {
    const view = mount(stateOf(language, {}, inside(row)));
    selectNextOccurrence(view);
    const range = view.state.selection.main;
    expect(view.state.sliceDoc(range.from, range.to)).toBe(vscodeWordAt(separators, DOC, inside(row)));
  });

  it.each(ROWS.map((row, index) => [row[0], index] as const))("word movement from the start of %s stops at the same place", (_, row) => {
    const view = mount(stateOf(language, {}, lineStart(row)));
    cursorGroupRight(view);
    expect(view.state.selection.main.head).toBe(vscodeWordEndRight(separators, DOC, lineStart(row)));
  });
});

describe.each(LANGUAGES)("the web editor's language-server lookups read the word VS Code reads in %s (#2109, #2138)", (language) => {
  const { wordPattern } = configOf(language);
  const pattern = new RegExp(wordPattern.pattern, wordPattern.flags);

  it.each(ROWS.map((row, index) => [row[0], index] as const))("evaluates on hover in %s what VS Code's debugger evaluates", (_, row) => {
    const line = DOC.split("\n")[row]!;
    const range = evaluatableExpressionRange(line, inside(row) - (lineStart(row) - 2));
    const hovered = hoverExpressionAt(stateOf(language), inside(row));
    expect(hovered?.text ?? null).toBe(range ? line.slice(range.start, range.end) : null);
  });

  it.each(ROWS.map((row, index) => [row[0], index] as const))("offers the name actions on %s where the wordPattern finds a word", (_, row) => {
    const onName = lspContextMenuItems[0]!.when!;
    expect(onName(stateOf(language), inside(row))).toBe(true);
    const before = lineStart(row);
    expect(onName(stateOf(language), before)).toBe(vscodePatternWordAt(pattern, DOC, before) !== null);
  });

  it.each(ROWS.map((row, index) => [row[0], index] as const))("opens rename on the wordPattern word in %s", (_, row) => {
    const client = new LSPClient();
    vi.spyOn(client, "hasCapability").mockReturnValue(true);
    vi.spyOn(client, "sync").mockImplementation(() => {});
    const opened: unknown[] = [];
    const view = mount(
      EditorState.create({
        doc: DOC,
        selection: { anchor: inside(row) },
        extensions: [
          EditorState.languageData.of(() => [convertConfigToLanguageData(configOf(language))]),
          client.plugin({ uri: "file:///main.sd", version: 1 }, language),
          EditorView.updateListener.of((update) =>
            update.transactions.forEach((tr) => tr.effects.forEach((effect) => opened.push(effect.value))),
          ),
        ],
      }),
    );
    expect(renameSymbol(view)).toBe(true);
    const words = opened.flatMap((value) => (value && typeof value === "object" && "word" in value ? [(value as { word: string }).word] : []));
    expect(words).toEqual([vscodePatternWordAt(pattern, DOC, inside(row))]);
  });

  it.each(ROWS.map((row, index) => [row[0], index] as const))("keeps CodeMirror's own word in %s for a language with no wordPattern", (_, row) => {
    const state = EditorState.create({ doc: DOC, extensions: [EditorState.languageData.of(() => [{ wordChars: configOf(language).wordChars }])] });
    for (const pos of [lineStart(row), inside(row)]) {
      expect(wordAt(state, pos)).toEqual(state.wordAt(pos));
    }
  });
});

describe("the shared word lookup", () => {
  it("finds the word a position touches at either end, as VS Code's getWordAtPosition does", () => {
    const state = EditorState.create({ doc: "mia@night end", extensions: [EditorState.languageData.of(() => [convertConfigToLanguageData(configOf("sparkdown"))])] });
    expect(wordAt(state, 0)).toEqual(EditorSelection.range(0, 9));
    expect(wordAt(state, 9)).toEqual(EditorSelection.range(0, 9));
    expect(wordAt(state, 10)).toEqual(EditorSelection.range(10, 13));
  });
});
