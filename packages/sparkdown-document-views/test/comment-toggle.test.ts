import { toggleBlockComment, toggleComment } from "@codemirror/commands";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  type SelectionRange,
  type StateCommand,
} from "@codemirror/state";
import { vscodeLanguage } from "@impower/codemirror-vscode-language/src";
import { vscodeCommentTokens } from "@impower/codemirror-vscode-language/src/extensions/vscodeCommentTokens";
import { type TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { createLanguageReader } from "@impower/textmate-grammar-tree/src/tree/utils/createLanguageReader";
import { sparkdownGrammarFor } from "@impower/sparkdown/src/compiler/utils/sparkdownGrammarFor";
import {
  SPARKDOWN_EMBEDDED_LANGUAGES,
  SPARKDOWN_LANGUAGE_CONFIGS,
  sparkdownLanguageFor,
} from "@impower/sparkdown/src/compiler/utils/sparkdownLanguageFor";
import { loadGrammarCorpus } from "@impower/sparkdown/src/tests/compiler/languageEquality";
import {
  LINE_COMMENT_MARKERS,
  lineCommentResults,
} from "@impower/sparkdown/src/tests/compiler/lineComments";
import { describe, expect, it, test, vi } from "vitest";

const SD_URI = "file:///main.sd";
const LUAU_URI = "file:///module.luau";

const languageExtension = (uri: string) =>
  vscodeLanguage({
    name: "sparkdown",
    grammar: sparkdownGrammarFor(uri),
    language: sparkdownLanguageFor(uri),
    configs: SPARKDOWN_LANGUAGE_CONFIGS as never,
    embeddedLanguages: SPARKDOWN_EMBEDDED_LANGUAGES,
  });

const EXTENSIONS = new Map([
  [SD_URI, languageExtension(SD_URI)],
  [LUAU_URI, languageExtension(LUAU_URI)],
]);

const parsedState = (
  doc: string,
  uri: string,
  selection: EditorSelection | SelectionRange,
) => {
  const state = EditorState.create({
    doc,
    selection,
    extensions: EXTENSIONS.get(uri)!,
  });
  expect(ensureSyntaxTree(state, state.doc.length, 10_000)).not.toBeNull();
  return state;
};

const run = (command: StateCommand, state: EditorState): EditorState => {
  let next = state;
  command({
    state,
    dispatch: (tr) => {
      next = tr.state;
    },
  });
  return next;
};

const toggleLines = (
  doc: string,
  fromLine: number,
  toLine: number,
  uri = SD_URI,
): string => {
  const text = EditorState.create({ doc }).doc;
  const from = text.line(fromLine).from;
  const to = text.line(toLine).to;
  return run(
    toggleComment,
    parsedState(doc, uri, EditorSelection.create([EditorSelection.range(from, to)])),
  ).doc.toString();
};

const FIXTURES = loadGrammarCorpus();

describe("toggleComment on each line of the grammar fixtures", () => {
  for (const luauFile of [false, true]) {
    const uri = luauFile ? LUAU_URI : SD_URI;
    describe(luauFile ? ".luau root" : ".sd root", () => {
      for (const fixture of FIXTURES) {
        test(fixture.name, async () => {
          const source = fixture.source.replace(/\r\n?/g, "\n");
          const results = await lineCommentResults(source, { luauFile });
          const state = parsedState(source, uri, EditorSelection.cursor(0));
          const failures: string[] = [];
          for (const result of results) {
            if (result.skipped) continue;
            const line = state.doc.line(result.line);
            const indent = line.text.search(/\S/);
            const marker = LINE_COMMENT_MARKERS[result.language]!;
            const body = line.text.slice(indent);
            const expected = body.startsWith(marker)
              ? line.text.slice(0, indent) +
                body.slice(marker.length).replace(/^ /, "")
              : result.commented;
            const commented = run(
              toggleComment,
              state.update({ selection: EditorSelection.cursor(line.from) }).state,
            );
            const commentedText = commented.doc.line(result.line).text;
            if (commentedText !== expected || !result.readAsComment) {
              failures.push(
                `line ${result.line} [${result.language}] toggled to ${JSON.stringify(commentedText)}, expected ${JSON.stringify(expected)}, and ${JSON.stringify(result.commented)} read as a comment (${result.readAsComment})`,
              );
              continue;
            }
            const restored = run(toggleComment, commented).doc.toString();
            if (restored !== source) {
              failures.push(
                `line ${result.line} [${result.language}] toggled twice to ${JSON.stringify(
                  restored.split("\n")[result.line - 1],
                )}`,
              );
            }
          }
          expect(failures).toEqual([]);
        });
      }
    });
  }
});

const SCRIPT = [
  "scene start()",
  "  Hello there",
  "  How are you",
  "end",
  "",
  "function greet(name)",
  '  local greeting = "Hello, "',
  "  return greeting .. name",
  "end",
  "Goodbye",
].join("\n");

describe("toggleComment over a selection", () => {
  it("comments every line with // when the selection starts on a story line", () => {
    expect(toggleLines(SCRIPT, 2, 7)).toBe(
      [
        "scene start()",
        "//   Hello there",
        "//   How are you",
        "// end",
        "",
        "// function greet(name)",
        '//   local greeting = "Hello, "',
        "  return greeting .. name",
        "end",
        "Goodbye",
      ].join("\n"),
    );
  });

  it("comments every line with -- when the selection starts inside a function body", () => {
    expect(toggleLines(SCRIPT, 7, 10)).toBe(
      [
        "scene start()",
        "  Hello there",
        "  How are you",
        "end",
        "",
        "function greet(name)",
        '--   local greeting = "Hello, "',
        "--   return greeting .. name",
        "-- end",
        "-- Goodbye",
      ].join("\n"),
    );
  });

  it("comments a dialogue line with // and a function body line with --", () => {
    expect(toggleLines(SCRIPT, 2, 2).split("\n")[1]).toBe("  // Hello there");
    expect(toggleLines(SCRIPT, 8, 8).split("\n")[7]).toBe(
      "  -- return greeting .. name",
    );
  });
});

describe("a .luau document", () => {
  it("toggles its first line with --", () => {
    expect(toggleLines("local x = 1\nreturn x\n", 1, 1, LUAU_URI)).toBe(
      "-- local x = 1\nreturn x\n",
    );
  });
});

describe("toggleBlockComment", () => {
  it("wraps a story selection in /* */ and unwraps it again", () => {
    const text = EditorState.create({ doc: SCRIPT }).doc;
    const from = text.line(2).from + 2;
    const to = text.line(3).to;
    const state = parsedState(
      SCRIPT,
      SD_URI,
      EditorSelection.create([EditorSelection.range(from, to)]),
    );
    const wrapped = run(toggleBlockComment, state);
    expect(wrapped.doc.toString().split("\n").slice(1, 3)).toEqual([
      "  /* Hello there",
      "  How are you */",
    ]);
    expect(ensureSyntaxTree(wrapped, wrapped.doc.length, 10_000)).not.toBeNull();
    expect(run(toggleBlockComment, wrapped).doc.toString()).toBe(SCRIPT);
  });

  it("wraps a selection inside a function body in --[[ ]]", () => {
    const text = EditorState.create({ doc: SCRIPT }).doc;
    const line = text.line(8);
    const state = parsedState(
      SCRIPT,
      SD_URI,
      EditorSelection.create([EditorSelection.range(line.from + 2, line.to)]),
    );
    expect(run(toggleBlockComment, state).doc.line(8).text).toBe(
      "  --[[ return greeting .. name ]]",
    );
  });
});

describe("a position the tree has not reached", () => {
  it.each([
    [SD_URI, "  // local x = 1"],
    [LUAU_URI, "  -- local x = 1"],
  ])("takes the document's language in %s", (uri, expected) => {
    const grammar = (
      EXTENSIONS.get(uri)!.language.parser as TextmateGrammarParser
    ).grammar;
    const state = EditorState.create({
      doc: "function f()\n  local x = 1\nend",
      selection: EditorSelection.cursor(14),
      extensions: vscodeCommentTokens(
        createLanguageReader(grammar, SPARKDOWN_EMBEDDED_LANGUAGES),
        sparkdownLanguageFor(uri),
        SPARKDOWN_LANGUAGE_CONFIGS as never,
      ),
    });
    expect(syntaxTree(state).length).toBe(0);
    expect(run(toggleComment, state).doc.line(2).text).toBe(expected);
  });
});

const withParseBudgetSpent = <T>(f: () => T): T => {
  let now = Date.now();
  const spy = vi.spyOn(Date, "now").mockImplementation(() => (now += 1_000));
  try {
    return f();
  } finally {
    spy.mockRestore();
  }
};

describe("a line the state's tree stops short of, after the parse budget ran out", () => {
  const STORY_LINES = Array.from({ length: 30 }, (_, i) => `  Line ${i}`);
  const DOC = [
    "scene start()",
    ...STORY_LINES,
    "end",
    "",
    "function f()",
    "  local x = 1",
    "  return x",
    "end",
    "",
  ].join("\n");
  const LUAU_LINE = STORY_LINES.length + 5;

  it("comments a Luau line with --", () => {
    const state = withParseBudgetSpent(() =>
      EditorState.create({ doc: DOC, extensions: EXTENSIONS.get(SD_URI)! }),
    );
    const line = state.doc.line(LUAU_LINE);
    expect(syntaxTree(state).length).toBeLessThan(line.from);
    const next = run(
      toggleComment,
      state.update({ selection: EditorSelection.cursor(line.from) }).state,
    );
    expect(next.doc.line(LUAU_LINE).text).toBe("  -- local x = 1");
  });

  it("uncomments a commented Luau line instead of adding //", () => {
    const commentedDoc = DOC.replace("  local x = 1", "  -- local x = 1");
    const state = withParseBudgetSpent(() =>
      EditorState.create({ doc: commentedDoc, extensions: EXTENSIONS.get(SD_URI)! }),
    );
    const line = state.doc.line(LUAU_LINE);
    expect(syntaxTree(state).length).toBeLessThan(line.from);
    const next = run(
      toggleComment,
      state.update({ selection: EditorSelection.cursor(line.from) }).state,
    );
    expect(next.doc.toString()).toBe(DOC);
  });
});
