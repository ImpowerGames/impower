import { describe, expect, test } from "vitest";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { MAIN_URI, programCompiler } from "../program/programHarness";

interface Diag {
  message: string;
  severity: number;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
}

function readDiags(program: SparkProgram): Diag[] {
  const diags: Diag[] = [];
  for (const docDiagnostics of Object.values(program.diagnostics ?? {})) {
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
  return diags;
}

function compile(source: string) {
  const { program } = programCompiler({ [MAIN_URI]: source }).compile();
  return { program, diags: readDiags(program) };
}

const errors = (source: string) =>
  compile(source).diags.filter((d) => d.severity === 1);

const MISSING_CLOSE = "missing its closing `}`";
const UNREADABLE = "cannot be read past";

const FORMS = [
  { keyword: "style", name: "s", header: "style s", body: "  color = red" },
  { keyword: "layout", name: "main", header: "layout main", body: "  box {\n  }" },
  { keyword: "screen", name: "menu", header: "screen menu", body: "" },
  { keyword: "component", name: "card", header: "component card(t)", body: "  box {\n  }" },
  { keyword: "animation", name: "a", header: "animation a", body: "  duration = 1s" },
  { keyword: "theme", name: "t", header: "theme t", body: "  x = 1" },
] as const;

const article = (word: string) => (/^[aeiou]/.test(word) ? "an" : "a");

const lines = (...parts: string[]) =>
  parts.filter((part) => part !== "").join("\n");

describe("a block without its `}`", () => {
  for (const form of FORMS) {
    test(`an unclosed ${form.keyword} is an error on its header and still compiles`, () => {
      const header = `${form.header} {`;
      const source = lines(header, form.body, "", "store trust = 5", "", "Trust is {trust}.", "");
      const { program, diags } = compile(source);
      const missing = diags.filter(
        (d) => d.severity === 1 && d.message.includes(MISSING_CLOSE),
      );
      expect(missing).toHaveLength(1);
      expect(missing[0]!.message).toContain(`this ${form.keyword}`);
      expect(missing[0]).toMatchObject({
        startLine: 0,
        startCharacter: 0,
        endLine: 0,
        endCharacter: header.length,
      });
      expect(
        (program.context as any)?.[form.keyword]?.[form.name],
      ).toBeDefined();
    });
  }

  test("an unclosed morph is an error on its header", () => {
    const source = "morph m {\n  x = 1\n\nstore trust = 5\n\nHi {trust}.\n";
    const missing = errors(source).filter((e) => e.message.includes(MISSING_CLOSE));
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ startLine: 0, endCharacter: 9 });
  });

  test("an unclosed layout that runs into a scene is an error", () => {
    const source = "layout main {\n  box {\n  }\n\n-> s\nscene s\nHi.\nend\n";
    const missing = errors(source).filter((e) => e.message.includes(MISSING_CLOSE));
    expect(missing).toHaveLength(1);
    expect(missing[0]!.startLine).toBe(0);
  });

  test("a layout whose body stops at an `else` is an error on its header", () => {
    const source = [
      "layout inventory {",
      "  column {",
      "    for item in bag do",
      "      row {",
      "        image",
      "        }",
      "      }",
      "    else",
      '      text "Your bag is empty."',
      "    end",
      "    title",
      "  }",
      "}",
      "",
      "scene start",
      "  Hi.",
      "end",
      "",
    ].join("\n");
    const layout = errors(source).filter((e) =>
      e.message.startsWith("This layout is missing its closing `}`"),
    );
    expect(layout).toHaveLength(1);
    expect(layout[0]!.message).toContain("line that starts with `end`, `else`, `elseif` or `case`");
    expect(layout[0]).toMatchObject({
      startLine: 0,
      startCharacter: 0,
      endLine: 0,
      endCharacter: "layout inventory {".length,
    });
  });

  test("a style header with no body is an error naming the brace form", () => {
    expect(errors("style s\n\nscene start\n  Hi.\nend\n").map((e) => e.message)).toEqual([
      "A style body goes in braces: `style NAME { … }`.",
    ]);
  });
});

describe("text a block header cannot read", () => {
  for (const form of FORMS) {
    for (const [label, header, readable] of [
      ["a `:` header", `${form.header}: {`, form.header],
      ["a word before `{`", `${form.header} junk {`, form.header],
      ["a name that starts with a digit", `${form.keyword} 2x {`, form.keyword],
    ] as const) {
      test(`${label} on ${article(form.keyword)} ${form.keyword} is an error on the readable header`, () => {
        const source = lines(header, form.body, "}", "", "scene start", "  Hi.", "end", "");
        const unreadable = errors(source).filter((e) =>
          e.message.includes(UNREADABLE),
        );
        expect(unreadable).toHaveLength(1);
        expect(unreadable[0]!.message).toContain(`\`${readable}\``);
        expect(unreadable[0]).toMatchObject({
          startLine: 0,
          startCharacter: 0,
          endLine: 0,
          endCharacter: readable.length,
        });
        expect(errors(source).some((e) => e.message.includes(MISSING_CLOSE))).toBe(
          false,
        );
      });
    }
  }

  test("a morph name that starts with a digit is an error on the readable header", () => {
    const unreadable = errors("morph 2m {\n  x = 1\n}\n\nscene start\n  Hi.\nend\n").filter((e) =>
      e.message.includes(UNREADABLE),
    );
    expect(unreadable).toHaveLength(1);
    expect(unreadable[0]!.message).toContain("`morph`");
    expect(unreadable[0]).toMatchObject({ startLine: 0, startCharacter: 0, endCharacter: 5 });
  });

  test("a dotted style name is an error on the readable header", () => {
    const unreadable = errors("style s.t {\n  color = red\n}\n\nscene start\n  Hi.\nend\n").filter(
      (e) => e.message.includes(UNREADABLE),
    );
    expect(unreadable).toHaveLength(1);
    expect(unreadable[0]!.message).toContain("`style s`");
  });
});

describe("text after `with` on a define header", () => {
  test("a word after `with` is an error at the word", () => {
    const source = 'define hero as character with junk\n  name = "Hero"\nend\n\nscene start\n  Hi.\nend\n';
    const errs = errors(source);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("Unexpected `junk` after `with`");
    expect(errs[0]).toMatchObject({
      startLine: 0,
      startCharacter: "define hero as character with ".length,
      endLine: 0,
      endCharacter: "define hero as character with junk".length,
    });
  });

  test("a `:` after `with` is an error at the colon", () => {
    const source = 'define hero as character with:\n  name = "Hero"\nend\n\nscene start\n  Hi.\nend\n';
    const errs = errors(source);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("Unexpected `:` after `with`");
    expect(errs[0]).toMatchObject({
      startLine: 0,
      startCharacter: "define hero as character with".length,
      endCharacter: "define hero as character with:".length,
    });
  });
});

describe("valid blocks report nothing new", () => {
  const cases: Record<string, string> = {
    "the builtins prelude": "scene start\n  Hi.\nend\n",
    "a define with a member after `with`":
      'define hero as character with name = "Hero"\nend\nscene start\n  Hi.\nend\n',
    "a define with a comment after `with`":
      "define hero as character with -- the lead\nend\nscene start\n  Hi.\nend\n",
    "a style with a comment after `{`":
      "style s { -- note\n  color = red\n}\nscene start\n  Hi.\nend\n",
    "a style with a nested block":
      "style s {\n  &.a {\n    color = red\n  }\n}\nscene start\n  Hi.\nend\n",
    "a layout in a screen":
      "screen hud {\n}\nlayout main as base in hud {\n  box {\n  }\n}\nlayout base {\n}\nscene start\n  Hi.\nend\n",
  };
  for (const form of FORMS) {
    cases[`a one-line ${form.keyword}`] = `${form.header} {}\nscene start\n  Hi.\nend\n`;
    cases[`a body-less ${form.keyword}`] = `${form.header} {\n}\nscene start\n  Hi.\nend\n`;
    cases[`a multi-line ${form.keyword}`] = lines(
      `${form.header} {`,
      form.body || "  -- nothing yet",
      "}",
      "scene start",
      "  Hi.",
      "end",
      "",
    );
  }
  for (const [label, source] of Object.entries(cases)) {
    test(label, () => {
      expect(errors(source)).toEqual([]);
    });
  }
});

describe("block diagnostics across incremental edits", () => {
  const summary = (diags: Diag[]) =>
    diags
      .map(
        (d) =>
          `${d.severity} ${d.startLine}:${d.startCharacter}-${d.endLine}:${d.endCharacter} ${d.message}`,
      )
      .sort();

  const run = (initial: string, steps: [string, string][]) => {
    let text = initial;
    const posAt = (offset: number) => {
      const before = text.slice(0, offset).split("\n");
      return { line: before.length - 1, character: before.at(-1)!.length };
    };
    const incr = programCompiler({ [MAIN_URI]: text });
    incr.compile();
    let version = 1;
    const seen: string[] = [];
    for (const [find, replace] of steps) {
      const offset = text.indexOf(find);
      expect(offset, `fixture is missing ${JSON.stringify(find)}`).toBeGreaterThanOrEqual(0);
      const start = posAt(offset);
      const end = posAt(offset + find.length);
      version += 1;
      incr.compiler.updateDocument({
        textDocument: { uri: MAIN_URI, version },
        contentChanges: [{ range: { start, end }, text: replace }],
      });
      text = text.slice(0, offset) + replace + text.slice(offset + find.length);
      const incremental = summary(readDiags(incr.compile().program));
      expect(incremental, `after replacing ${JSON.stringify(find)}`).toEqual(
        summary(compile(text).diags),
      );
      seen.push(...incremental);
    }
    return seen;
  };

  test("match a cold compile as a style's `}` is deleted and added", () => {
    const seen = run(
      [
        "style s {",
        "  color = red",
        "}",
        "",
        "store trust = 5",
        "",
        "scene start",
        "  Trust is {trust}.",
        "end",
        "",
      ].join("\n"),
      [
        ["  color = red\n}\n", "  color = red\n"],
        ["Trust is", "Now trust is"],
        ["style s {", "style s: {"],
        ["Now trust is", "Trust is"],
        ["style s: {", "style s {"],
        ["  color = red\n", "  color = red\n}\n"],
      ],
    );
    expect(seen.some((m) => m.includes(MISSING_CLOSE))).toBe(true);
    expect(seen.some((m) => m.includes(UNREADABLE))).toBe(true);
  });

  test("match a cold compile as a layout's `}` is deleted and added", () => {
    const seen = run(
      [
        "layout main {",
        "  box {",
        "  }",
        "}",
        "",
        "store trust = 5",
        "",
        "scene start",
        "  Trust is {trust}.",
        "end",
        "",
      ].join("\n"),
      [
        ["  }\n}\n", "  }\n"],
        ["Trust is", "Now trust is"],
        ["  }\n", "  }\n}\n"],
        ["layout main {", "layout main junk {"],
        ["layout main junk {", "layout main {"],
      ],
    );
    expect(seen.some((m) => m.includes(MISSING_CLOSE))).toBe(true);
    expect(seen.some((m) => m.includes(UNREADABLE))).toBe(true);
  });
});
