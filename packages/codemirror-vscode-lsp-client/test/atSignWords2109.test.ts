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
import { evaluatableExpressionRange } from "@impower/sparkdown/src/compiler/utils/evaluatableExpressionRange";
import { hoverExpressionAt, hoverExpressions, lspContextMenuItems, renameSymbol } from "../src";
import { LSPClient } from "../src/client";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const LANGUAGES = ["sparkdown", "sparkdown-luau"] as const;
const configOf = (language: string) =>
  JSON.parse(readFileSync(join(ROOT, "packages", "sparkdown", "language", `${language}.language-config.json`), "utf8"));
const extensionDefaults = () => JSON.parse(readFileSync(join(ROOT, "vscode-sparkdown", "package.json"), "utf8")).contributes.configurationDefaults ?? {};

const VSCODE_DEFAULT_SEPARATORS_SOURCE = "editor.wordSeparators default in microsoft/vscode src/vs/editor/common/core/wordHelper.ts USUAL_WORD_SEPARATORS, read 2026-11-12";
const VSCODE_DEFAULT_SEPARATORS = "`~!@#$%^&*()-=+[{]}\\|;:'\",.<>/?";

const ROWS: [text: string, inside: string, word: string][] = [
  ["mia@night", "night", "night"],
  ["@hovered", "hovered", "hovered"],
  ["@native", "native", "native"],
  ["@click", "click", "click"],
  ["@/a+/", "a", "a"],
  ["_x", "x", "_x"],
  ["a_b", "b", "a_b"],
];
const NAMES: Record<string, string | null> = {
  "mia@night": "mia@night",
  "@hovered": "hovered",
  "@native": "native",
  "@click": "click",
  "@/a+/": "a",
  _x: "x",
  a_b: "a_b",
};

const DOC = ROWS.map(([text]) => `  ${text} `).join("\n");
const lineStart = (row: number) => DOC.split("\n").slice(0, row).join("\n").length + (row ? 1 : 0) + 2;
const inside = (row: number) => lineStart(row) + ROWS[row]![0].indexOf(ROWS[row]![1]) + 1;
const rowsOf = () => ROWS.map((row, index) => [row[0], index] as const);

const stateOf = (language: string, selection?: number, extensions: unknown[] = []) =>
  EditorState.create({
    doc: DOC,
    selection: selection === undefined ? undefined : { anchor: selection },
    extensions: [EditorState.languageData.of(() => [convertConfigToLanguageData(configOf(language))]), ...(extensions as [])],
  });

const vscodeClass = (char: string | undefined) =>
  char === undefined || /\s/.test(char) ? "space" : VSCODE_DEFAULT_SEPARATORS.includes(char) ? "separator" : "regular";

const vscodeWordAt = (text: string, pos: number) => {
  let at = pos;
  if (vscodeClass(text[at]) !== "regular") at -= 1;
  if (vscodeClass(text[at]) !== "regular") return null;
  let from = at;
  let to = at + 1;
  while (vscodeClass(text[from - 1]) === "regular") from -= 1;
  while (vscodeClass(text[to]) === "regular") to += 1;
  return text.slice(from, to);
};

const vscodeStopsAtTheAt = (text: string, pos: number) => {
  let at = pos;
  const kind = vscodeClass(text[at]);
  while (at < text.length && vscodeClass(text[at]) === kind) at += 1;
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

describe.each(LANGUAGES)("both editors split words at the @ in %s (#2109, #2138)", (language) => {
  it("leaves VS Code's default word separators in place", () => {
    expect(extensionDefaults()[`[${language}]`]?.["editor.wordSeparators"]).toBeUndefined();
    expect(VSCODE_DEFAULT_SEPARATORS).toContain("@");
    expect(VSCODE_DEFAULT_SEPARATORS_SOURCE).toContain("USUAL_WORD_SEPARATORS");
  });

  it("does not make the @ a word character", () => {
    expect(configOf(language).wordChars).not.toContain("@");
  });

  it.each(ROWS.map((row, index) => [row[0], row[2], index] as const))("double-click in %s selects %s", (_, word, row) => {
    const state = stateOf(language);
    const range = state.wordAt(inside(row))!;
    expect(state.sliceDoc(range.from, range.to)).toBe(word);
    expect(vscodeWordAt(DOC, inside(row))).toBe(word);
  });

  it.each(ROWS.map((row, index) => [row[0], row[2], index] as const))("next occurrence from inside %s selects %s", (_, word, row) => {
    const view = mount(stateOf(language, inside(row)));
    selectNextOccurrence(view);
    const range = view.state.selection.main;
    expect(view.state.sliceDoc(range.from, range.to)).toBe(word);
  });

  it("word movement from the start of mia@night stops at the @ in both editors", () => {
    const row = 0;
    const view = mount(stateOf(language, lineStart(row)));
    cursorGroupRight(view);
    expect(view.state.selection.main.head).toBe(lineStart(row) + "mia".length);
    expect(vscodeStopsAtTheAt(DOC, lineStart(row))).toBe(lineStart(row) + "mia".length);
  });

  it.each(rowsOf())("word movement from inside the word of %s stops at that word's end", (_, row) => {
    const start = inside(row) - 1;
    const view = mount(stateOf(language, start));
    cursorGroupRight(view);
    expect(view.state.selection.main.head).toBe(vscodeStopsAtTheAt(DOC, start));
  });
});

describe.each(LANGUAGES)("the web editor's name readers take the whole @ name in %s (#2109, #2138)", (language) => {
  const { wordPattern } = configOf(language);
  const pattern = new RegExp(wordPattern.pattern, wordPattern.flags);

  it.each(rowsOf())("reads the wordPattern name in %s", (text, row) => {
    expect(vscodePatternWordAt(pattern, DOC, inside(row))).toBe(NAMES[text]);
    const range = wordAt(stateOf(language), inside(row))!;
    expect(DOC.slice(range.from, range.to)).toBe(NAMES[text]);
  });

  it.each(rowsOf())("evaluates on hover in %s what VS Code's debugger evaluates", (_, row) => {
    const line = DOC.split("\n")[row]!;
    const character = inside(row) - (lineStart(row) - 2);
    const range = evaluatableExpressionRange(line, character);
    const hovered = hoverExpressionAt(stateOf(language, undefined, [hoverExpressions.of(evaluatableExpressionRange)]), inside(row));
    expect(hovered?.text ?? null).toBe(range ? line.slice(range.start, range.end) : null);
  });

  it("evaluates mia@night whole on hover", () => {
    const hovered = hoverExpressionAt(stateOf(language, undefined, [hoverExpressions.of(evaluatableExpressionRange)]), inside(0));
    expect(hovered?.text).toBe("mia@night");
  });

  it.each(rowsOf())("offers the name actions on %s where the wordPattern finds a name", (_, row) => {
    const item = lspContextMenuItems[0]!;
    if (!("when" in item) || !item.when) throw new Error("the Rename item has no condition");
    const onName = item.when;
    expect(onName(stateOf(language), inside(row))).toBe(true);
    const before = lineStart(row);
    expect(onName(stateOf(language), before)).toBe(vscodePatternWordAt(pattern, DOC, before) !== null);
  });

  const openRename = (anchor: number) => {
    const client = new LSPClient();
    vi.spyOn(client, "hasCapability").mockReturnValue(true);
    vi.spyOn(client, "sync").mockImplementation(() => {});
    const opened: unknown[] = [];
    const view = mount(
      EditorState.create({
        doc: DOC,
        selection: { anchor },
        extensions: [
          EditorState.languageData.of(() => [convertConfigToLanguageData(configOf(language))]),
          client.plugin({ uri: "file:///main.sd", version: 1 }, language),
          EditorView.updateListener.of((update) =>
            update.transactions.forEach((tr) => tr.effects.forEach((effect) => opened.push(effect.value))),
          ),
        ],
      }),
    );
    const ran = renameSymbol(view);
    const words = opened.flatMap((value) => (value && typeof value === "object" && "word" in value ? [(value as { word: string }).word] : []));
    return { ran, words };
  };

  it.each(rowsOf())("opens rename on the wordPattern name in %s", (text, row) => {
    expect(openRename(inside(row))).toEqual({ ran: true, words: [NAMES[text]] });
  });

  it.each(rowsOf())("opens rename without throwing at the start of %s", (_, row) => {
    const before = lineStart(row);
    const name = vscodePatternWordAt(pattern, DOC, before);
    let opened: ReturnType<typeof openRename> | undefined;
    expect(() => (opened = openRename(before))).not.toThrow();
    if (name !== null) expect(opened?.words).toEqual([name]);
  });

  it.each(rowsOf())("keeps CodeMirror's own word in %s for a language with no wordPattern", (_, row) => {
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
