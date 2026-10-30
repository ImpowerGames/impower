import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function diagnosticsFor(source: string): string[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  const out: string[] = [];
  for (const docDiagnostics of Object.values(result.program.diagnostics ?? {})) {
    for (const d of docDiagnostics) {
      const raw = (d as any).message;
      out.push(typeof raw === "string" ? raw : raw?.value ?? JSON.stringify(d));
    }
  }
  return out;
}

const shadowed = (diags: string[]) =>
  diags.some((m) => m.includes("bare name now refers to this variable"));

const COMPANION = `define companion as character with
  store trust = 0
end
define O as companion with
  name = "Orion"
end
`;

describe("define-type shadow warning", () => {
  test("`store` reusing an as-parent type name warns", () => {
    expect(shadowed(diagnosticsFor(COMPANION + `store companion = 5\n`))).toBe(
      true,
    );
  });

  test("`const` reusing a type name warns too", () => {
    expect(shadowed(diagnosticsFor(COMPANION + `const companion = 5\n`))).toBe(
      true,
    );
  });

  test("`store` reusing a `new`-target type name warns", () => {
    const src = `define Bird with
  store wings = 2
end
store Bird = 1
& fly()
done
function fly()
  local b = new Bird()
end
`;
    expect(shadowed(diagnosticsFor(src))).toBe(true);
  });

  test("shadowing a LEAF instance does NOT warn (it's scoped, no clash)", () => {
    expect(shadowed(diagnosticsFor(COMPANION + `store O = 5\n`))).toBe(false);
  });

  test("a non-colliding global name is clean", () => {
    expect(shadowed(diagnosticsFor(COMPANION + `store happiness = 5\n`))).toBe(
      false,
    );
  });

  test("`store` reusing a BUILTIN type/namespace root warns (fresh compile)", () => {
    const diags = diagnosticsFor(`store color = 1\n`);
    expect(shadowed(diags)).toBe(true);
    expect(diags.some((m) => m.includes("reserved builtin"))).toBe(true);
  });

  test("`store` reusing the builtin `character` root warns", () => {
    expect(shadowed(diagnosticsFor(`store character = 1\n`))).toBe(true);
  });

  test("a plain word that is NOT a builtin type is clean", () => {
    expect(shadowed(diagnosticsFor(`store score = 1\n`))).toBe(false);
  });

  test("`local` shadowing inside a function is exempt (ordinary Luau)", () => {
    const src =
      COMPANION +
      `& run()
done
function run()
  local companion = 5
  host_record(companion)
end
external host_record(v)
`;
    expect(shadowed(diagnosticsFor(src))).toBe(false);
  });
});
