// Invalid `const` declarations must be REPORTED, never silently fatal.
//
// A constant is initialized once, ahead of every mutable global, so its
// initializer can only read other constants. When that doesn't hold — it
// reads a `store`, it is part of a dependency cycle, or it reads a constant
// that itself failed — the constant is left unregistered and diagnosed.
//
// The failure mode being guarded against is severe and was real: an
// unregistered constant that still emitted an initializer would read an
// uninitialized global, and the resulting nil arithmetic throws out of
// `ResetState`, so `program.compiled` came back undefined and the author got
// NO diagnostic at all — the game simply didn't run.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";

function compile(text: string) {
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
  return (c.compile({ textDocument: { uri: URI } } as never) as any).program;
}

const errorsOf = (p: any) =>
  (Array.isArray(p.diagnostics)
    ? p.diagnostics
    : Object.values(p.diagnostics ?? {}).flat()
  ).filter((d: any) => d.severity === 1);

/** Compile `body` plus a scene that references SHOW. */
function check(body: string) {
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    const p = compile(
      body + "\nscene main\n:\n  Value {SHOW}.\n-> DONE\nend\n",
    );
    return {
      hasProgram: Boolean(p.compiled),
      errors: errorsOf(p).length,
      constants: (p.compiled?.constants ?? null) as string[] | null,
    };
  } finally {
    console.warn = realWarn;
    console.error = realError;
  }
}

describe("const declaration validity", () => {
  it("a valid const compiles and is published as a runtime constant", () => {
    const r = check("const SHOW = 5");
    expect(r.hasProgram).toBe(true);
    expect(r.errors).toBe(0);
    expect(r.constants).toEqual(["SHOW"]);
  });

  it("a self-referential const is reported, not silently fatal", () => {
    const r = check("const SHOW = SHOW + 1");
    expect(r.hasProgram).toBe(true);
    expect(r.errors).toBeGreaterThan(0);
    // Never published as a constant: it has no initializer.
    expect(r.constants).toBeNull();
  });

  it("a mutual cycle is reported and the program survives", () => {
    const r = check("const A = B + 1\nconst B = A + 1\nconst SHOW = 1");
    expect(r.hasProgram).toBe(true);
    expect(r.errors).toBeGreaterThan(0);
    // The unrelated constant is unaffected.
    expect(r.constants).toEqual(["SHOW"]);
  });

  it("a longer cycle reports every member", () => {
    const r = check(
      "const A = B + 1\nconst B = C + 1\nconst C = A + 1\nconst SHOW = 1",
    );
    expect(r.hasProgram).toBe(true);
    // One per cycle member, not just the one where it was detected.
    expect(r.errors).toBeGreaterThanOrEqual(3);
  });

  it("a const built from a mutable global is reported", () => {
    const r = check("store s = 1\nconst SHOW = s + 1");
    expect(r.hasProgram).toBe(true);
    expect(r.errors).toBeGreaterThan(0);
    expect(r.constants).toBeNull();
  });

  it("a const built from an INVALID const is reported too", () => {
    const r = check("store s = 1\nconst A = s + 1\nconst SHOW = A + 1");
    expect(r.hasProgram).toBe(true);
    // Both the direct failure and the one that depends on it.
    expect(r.errors).toBeGreaterThanOrEqual(2);
    expect(r.constants).toBeNull();
  });

  it("assigning to a const is an error", () => {
    const r = check("const SHOW = 5\n& SHOW = 6");
    expect(r.hasProgram).toBe(true);
    expect(r.errors).toBeGreaterThan(0);
  });

  it("a local of the same name shadows without a spurious const error", () => {
    const r = check(
      "const SHOW = 5\nfunction f():\n  local SHOW = 1\n  return SHOW",
    );
    expect(r.hasProgram).toBe(true);
    expect(r.errors).toBe(0);
  });
});
