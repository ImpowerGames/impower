// A `define` whose block never reaches `end`, or whose header ends in
// something other than `with`, must be reported instead of compiling silently.
// An unclosed define runs on to the next `scene` / `branch` or the end of the
// file and takes the top-level lines in between as its body (`store trust = 5`
// becomes a property of the define, so `{trust}` reads nil); a `:` header
// leaves the indented properties outside the header, where the lowerer drops
// them. See issue #836.
import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";

interface Diag {
  message: string;
  severity: number;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
}

function compile(source: string): { diags: Diag[]; compiled: boolean } {
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
  for (const docDiagnostics of Object.values(
    result.program.diagnostics ?? {},
  )) {
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
  return { diags, compiled: !!result.program.compiled };
}

const errors = (source: string) =>
  compile(source).diags.filter((d) => d.severity === 1);

const MISSING_END = "missing its closing `end`";
const HEADER = "define header";

describe("define without `end`", () => {
  test("an unclosed define before a store is an error on its header", () => {
    const source = [
      "define hero as character with",
      '  name = "Hero"',
      "",
      "store trust = 5",
      "",
      "Trust is {trust}.",
      "",
    ].join("\n");
    const errs = errors(source);
    expect(errs.map((e) => e.message).join("\n")).toContain(MISSING_END);
    const missing = errs.find((e) => e.message.includes(MISSING_END))!;
    expect(missing.startLine).toBe(0);
    expect(missing.startCharacter).toBe(0);
    expect(missing.endLine).toBe(0);
    expect(missing.endCharacter).toBe("define hero as character with".length);
  });

  test("an unclosed define that runs into a scene is an error", () => {
    const source = [
      "define hero as character with",
      '  name = "Hero"',
      "",
      "-> s",
      "scene s",
      "Hi.",
      "end",
      "",
    ].join("\n");
    const errs = errors(source);
    expect(errs.filter((e) => e.message.includes(MISSING_END))).toHaveLength(1);
    expect(errs.find((e) => e.message.includes(MISSING_END))!.startLine).toBe(
      0,
    );
  });

  test("a body-less define with no `end` is an error", () => {
    const errs = errors("define X as character\n\nHi.\n");
    expect(errs.map((e) => e.message).join("\n")).toContain(MISSING_END);
  });

  test("a closed define compiles cleanly and leaves the store global", () => {
    const source = [
      "define hero as character with",
      '  name = "Hero"',
      "end",
      "",
      "store trust = 5",
      "",
      "Trust is {trust}.",
      "",
    ].join("\n");
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Trust is 5.\n");
  });
});

describe("define header", () => {
  test("a `:` header is an error at the colon", () => {
    const source = [
      "define hero as character:",
      '  name = "Hero"',
      "end",
      "",
      "Hi.",
      "",
    ].join("\n");
    const errs = errors(source);
    const header = errs.filter((e) => e.message.includes(HEADER));
    expect(header).toHaveLength(1);
    expect(header[0]!.message).toContain("`:`");
    expect(header[0]!.startLine).toBe(0);
    expect(header[0]!.startCharacter).toBe("define hero as character".length);
    expect(header[0]!.endLine).toBe(0);
    expect(header[0]!.endCharacter).toBe("define hero as character:".length);
    expect(errs.some((e) => e.message.includes(MISSING_END))).toBe(false);
  });

  test("a `:` header with no `end` reports both problems", () => {
    const source = [
      "define hero as character:",
      '  name = "Hero"',
      "",
      "store trust = 5",
      "",
      "Trust is {trust}.",
      "",
    ].join("\n");
    const messages = errors(source).map((e) => e.message);
    expect(messages.some((m) => m.includes(HEADER))).toBe(true);
    expect(messages.some((m) => m.includes(MISSING_END))).toBe(true);
  });

  test("text between the parent and `with` is an error at that text", () => {
    const source = [
      "define hero as character extra with",
      '  name = "Hero"',
      "end",
      "",
    ].join("\n");
    const header = errors(source).filter((e) => e.message.includes(HEADER));
    expect(header).toHaveLength(1);
    expect(header[0]!.message).toContain("`extra with`");
    expect(header[0]!.startLine).toBe(0);
    expect(header[0]!.startCharacter).toBe("define hero as character ".length);
  });

  test("properties under a header with no `with` are an error", () => {
    const source = [
      "define hero as character",
      '  name = "Hero"',
      "end",
      "",
    ].join("\n");
    const header = errors(source).filter((e) => e.message.includes(HEADER));
    expect(header).toHaveLength(1);
    expect(header[0]!.message).toContain("needs `with` at the end");
    expect(header[0]!.startLine).toBe(1);
    expect(header[0]!.startCharacter).toBe(2);
  });

  test("a `:` header inside another block is still reported", () => {
    const source = [
      "if true then",
      "  define X as character:",
      "    a = 1",
      "  end",
      "end",
      "Hi.",
      "",
    ].join("\n");
    const header = errors(source).filter((e) => e.message.includes(HEADER));
    expect(header).toHaveLength(1);
    expect(header[0]!.message).toContain("`:`");
    expect(header[0]!.startLine).toBe(1);
  });
});

describe("define header the grammar cannot read", () => {
  const cases: Record<string, [string, string]> = {
    "a dotted name": [
      "define config.thing with\n  value = 1\nend\nHi.\n",
      "define config",
    ],
    "a dotted parent": [
      "define thing as config.sub with\n  value = 1\nend\nHi.\n",
      "define thing as config",
    ],
    "a name with a letter outside A-Z": [
      'define héro as character with\n  name = "H"\nend\nHi.\n',
      "define h",
    ],
  };
  for (const [label, [source, readable]] of Object.entries(cases)) {
    test(`${label} is reported on the header, not as a missing \`end\``, () => {
      const errs = errors(source);
      expect(errs).toHaveLength(1);
      expect(errs[0]!.message).toContain(`cannot be read past \`${readable}\``);
      expect(errs[0]!.startLine).toBe(0);
      expect(errs[0]!.startCharacter).toBe(0);
      expect(errs[0]!.endCharacter).toBe(readable.length);
    });
  }

  test("a define with no name is reported, with or without `end`", () => {
    for (const source of [
      "define\n\nstore trust = 5\n",
      "define\nend\nHi.\n",
    ]) {
      const errs = errors(source);
      expect(errs).toHaveLength(1);
      expect(errs[0]!.message).toContain("has no name");
      expect(errs[0]!.startLine).toBe(0);
    }
  });
});

describe("a script with a define error still compiles", () => {
  const cases: Record<string, string> = {
    "no `end`":
      'define hero as character with\n  name = "Hero"\n\nstore trust = 5\n\nTrust is {trust}.\n',
    "`:` header":
      'define hero as character:\n  name = "Hero"\nend\n\nstore trust = 5\n\nTrust is {trust}.\n',
  };
  for (const [label, source] of Object.entries(cases)) {
    test(label, () => {
      const { diags, compiled } = compile(source);
      expect(diags.some((d) => d.severity === 1)).toBe(true);
      expect(compiled).toBe(true);
    });
  }
});

describe("valid define forms stay clean", () => {
  const cases: Record<string, string> = {
    "one-line define": 'define red as color with value = "#13171f" end\nHi.\n',
    "body-less define": "define X as character\nend\nHi.\n",
    "one-line body-less define": "define X as character end\nHi.\n",
    "root define": "define thing with\n  size = 1\nend\nHi.\n",
    "comment after `with`":
      'define hero as character with -- the lead\n  name = "Hero"\nend\nHi.\n',
    "comment on a body-less header":
      "define X as character -- note\nend\nHi.\n",
    "comment line in the body":
      'define hero as character with\n  -- the lead\n  name = "Hero"\nend\nHi.\n',
    "method in the body":
      "define hero as character with\n  greet()\n    return 1\n  end\nend\nHi.\n",
  };
  for (const [label, source] of Object.entries(cases)) {
    test(label, () => {
      expect(errors(source)).toEqual([]);
    });
  }
});
