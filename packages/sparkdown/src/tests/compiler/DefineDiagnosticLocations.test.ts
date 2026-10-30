import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

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
            "First beat.",
            "",
            "define Portrait with",
            "  image = does_not_exist_anywhere",
            "end",
            "",
          ].join("\n"),
        ),
      ],
      MAIN,
    );

    const found = undeclaredNameDiagnostics(program);
    expect(found).toHaveLength(1);
    expect(found[0]!.uri).toBe(MAIN);
    expect(found[0]!.range.start.line).toBe(3);
    expect(found[0]!.range.start.character).toBeGreaterThan(0);
    expect(found[0]!.range.end.character).toBeGreaterThan(
      found[0]!.range.start.character,
    );
  });

  it("attributes the diagnostic to the other script of the project that declares it", () => {
    const program = compile(
      [
        script(MAIN, ["First beat.", ""].join("\n")),
        script(
          PORTRAITS,
          [
            "// padding",
            "// padding",
            "define Portrait with",
            "  image = does_not_exist_anywhere",
            "end",
            "",
          ].join("\n"),
        ),
      ],
      MAIN,
    );

    const found = undeclaredNameDiagnostics(program);    expect(found).toHaveLength(1);
    expect(found[0]!.uri).toBe(PORTRAITS);
    expect(found[0]!.range.start.line).toBe(3);
  });

  it("does not warn when the referenced name exists", () => {
    const program = compile(
      [
        script(
          MAIN,
          [
            "define Real with",
            "  value = 1",
            "end",
            "",
            "define Portrait with",
            "  image = Real",
            "end",
            "",
          ].join("\n"),
        ),
      ],
      MAIN,
    );

    expect(undeclaredNameDiagnostics(program)).toEqual([]);
  });
});
