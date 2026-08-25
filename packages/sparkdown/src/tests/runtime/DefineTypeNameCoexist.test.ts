// A builtin TYPE (a root define, `define image with …`) and a same-named
// INSTANCE of a DIFFERENT type (`define image as style …`, i.e. style.image)
// must coexist — the type keeps the flat global `image`, the instance registers
// as a type-namespaced singleton (context.style.image). This is the same
// coexistence as two same-named typed instances (character.raffles +
// synth.raffles), extended to the type-vs-instance case (a root define has no
// structDefinition, so its type identity is its own name).
//
// Motivating case: the builtins prelude has both the `image`/`screen` TYPES and
// `style.image`/`style.screen` (styles for image/screen elements).

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
        text: src,
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
