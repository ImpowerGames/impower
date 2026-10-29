import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const mk = (name: string, text: string) => ({
  uri: `inmemory:///${name}.sd`,
  type: "script" as const,
  name,
  ext: "sd",
  text,
  version: 1,
  languageId: "sparkdown",
});

function compileFiles(files: Record<string, string>) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: Object.entries(files).map(([n, t]) => mk(n, t)),
  });
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  const diagnostics: string[] = [];
  for (const list of Object.values(result.program.diagnostics ?? {})) {
    for (const d of list as any[]) {
      diagnostics.push(
        typeof d.message === "string" ? d.message : d.message?.value ?? "",
      );
    }
  }
  return { program: result.program, diagnostics };
}

const bindingIds = (program: unknown): string[] => [
  ...new Set(JSON.stringify(program).match(/__binding\$[A-Za-z0-9_]+/g) ?? []),
];

describe("binding ids are unique across files", () => {
  const FILES = {
    main: `-> END\n`,
    fa: `store a = 1\nlayout la with\n  text "{a}"\nend\n`,
    fb: `store b = 2\nlayout lb with\n  text "{b}"\nend\n`,
  };

  test("two files colliding on byte offset get distinct evaluators", () => {
    const { program, diagnostics } = compileFiles(FILES);
    expect(Object.keys(program.sparkle?.layouts ?? {})).toEqual(
      expect.arrayContaining(["la", "lb"]),
    );
    const authored = bindingIds({
      la: program.sparkle?.layouts?.["la"],
      lb: program.sparkle?.layouts?.["lb"],
    });
    expect(authored.length).toBe(2);
    expect(
      diagnostics.filter((m) => m.includes("Duplicate identifier")),
    ).toEqual([]);
  });
});

describe("a shadowed loop variable is not a compile error", () => {
  test("nested loops binding the same name compile clean", () => {
    const { diagnostics } = compileFiles({
      main: `store rows = { 1 }
store cols = { 2 }
layout main with
  for i in rows do
    for i in cols do
      text "{i}"
    end
  end
end
`,
    });
    expect(
      diagnostics.filter((m) => m.includes("same name")),
    ).toEqual([]);
  });

  test("a loop re-binding a component param compiles clean", () => {
    const { diagnostics } = compileFiles({
      main: `store items = { 1 }
component card(item) with
  for item in items do
    text "{item}"
  end
end
layout main with
  card(1)
end
`,
    });
    expect(
      diagnostics.filter((m) => m.includes("same name")),
    ).toEqual([]);
  });
});
