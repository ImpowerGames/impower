// The error for a top-level `const` with more than one name or value is
// reported on the declaration itself: its range spans the statement, starting
// at `const` rather than at the line's indentation. A `const` inside a
// function is Luau's (#1319), and Luau's error for more names than values is
// on the declaration too, from `const` to its last value.
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";
const RULE = "A `const` takes one name and one value";
const LUAU_RULE = "Missing initializer in const declaration";

function ruleDiagnostics(text: string, rule = RULE) {
  const c = new SparkdownCompiler();
  c.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  const p = (c.compile({ textDocument: { uri: URI } } as never) as any)
    .program;
  return (
    Array.isArray(p.diagnostics)
      ? p.diagnostics
      : Object.values(p.diagnostics ?? {}).flat()
  ).filter(
    (d: any) =>
      (typeof d.message === "string" ? d.message : d.message?.value) === rule,
  );
}

describe("const multi-declaration diagnostic range", () => {
  it("spans a top-level declaration", () => {
    const text = "const a, g = 1, 2\nValue {a} {g}.\n";
    const [d, ...rest] = ruleDiagnostics(text);
    expect(rest).toHaveLength(0);
    expect(d.range).toEqual({
      start: { line: 0, character: 0 },
      end: { line: 0, character: "const a, g = 1, 2".length },
    });
  });

  it("inside a function body, Luau's error starts at `const`, not the indentation", () => {
    const text =
      "Value {f()}.\nfunction f()\n  const a, g = 1\n  return a\nend\n";
    expect(ruleDiagnostics(text)).toHaveLength(0);
    const [d, ...rest] = ruleDiagnostics(text, LUAU_RULE);
    expect(rest).toHaveLength(0);
    expect(d.range).toEqual({
      start: { line: 2, character: 2 },
      end: { line: 2, character: "  const a, g = 1".length },
    });
  });
});
