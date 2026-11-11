import { insertNewlineAndIndent } from "@codemirror/commands";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { vscodeLanguage } from "@impower/codemirror-vscode-language/src";
import { onEnterRulesCommand } from "@impower/codemirror-vscode-language/src/extensions/vscodeOnEnterRules";
import { sparkdownGrammarFor } from "@impower/sparkdown/src/compiler/utils/sparkdownGrammarFor";
import {
  SPARKDOWN_EMBEDDED_LANGUAGES,
  SPARKDOWN_LANGUAGE_CONFIGS,
  sparkdownLanguageFor,
} from "@impower/sparkdown/src/compiler/utils/sparkdownLanguageFor";
import { afterEach, describe, expect, it, vi } from "vitest";

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

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

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
});

const createState = (source: string, uri: string) => {
  const cursor = source.indexOf("|");
  expect(cursor).toBeGreaterThanOrEqual(0);
  return EditorState.create({
    doc: source.replace("|", ""),
    selection: EditorSelection.cursor(cursor),
    extensions: EXTENSIONS.get(uri)!,
  });
};

const open = (state: EditorState) => {
  view = new EditorView({ state, parent: document.body });
  return view;
};

const parsedView = (source: string, uri: string) => {
  const state = createState(source, uri);
  expect(ensureSyntaxTree(state, state.doc.length, 10_000)).not.toBeNull();
  return open(state);
};

const withCursor = (editor: EditorView) => {
  const doc = editor.state.doc.toString();
  const head = editor.state.selection.main.head;
  return doc.slice(0, head) + "|" + doc.slice(head);
};

const pressEnter = (editor: EditorView) => {
  expect(onEnterRulesCommand(editor) || insertNewlineAndIndent(editor)).toBe(
    true,
  );
  return withCursor(editor);
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
  return withCursor(editor);
};

const SCENE = (line: string) => `scene start()\n  ${line}\nend\n`;
const FUNCTION = (line: string) => `function f()\n  ${line}\nend\n`;

describe("Enter in the web editor follows the language at the cursor", () => {
  it("keeps the indentation after a prose line ending in `do`", () => {
    const editor = parsedView(SCENE("What should I do|"), SD_URI);
    expect(pressEnter(editor)).toBe(SCENE("What should I do\n  |"));
  });

  it.each(["And then", "Or else", "She left the scene", "We reached a new branch"])(
    "keeps the indentation after the prose line `%s`",
    (line) => {
      const editor = parsedView(SCENE(`${line}|`), SD_URI);
      expect(pressEnter(editor)).toBe(SCENE(`${line}\n  |`));
    },
  );

  it("indents after `if x then` in a scene", () => {
    const editor = parsedView(SCENE("if x then|"), SD_URI);
    expect(pressEnter(editor)).toBe(SCENE("if x then\n    |"));
  });

  it("indents after `for i = 1, 3 do` in a scene, whose last word is story text", () => {
    const editor = parsedView(SCENE("for i = 1, 3 do|"), SD_URI);
    expect(pressEnter(editor)).toBe(SCENE("for i = 1, 3 do\n    |"));
  });

  it("indents after `if a then` inside a function body", () => {
    const editor = parsedView(FUNCTION("if a then|"), SD_URI);
    expect(pressEnter(editor)).toBe(FUNCTION("if a then\n    |"));
  });

  it("splits `if a then` from its `end` inside a function body", () => {
    const editor = parsedView(FUNCTION("if a then| end"), SD_URI);
    expect(pressEnter(editor)).toBe(FUNCTION("if a then\n    |\n  end"));
  });

  it("keeps a bullet's indentation in a scene", () => {
    const editor = parsedView(SCENE("+ Go left|"), SD_URI);
    expect(pressEnter(editor)).toBe(SCENE("+ Go left\n  |"));
  });
});

const VSCODE_HEADER_ENTER: [header: string, close: string, indent: string, indents: boolean][] = [
  ["scene name", "end", "", true],
  ["branch name", "end", "", true],
  ["define Hero with", "end", "", false],
  ["define companion as character with", "end", "", false],
  ["function f()", "end", "", false],
  ["layout sheet {", "}", "", true],
  ["style list {", "}", "", true],
  ["component card(title) {", "}", "", true],
  ["screen hud {", "}", "", true],
  ["animation fade {", "}", "", true],
  ["theme label {", "}", "", true],
  ["morph blink {", "}", "", true],
  ["if x then", "end", "  ", true],
  ["for i = 1, 3 do", "end", "  ", true],
  ["while x do", "end", "  ", true],
];

const headerSource = (header: string, close: string, indent: string, body: string) => {
  const block = `${indent}${header}${body}\n${indent}${close}\n`;
  return indent ? `scene start()\n${block}end\n` : block;
};

describe("Enter after a block header agrees with VS Code, which reads the cursor's run of one language", () => {
  it.each(VSCODE_HEADER_ENTER)("`%s`", (header, close, indent, indents) => {
    const editor = parsedView(headerSource(header, close, indent, "|"), SD_URI);
    const next = indents ? `${indent}  ` : indent;
    expect(pressEnter(editor)).toBe(headerSource(header, close, indent, `\n${next}|`));
  });

  for (const header of ["define Hero with", "define companion as character with", "function f()"]) {
    it.fails(`indents after \`${header}\` once the header stays story through its body's opening (I-2090)`, () => {
      const editor = parsedView(headerSource(header, "end", "", "|"), SD_URI);
      expect(pressEnter(editor)).toBe(headerSource(header, "end", "", "\n  |"));
    });
  }
});

describe("auto-closing pairs in the web editor follow the language at the cursor", () => {
  it("inserts `::` alone inside a Luau expression", () => {
    const editor = parsedView(FUNCTION("local y = x :|"), SD_URI);
    expect(type(editor, ":")).toBe(FUNCTION("local y = x ::|"));
  });

  it("inserts the closing `::` in story text", () => {
    const editor = parsedView(SCENE("Hello :|"), SD_URI);
    expect(type(editor, ":")).toBe(SCENE("Hello ::|::"));
  });

  it("inserts `]]` after `--[[` inside a function body", () => {
    const editor = parsedView(FUNCTION("--[|"), SD_URI);
    expect(type(editor, "[")).toBe(FUNCTION("--[[|]]"));
  });

  it("inserts nothing more than the bracket's own `]` after `--[[` in story text", () => {
    const editor = parsedView(SCENE("--[|"), SD_URI);
    expect(type(editor, "[")).toBe(SCENE("--[[|]"));
  });

  it("closes a typed `--[=[` with `]=]` inside a function body", () => {
    const editor = parsedView(FUNCTION("|"), SD_URI);
    expect(type(editor, "--[=[")).toBe(FUNCTION("--[=[|]=]"));
  });

  it("closes a typed `--[=[` as brackets only in story text", () => {
    const editor = parsedView(SCENE("|"), SD_URI);
    expect(type(editor, "--[=[")).toBe(SCENE("--[=[|]]"));
  });
});

describe("a .luau document", () => {
  it("indents after `if a then`", () => {
    const editor = parsedView("if a then|\n", LUAU_URI);
    expect(pressEnter(editor)).toBe("if a then\n  |\n");
  });

  it("indents after `local f = function()`", () => {
    const editor = parsedView("local f = function()|\n", LUAU_URI);
    expect(pressEnter(editor)).toBe("local f = function()\n  |\n");
  });

  it("closes `--[[` with `]]`", () => {
    const editor = parsedView("--[|\n", LUAU_URI);
    expect(type(editor, "[")).toBe("--[[|]]\n");
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
  const source = (line: string) =>
    ["scene start()", ...STORY_LINES, "end", "", FUNCTION(line)].join("\n");

  const budgetSpentView = (line: string) => {
    const state = withParseBudgetSpent(() =>
      createState(source(line), SD_URI),
    );
    expect(syntaxTree(state).length).toBeLessThan(state.selection.main.head);
    return open(state);
  };

  it("inserts `::` alone inside a Luau expression", () => {
    const editor = budgetSpentView("local y = x :|");
    expect(type(editor, ":")).toBe(source("local y = x ::|"));
  });

  it("inserts `]]` after `--[[` inside a function body", () => {
    const editor = budgetSpentView("--[|");
    expect(type(editor, "[")).toBe(source("--[[|]]"));
  });

  it("splits `if a then` from its `end` inside a function body", () => {
    const editor = budgetSpentView("if a then| end");
    expect(pressEnter(editor)).toBe(source("if a then\n    |\n  end"));
  });
});
