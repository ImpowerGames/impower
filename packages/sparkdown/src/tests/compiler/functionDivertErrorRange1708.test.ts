import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

// #1708: a divert to a function reported its error at line 0, column 0
// instead of at the divert, so an author could not find the cause.
const uri = "file:///project/main.sd";

const compileDiagnostics = (text: string) => {
  const c = new SparkdownCompiler();
  c.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        version: 1,
        languageId: "sparkdown",
        text,
      },
    ],
  });
  const p = c.compile({ textDocument: { uri } }).program;
  return (p.diagnostics?.[uri] ?? []).map((d: any) => ({
    severity: d.severity,
    range: d.range,
    message: typeof d.message === "string" ? d.message : d.message.value,
  }));
};

describe("divert to a function (#1708)", () => {
  const text = 'function greet()\n  return "Hello"\nend\n\n-> greet\n';

  it("places the error on the divert's line", () => {
    const ds = compileDiagnostics(text);
    const d = ds.find((x) => x.message.includes("can't be diverted to"));
    expect(d, JSON.stringify(ds)).toBeDefined();
    expect(d!.severity).toBe(1);
    expect(d!.range.start.line).toBe(4);
    expect(d!.range.end.line).toBe(4);
  });

  it("reports exactly one error on the divert's line", () => {
    const ds = compileDiagnostics(text);
    const onLine = ds.filter(
      (x) => x.severity === 1 && x.range.start.line === 4,
    );
    expect(onLine, JSON.stringify(ds)).toHaveLength(1);
  });

  it("reports only the divert error when the divert passes arguments", () => {
    const ds = compileDiagnostics(
      'function greet()\n  return "Hello"\nend\n\n-> greet(1)\n',
    );
    const errors = ds.filter((x) => x.severity === 1);
    expect(errors, JSON.stringify(ds)).toHaveLength(1);
    expect(errors[0]!.message).toContain("can't be diverted to");
    expect(errors[0]!.range.start.line).toBe(4);
  });

  it("still checks arguments of a function called as one", () => {
    const ds = compileDiagnostics("function f(x)\n  return x\nend\n\n{f()}\n");
    const d = ds.find((x) => x.message.includes("requires 1 argument"));
    expect(d, JSON.stringify(ds)).toBeDefined();
    expect(d!.range.start.line).toBe(4);
  });
});
