import { Text } from "@codemirror/state";
import GRAMMAR_DEFINITION from "@impower/sparkdown/language/sparkdown.language-grammar.json";
import { SparkdownCombinedAnnotator } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { TextEdit } from "vscode-languageserver";
import { describe, expect, test } from "vitest";
import { getDocumentFormattingEdits } from "../../utils/providers/getDocumentFormattingEdits";
import { diffDirtyRange } from "../../utils/providers/getFormatDirtyRange";
import { formatSource } from "./formatSource";

function expectFormatsTo(source: string, expected: string) {
  expect(formatSource(source)).toBe(expected);
  expect(formatSource(expected)).toBe(expected);
}

const parser = new TextmateGrammarParser(GRAMMAR_DEFINITION as any);

function formatAfter(baseline: string, source: string): string {
  const tree = parser.parse(source);
  const doc = new SparkdownDocument("test://f.sd", "sparkdown", 1, source);
  const annotators = new SparkdownCombinedAnnotator();
  annotators.create(tree, Text.of(source.split("\n")));
  const edits: TextEdit[] =
    getDocumentFormattingEdits(
      doc,
      tree,
      annotators.get(),
      {
        tabSize: 2,
        insertSpaces: true,
        trimTrailingWhitespace: true,
        insertFinalNewline: true,
        trimFinalNewlines: true,
      },
      undefined,
      undefined,
      diffDirtyRange(baseline, source) ?? { from: 0, to: 0 },
    ) ?? [];
  let result = source;
  for (const edit of [...edits].sort(
    (a, b) => doc.offsetAt(b.range.start) - doc.offsetAt(a.range.start),
  )) {
    result =
      result.slice(0, doc.offsetAt(edit.range.start)) +
      edit.newText +
      result.slice(doc.offsetAt(edit.range.end));
  }
  return result;
}

test("a local function inside a scene keeps the scene's indent and the lines after it", () => {
  const source = `scene main
  local function j() end
  if true then
    x
  end
end
`;
  expectFormatsTo(source, source);
});

test("a multi-line function inside a scene is indented as part of the scene body", () => {
  expectFormatsTo(
    `scene main
local function j()
print(1)
end
x = 1
end
`,
    `scene main
  local function j()
    print(1)
  end
  x = 1
end
`,
  );
});

test("a function inside a branch of a closed scene keeps the branch's indent", () => {
  const source = `scene main
  branch b
    function j()
      print(1)
    end
    Hello.
  end
end
`;
  expectFormatsTo(source, source);
});

test("a function after a closed scene still starts at column 0 after a blank line", () => {
  expectFormatsTo(
    `scene main
  Hello.
end
  function j()
print(1)
  end
`,
    `scene main
  Hello.
end

function j()
  print(1)
end
`,
  );
});

test("a style written inside a scene indents its body past the scene", () => {
  const source = `scene main
  style panel as button with
    bg-color = surface-2
  end
  Hello.
end
`;
  expectFormatsTo(source, source);
});

test("a layout written inside a branch indents its body past the scene and branch", () => {
  const source = `scene main
  branch b
    layout hud with
      column {
        text "Hello"
      }
    end
  end
end
`;
  expectFormatsTo(source, source);
});

describe("delta formatting after an edit to a scene's closing", () => {
  const BASELINE = formatSource(`local function before() end

scene main
  local function a() end
  local function b() end
end

function after()
  print(1)
end
`);

  const EDITS: { label: string; edit: (text: string) => string }[] = [
    {
      label: "removing the scene's end",
      edit: (text) => text.replace("  local function b() end\nend\n", "  local function b() end\n"),
    },
    {
      label: "opening a branch the scene's end then closes",
      edit: (text) => text.replace("  local function b() end\nend\n", "  local function b() end\n  branch x\nend\n"),
    },
    {
      label: "replacing the scene's end with a declaration",
      edit: (text) => text.replace("  local function b() end\nend\n", "  local function b() end\nfunction c() end\n"),
    },
    {
      label: "closing the scene before its declarations",
      edit: (text) => text.replace("scene main\n", "scene main\nend\n"),
    },
    {
      label: "removing the scene's declaration",
      edit: (text) => text.replace("scene main\n", ""),
    },
    {
      label: "editing a function after the scene",
      edit: (text) => text.replace("  print(1)", "print( 1 )"),
    },
  ];

  for (const { label, edit } of EDITS) {
    test(label, () => {
      const source = edit(BASELINE);
      expect(source).not.toBe(BASELINE);
      expect(formatAfter(BASELINE, source)).toBe(formatSource(source));
    });
  }
});

test("a column-0 call line in a function body is indented", () => {
  expectFormatsTo(
    "function g(c)\nprint(1)\nend\n",
    "function g(c)\n  print(1)\nend\n",
  );
});

test("a column-0 call line in a nested function body is indented by both blocks", () => {
  expectFormatsTo(
    "function g(c)\nif c then\nlocal function h()\nprint(1)\nend\nend\nend\n",
    "function g(c)\n  if c then\n    local function h()\n      print(1)\n    end\n  end\nend\n",
  );
});
