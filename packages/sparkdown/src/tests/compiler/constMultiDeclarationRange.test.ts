// The error for a `const` with more than one name or value is reported on the
// declaration itself: its range spans the statement, starting at `const`
// rather than at the line's indentation, also inside a function body.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";
const RULE = "A `const` takes one name and one value";

function ruleDiagnostics(text: string) {
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
      (typeof d.message === "string" ? d.message : d.message?.value) === RULE,
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

  it("starts at `const`, not the indentation, inside a function body", () => {
    const text =
      "Value {f()}.\nfunction f()\n  const a = 1, 2\n  return a\nend\n";
    const [d, ...rest] = ruleDiagnostics(text);
    expect(rest).toHaveLength(0);
    expect(d.range).toEqual({
      start: { line: 2, character: 2 },
      end: { line: 2, character: "  const a = 1, 2".length },
    });
  });
});
