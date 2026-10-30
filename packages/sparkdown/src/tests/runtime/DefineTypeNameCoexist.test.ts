import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function compile(src: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: `${src}\nscene start\nend\n`,
        version: 1,
        languageId: "sparkdown",
      } as any,
    ],
  });
  const result = compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } });
  let errors = 0;
  for (const ds of Object.values(result.program.diagnostics ?? {})) {
    for (const d of ds as any[]) if (d?.severity === 1) errors++;
  }
  return { program: result.program, errors };
}

describe("type vs same-named instance coexistence", () => {
  test("`image` type + `style.image` coexist (type-first)", () => {
    const r = compile(
      `define image with\n  src = ""\nend\n\ndefine image as style with\n  display = "block"\nend\n`,
    );
    expect(r.errors).toBe(0);
    expect(r.program.context?.["image"]?.["$default"]).toBeDefined();
    expect(r.program.context?.["style"]?.["image"]).toBeDefined();
    expect(r.program.context?.["style"]?.["image"]?.["display"]).toBe("block");
  });

  test("coexist regardless of order (instance-first)", () => {
    const r = compile(
      `define image as style with\n  display = "block"\nend\n\ndefine image with\n  src = ""\nend\n`,
    );
    expect(r.errors).toBe(0);
    expect(r.program.context?.["image"]?.["$default"]).toBeDefined();
    expect(r.program.context?.["style"]?.["image"]).toBeDefined();
  });

  test("two SAME-type same-name defines still error", () => {
    const r = compile(
      `define image as style with\n  display = "block"\nend\n\ndefine image as style with\n  display = "none"\nend\n`,
    );
    expect(r.errors).toBeGreaterThan(0);
  });
});
