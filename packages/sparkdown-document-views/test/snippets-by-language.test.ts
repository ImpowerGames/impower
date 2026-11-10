import {
  type Completion,
  CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { vscodeLanguage } from "@impower/codemirror-vscode-language/src";
import { convertSnippetToTemplate } from "@impower/codemirror-vscode-language/src/utils/convertSnippetToTemplate";
import { sparkdownGrammarFor } from "@impower/sparkdown/src/compiler/utils/sparkdownGrammarFor";
import {
  SPARKDOWN_EMBEDDED_LANGUAGES,
  SPARKDOWN_LANGUAGE,
  SPARKDOWN_LANGUAGE_CONFIGS,
  SPARKDOWN_LANGUAGE_SNIPPETS,
  SPARKDOWN_LUAU_LANGUAGE,
  sparkdownLanguageFor,
} from "@impower/sparkdown/src/compiler/utils/sparkdownLanguageFor";
import { parseSource } from "@impower/sparkdown/src/tests/compiler/grammarSnapshot";
import { afterEach, describe, expect, it } from "vitest";

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

const SD_URI = "file:///main.sd";
const LUAU_URI = "file:///module.luau";

const FIXTURE_SNIPPETS = {
  [SPARKDOWN_LANGUAGE]: {
    _generated_: ["not a snippet"],
    "Story Fixture": {
      prefix: "storyfix",
      body: "STORY ${1:${TM_SELECTED_TEXT}} and ${2:more}$0",
      description: "A story fixture",
    },
  },
  [SPARKDOWN_LUAU_LANGUAGE]: {
    "Luau Fixture": {
      prefix: "luaufix",
      body: ["local ${1:name} = ${2:value}", "$0"],
      description: "A Luau fixture",
    },
  },
};

const languageExtension = (uri: string, snippets: object) =>
  vscodeLanguage({
    name: "sparkdown",
    grammar: sparkdownGrammarFor(uri),
    language: sparkdownLanguageFor(uri),
    configs: SPARKDOWN_LANGUAGE_CONFIGS as never,
    embeddedLanguages: SPARKDOWN_EMBEDDED_LANGUAGES,
    snippets: snippets as never,
  });

const FIXTURE_EXTENSIONS = new Map([
  [SD_URI, languageExtension(SD_URI, FIXTURE_SNIPPETS)],
  [LUAU_URI, languageExtension(LUAU_URI, FIXTURE_SNIPPETS)],
]);

const SHIPPED_EXTENSION = languageExtension(
  SD_URI,
  SPARKDOWN_LANGUAGE_SNIPPETS,
);

const stateAt = (
  doc: string,
  marker: string,
  uri = SD_URI,
  extension = FIXTURE_EXTENSIONS.get(uri)!,
) => {
  const pos = doc.indexOf(marker) + marker.length;
  expect(doc.indexOf(marker)).toBeGreaterThanOrEqual(0);
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(pos),
    extensions: extension,
  });
  expect(ensureSyntaxTree(state, state.doc.length, 10_000)).not.toBeNull();
  return { state, pos };
};

const snippetResult = (
  state: EditorState,
  pos: number,
  explicit = false,
): CompletionResult | null => {
  const sources = state.languageDataAt<CompletionSource>("autocomplete", pos);
  expect(sources).toHaveLength(1);
  return sources[0]!(
    new CompletionContext(state, pos, explicit),
  ) as CompletionResult | null;
};

const labels = (result: CompletionResult | null) =>
  result?.options.map((option) => option.label) ?? [];

const SCENE = (line: string) => `scene start()\n  ${line}\nend\n`;
const FUNCTION = (line: string) => `function greet(name)\n  ${line}\nend\n`;

describe("the snippet source offers the snippets of the language at the cursor", () => {
  it("offers a story snippet on a scene line", () => {
    const { state, pos } = stateAt(SCENE("storyf"), "storyf");
    const result = snippetResult(state, pos);
    expect(labels(result)).toEqual(["storyfix"]);
    expect(result!.from).toBe(pos - "storyf".length);
  });

  it("does not offer a story snippet inside a function body", () => {
    const { state, pos } = stateAt(FUNCTION("storyf"), "storyf");
    expect(labels(snippetResult(state, pos))).not.toContain("storyfix");
  });

  it("offers a Luau snippet inside a function body", () => {
    const { state, pos } = stateAt(FUNCTION("luauf"), "luauf");
    const result = snippetResult(state, pos);
    expect(labels(result)).toEqual(["luaufix"]);
    expect(result!.from).toBe(pos - "luauf".length);
  });

  it("does not offer a Luau snippet on a scene line", () => {
    const { state, pos } = stateAt(SCENE("luauf"), "luauf");
    expect(labels(snippetResult(state, pos))).not.toContain("luaufix");
  });

  it("offers Luau snippets throughout a .luau document", () => {
    const { state, pos } = stateAt("local x = 1\nluauf", "luauf", LUAU_URI);
    expect(labels(snippetResult(state, pos))).toEqual(["luaufix"]);
  });

  it("lists the cursor language's snippets when opened explicitly with nothing typed", () => {
    const { state, pos } = stateAt(SCENE("Hello "), "Hello ");
    expect(snippetResult(state, pos)).toBeNull();
    expect(labels(snippetResult(state, pos, true))).toEqual(["storyfix"]);
  });
});

describe("a snippet is inserted with its tab stops", () => {
  const views: EditorView[] = [];
  afterEach(() => {
    for (const view of views.splice(0)) view.destroy();
  });

  const accept = (doc: string, marker: string, uri: string, label: string) => {
    const { state, pos } = stateAt(doc, marker, uri);
    const result = snippetResult(state, pos)!;
    const option = result.options.find((o) => o.label === label)!;
    const view = new EditorView({ state, parent: document.body });
    views.push(view);
    (option.apply as Exclude<Completion["apply"], string | undefined>)(
      view,
      option,
      result.from,
      pos,
    );
    return view;
  };

  it("selects the first tab stop of a story snippet", () => {
    const view = accept(SCENE("storyf"), "storyf", SD_URI, "storyfix");
    expect(view.state.doc.toString()).toBe(SCENE("STORY  and more"));
    const first = view.state.doc.toString().indexOf("STORY ") + 6;
    expect(view.state.selection.main.from).toBe(first);
    expect(view.state.selection.main.to).toBe(first);
  });

  it("selects the first placeholder of a multi-line Luau snippet", () => {
    const view = accept(FUNCTION("luauf"), "luauf", SD_URI, "luaufix");
    const doc = view.state.doc.toString();
    expect(doc).toBe(FUNCTION("local name = value\n  "));
    const name = doc.indexOf("name =");
    expect(view.state.selection.main.from).toBe(name);
    expect(view.state.selection.main.to).toBe(name + "name".length);
  });
});

describe("converting a VS Code snippet body to a CodeMirror template", () => {
  it.each([
    ["$1 and $0", "${1} and ${0}"],
    ["${1:a} ${2}", "${1:a} ${2}"],
    ["${1:${TM_SELECTED_TEXT}}", "${1:picked}"],
    ["${1:outer ${2:inner}}", "${1:outer inner}"],
    ["${1|one,two|}", "${1:one}"],
    ["${UNKNOWN_VAR:fallback} $UNKNOWN", "fallback UNKNOWN"],
    ["literal {braces} and \\$1", "literal \\{braces\\} and $1"],
    ["$ alone", "$ alone"],
  ])("%s", (body, template) => {
    expect(convertSnippetToTemplate(body, { TM_SELECTED_TEXT: "picked" })).toBe(
      template,
    );
  });
});

const placeholderText = (body: string | string[]) =>
  convertSnippetToTemplate(body)
    .replace(/\$\{\d+:([^{}]*)\}/g, "$1")
    .replace(/\$\{\d+\}/g, "")
    .replace(/\\([{}])/g, "$1");

const shippedStorySnippets = Object.entries(
  SPARKDOWN_LANGUAGE_SNIPPETS[SPARKDOWN_LANGUAGE]!,
).filter(([name]) => name !== "_generated_") as [
  string,
  { prefix: string | string[]; body: string | string[] },
][];

const SHIPPED_STORY_CONSTRUCTS: Readonly<Record<string, string>> = {};

const nodesSpanning = (source: string, from: number, to: number) => {
  const names: string[] = [];
  const cursor = parseSource(source).cursor();
  do {
    if (cursor.from <= from && cursor.to >= to) names.push(cursor.name);
  } while (cursor.next());
  return names;
};

describe("the shipped story snippets pass the two checks", () => {
  it.skipIf(shippedStorySnippets.length === 0).each(shippedStorySnippets)(
    "%s has no punctuation prefix",
    (_name, { prefix }) => {
      for (const p of [prefix].flat()) {
        expect(p).toMatch(/^[\p{L}\p{N}]/u);
      }
    },
  );

  it.skipIf(shippedStorySnippets.length === 0).each(shippedStorySnippets)(
    "%s body parses as its construct on a scene line",
    (name, { body }) => {
      const construct = SHIPPED_STORY_CONSTRUCTS[name];
      expect(construct, `no expected construct for ${name}`).toBeDefined();
      const text = placeholderText(body);
      const source = SCENE(text);
      const from = source.indexOf(text);
      expect(nodesSpanning(source, from, from + text.length)).toContain(
        construct,
      );
    },
  );

  it("does not open the list on punctuation while typing a sentence of prose", () => {
    const prose = "She said (quietly) *wow* and _then_ left! Done.";
    const doc = SCENE(prose);
    const start = doc.indexOf(prose);
    for (let i = 1; i <= prose.length; i++) {
      const typed = prose.slice(0, i);
      const partial = SCENE(typed);
      const { state, pos } = stateAt(partial, typed, SD_URI, SHIPPED_EXTENSION);
      const result = snippetResult(state, pos);
      expect({
        typed: prose[i - 1],
        at: start + i,
        result: labels(result),
      }).toEqual({ typed: prose[i - 1], at: start + i, result: [] });
    }
  });
});
