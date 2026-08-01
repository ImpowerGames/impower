// Skipping bytecode serialization must change ONLY the bytecode (#345).
//
// `ExportRuntime` still runs when emission is off, because generation-time
// diagnostics come out of it and `populateAllLocations` walks the runtime tree.
// So the risk is not "does it go faster" — it is that skipping serialization
// quietly changes something else the host DOES read. These tests pin the parts
// that must be untouched.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";

function quiet<T>(fn: () => T): T {
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = realWarn;
    console.error = realError;
  }
}

function compile(text: string, emitCompiledProgram?: boolean) {
  return quiet(() => {
    const c = new SparkdownCompiler();
    c.configure({
      ...(emitCompiledProgram === undefined ? {} : { emitCompiledProgram }),
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
  });
}

const SOURCE = [
  "title: Emit Toggle",
  "",
  "define hero as character:",
  `  name = "Hero"`,
  "",
  "const LIMIT = 3",
  "store trust = 0",
  "",
  "scene one",
  ":",
  "  First beat with {trust} and {LIMIT}.",
  "hero:",
  "  A line of dialogue.",
  "-> two",
  "end",
  "",
  "scene two",
  ":",
  "  Second beat.",
  "end",
  "",
].join("\n");

/** A script with real diagnostics, so the diagnostic path is exercised too. */
const BROKEN = [
  "title: Broken",
  "",
  "-> nowhere_at_all",
  "",
].join("\n");

describe("emitCompiledProgram (#345)", () => {
  it("emits bytecode by default", () => {
    expect(compile(SOURCE).compiled).toBeTruthy();
    expect(compile(SOURCE, true).compiled).toBeTruthy();
  });

  it("omits bytecode when disabled", () => {
    expect(compile(SOURCE, false).compiled).toBeUndefined();
  });

  it("leaves pathLocations identical", () => {
    // The editor navigates source with these; if skipping serialization
    // perturbed them, PageUp/PageDown would drift with no visible cause.
    const on = compile(SOURCE, true);
    const off = compile(SOURCE, false);
    expect(JSON.stringify(off.pathLocations)).toBe(
      JSON.stringify(on.pathLocations),
    );
    expect(Object.keys(off.pathLocations ?? {}).length).toBeGreaterThan(0);
  });

  it("leaves diagnostics identical, including generation-time ones", () => {
    // Generation diagnostics come out of ExportRuntime, which still runs. This
    // is the assertion that catches someone "optimizing" by skipping that too.
    for (const source of [SOURCE, BROKEN]) {
      const on = compile(source, true);
      const off = compile(source, false);
      expect(JSON.stringify(off.diagnostics ?? {})).toBe(
        JSON.stringify(on.diagnostics ?? {}),
      );
    }
    expect(
      Object.values(compile(BROKEN, false).diagnostics ?? {}).flat().length,
      "the broken fixture must actually produce diagnostics",
    ).toBeGreaterThan(0);
  });

  it("leaves the rest of the program identical apart from `compiled`", () => {
    const on = compile(SOURCE, true);
    const off = compile(SOURCE, false);
    const strip = (p: Record<string, unknown>) => {
      const { compiled, ...rest } = p;
      return Object.keys(rest).sort();
    };
    // Same shape: no field silently disappears alongside the bytecode.
    expect(strip(off)).toEqual(strip(on));
    for (const key of ["scripts", "files", "context"]) {
      expect(JSON.stringify(off[key]), key).toBe(JSON.stringify(on[key]));
    }
  });

  it("still emits after the option is toggled back on", () => {
    // The incremental ToJson cache is not maintained while emission is off, so
    // a re-enable must not serve subtrees from a compile that never ran.
    const c = quiet(() => {
      const compiler = new SparkdownCompiler();
      compiler.configure({
        emitCompiledProgram: false,
        files: [
          {
            uri: URI,
            type: "script",
            name: "main",
            ext: "sd",
            text: SOURCE,
            version: 1,
            languageId: "sparkdown",
          },
        ],
      } as never);
      return compiler;
    });
    expect(
      quiet(() => (c.compile({ textDocument: { uri: URI } } as never) as any))
        .program.compiled,
    ).toBeUndefined();

    quiet(() => c.configure({ emitCompiledProgram: true } as never));
    const after = quiet(
      () => (c.compile({ textDocument: { uri: URI } } as never) as any).program,
    );
    expect(JSON.stringify(after.compiled)).toBe(
      JSON.stringify(compile(SOURCE, true).compiled),
    );
  });
});
