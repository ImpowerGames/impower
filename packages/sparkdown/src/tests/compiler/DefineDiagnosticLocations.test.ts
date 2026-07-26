import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

// Diagnostics raised from inside a `define` property's value expression must
// point at that expression. They come from the ink compiler (VariableReference
// reports itself as the diagnostic source), so they only carry a location if
// the lowerer stamped `debugMetadata` on the expression it synthesized.
//
// Without that stamp the compiler's diagnostic callback falls back to the
// ENTRY document at 0:0 -- which silently piles every such warning at the top
// of the wrong file, un-navigable from the lint panel. So these tests assert
// the file AND the range, not just that a diagnostic exists.

const message = (d: any): string =>
  typeof d?.message === "string" ? d.message : (d?.message?.value ?? "");

const script = (uri: string, text: string) => ({
  uri,
  type: "script",
  name: uri.split("/").pop()!.replace(/\.sd$/, ""),
  ext: "sd",
  text,
  version: 1,
  languageId: "sparkdown",
});

const compile = (files: ReturnType<typeof script>[], entry: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({ files } as never);
  return compiler.compile({ textDocument: { uri: entry } } as never).program;
};

/** Every "Cannot find variable named" diagnostic, flattened with its file. */
const undeclaredNameDiagnostics = (program: any) =>
  Object.entries(program.diagnostics ?? {}).flatMap(([uri, list]) =>
    (list as any[])
      .filter((d) => /Cannot find variable named/.test(message(d)))
      .map((d) => ({ uri, range: d.range })),
  );

const MAIN = "file://proj/main.sd";
const PORTRAITS = "file://proj/portraits.sd";

describe("define property diagnostic locations", () => {
  it("anchors an undeclared name to the property value, not the file top", () => {
    const program = compile(
      [
        script(
          MAIN,
          [
            "First beat.", // 0
            "", // 1
            "define Portrait with", // 2
            "  image = does_not_exist_anywhere", // 3
            "end", // 4
            "",
          ].join("\n"),
        ),
      ],
      MAIN,
    );

    const found = undeclaredNameDiagnostics(program);
    expect(found).toHaveLength(1);
    expect(found[0]!.uri).toBe(MAIN);
    // Line 3 is `  image = does_not_exist_anywhere`; the name starts at col 10.
    expect(found[0]!.range.start.line).toBe(3);
    expect(found[0]!.range.start.character).toBeGreaterThan(0);
    // A real range, not the zero-width 0:0 fallback
    expect(found[0]!.range.end.character).toBeGreaterThan(
      found[0]!.range.start.character,
    );
  });

  // The fallback attributed diagnostics to the ENTRY document, so a define
  // living in an included file reported against main.sd -- wrong file as well
  // as wrong position.
  it("attributes the diagnostic to the included file that declares it", () => {
    const program = compile(
      [
        script(MAIN, ["include portraits.sd", "", "First beat.", ""].join("\n")),
        script(
          PORTRAITS,
          [
            "-- padding", // 0
            "-- padding", // 1
            "define Portrait with", // 2
            "  image = does_not_exist_anywhere", // 3
            "end", // 4
            "",
          ].join("\n"),
        ),
      ],
      MAIN,
    );

    const found = undeclaredNameDiagnostics(program);
    expect(found).toHaveLength(1);
    expect(found[0]!.uri).toBe(PORTRAITS);
    expect(found[0]!.range.start.line).toBe(3);
  });

  it("does not warn when the referenced name exists", () => {
    const program = compile(
      [
        script(
          MAIN,
          [
            "define Real with", // 0
            "  value = 1", // 1
            "end", // 2
            "", // 3
            "define Portrait with", // 4
            "  image = Real", // 5
            "end", // 6
            "",
          ].join("\n"),
        ),
      ],
      MAIN,
    );

    expect(undeclaredNameDiagnostics(program)).toEqual([]);
  });
});
