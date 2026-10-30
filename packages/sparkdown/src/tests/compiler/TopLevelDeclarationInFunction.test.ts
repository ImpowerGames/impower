import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

interface Diag {
  message: string;
  severity: number;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
}

function compile(source: string): {
  diags: Diag[];
  context: Record<string, Record<string, unknown> | undefined>;
} {
  const uri = "inmemory:///main.sd";
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({ textDocument: { uri } });
  const diags: Diag[] = [];
  for (const docDiagnostics of Object.values(result.program.diagnostics ?? {})) {
    for (const d of docDiagnostics as any[]) {
      diags.push({
        message: typeof d.message === "string" ? d.message : d.message?.value,
        severity: d.severity,
        startLine: d.range?.start?.line,
        startCharacter: d.range?.start?.character,
        endLine: d.range?.end?.line,
        endCharacter: d.range?.end?.character,
      });
    }
  }
  return { diags, context: (result.program as any).context ?? {} };
}

const DECLARATIONS = [
  {
    keyword: "layout",
    name: "form",
    lines: ["layout form with", '  text "G: {g}"', '  button "Go" @click={ g = 1 }', "end"],
  },
  { keyword: "component", name: "card", lines: ["component card with", "  box {", "  }", "end"] },
  { keyword: "style", name: "fancy", lines: ["style fancy with", "  color = red", "end"] },
  { keyword: "screen", name: "menu", lines: ["screen menu with", "end"] },
  { keyword: "animation", name: "wobble", lines: ["animation wobble with", "  duration = 1", "end"] },
  { keyword: "theme", name: "dusk", lines: ["theme dusk with", "  g = 1", "end"] },
] as const;

const indent = (lines: readonly string[], n: number) =>
  lines.map((line) => " ".repeat(n) + line);

const SHAPES: Record<
  string,
  { line: number; column: number; source: (decl: readonly string[]) => string }
> = {
  "a function's body": {
    line: 2,
    column: 2,
    source: (decl) =>
      ["store g = 0", "function f()", ...indent(decl, 2), "  return 0", "end", "scene start", "  Go {f()}.", "end", ""].join("\n"),
  },
  "a nested local function's body": {
    line: 3,
    column: 4,
    source: (decl) =>
      [
        "store g = 0",
        "function f()",
        "  local function h()",
        ...indent(decl, 4),
        "    return 1",
        "  end",
        "  return h()",
        "end",
        "scene start",
        "  Go {f()}.",
        "end",
        "",
      ].join("\n"),
  },
  "a function value's body": {
    line: 3,
    column: 4,
    source: (decl) =>
      [
        "store g = 0",
        "function f()",
        "  local h = function()",
        ...indent(decl, 4),
        "    return 1",
        "  end",
        "  return h()",
        "end",
        "scene start",
        "  Go {f()}.",
        "end",
        "",
      ].join("\n"),
  },
  "an if block in a function": {
    line: 3,
    column: 4,
    source: (decl) =>
      [
        "store g = 0",
        "function f()",
        "  if g == 0 then",
        ...indent(decl, 4),
        "  end",
        "  return 0",
        "end",
        "scene start",
        "  Go {f()}.",
        "end",
        "",
      ].join("\n"),
  },
  "a define's `function` method": {
    line: 3,
    column: 4,
    source: (decl) =>
      [
        "store g = 0",
        "define thing with",
        "  function go()",
        ...indent(decl, 4),
        "    return 0",
        "  end",
        "end",
        "scene start",
        "  Go.",
        "end",
        "",
      ].join("\n"),
  },
  "a define's method": {
    line: 3,
    column: 4,
    source: (decl) =>
      ["store g = 0", "define thing with", "  go()", ...indent(decl, 4), "    return 0", "  end", "end", "scene start", "  Go.", "end", ""].join(
        "\n",
      ),
  },
};

const message = (keyword: string) =>
  `'${keyword}' is a top-level declaration and cannot be written inside a function`;

describe("a top-level Sparkle declaration inside a function (I-1405)", () => {
  for (const decl of DECLARATIONS) {
    for (const [where, shape] of Object.entries(SHAPES)) {
      test(`\`${decl.keyword}\` in ${where} is one error on its keyword and registers nothing`, () => {
        const { diags, context } = compile(shape.source(decl.lines));
        expect(diags).toEqual([
          {
            message: message(decl.keyword),
            severity: 1,
            startLine: shape.line,
            startCharacter: shape.column,
            endLine: shape.line,
            endCharacter: shape.column + decl.keyword.length,
          },
        ]);
        expect(context[decl.keyword]?.[decl.name]).toBeUndefined();
      });
    }

    test(`\`${decl.keyword}\` at the top level still registers with no diagnostic`, () => {
      const source = ["store g = 0", ...decl.lines, "function f()", "  return 0", "end", "scene start", "  Go {f()}.", "end", ""].join("\n");
      const { diags, context } = compile(source);
      expect(diags).toEqual([]);
      expect(context[decl.keyword]?.[decl.name]).toBeDefined();
    });

    test(`\`${decl.keyword}\` in a function adds its error and leaves the script's other diagnostics as they were`, () => {
      const script = (body: readonly string[]) =>
        [
          "store g = 0",
          "function f()",
          ...body,
          "  return 0",
          "end",
          "branch stray",
          "Go {f()}.",
          "end",
          "->",
          "scene start",
          "end",
          "",
        ].join("\n");
      const without = compile(script([])).diags;
      expect(without.length).toBeGreaterThan(0);
      const shifted = without.map((d) => ({
        ...d,
        startLine: d.startLine + decl.lines.length,
        endLine: d.endLine + decl.lines.length,
      }));
      const { diags, context } = compile(script(indent(decl.lines, 2)));
      expect(diags).toEqual(
        expect.arrayContaining([...shifted, expect.objectContaining({ message: message(decl.keyword), startLine: 2 })]),
      );
      expect(diags).toHaveLength(shifted.length + 1);
      expect(context[decl.keyword]?.[decl.name]).toBeUndefined();
    });
  }
});
