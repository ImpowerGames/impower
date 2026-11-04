import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function compile(source: string): any {
  const compiler = new SparkdownCompiler();
  const uri = "inmemory:///main.sd";
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  return compiler.compile({ textDocument: { uri } }).program;
}

const SOURCE = String.raw`define character with
  name = ""
end

define alice as character with
  name = "Alice"
  portrait = { mood = "happy", size = 2 }
  tags = { "a", "b" }
  mixed = { dropped = math.max(1, 2), kept = "yes" }
  listed = { "a", math.max(1, 2) }
end

scene start
end
`;

describe("a define's struct definition value", () => {
  const program = compile(SOURCE);
  const alice = program.chunks?.tables?.structDefinitions?.character?.alice;

  test("the source compiles without errors", () => {
    const errors = Object.values(program.diagnostics ?? {})
      .flat()
      .filter((d: any) => d.severity === 1);
    expect(errors).toEqual([]);
  });

  test("keeps a scalar property", () => {
    expect(alice?.name).toBe("Alice");
  });

  test("serializes a table-valued property's fields", () => {
    expect(alice?.portrait).toEqual({ mood: "happy", size: 2 });
  });

  test("serializes an array-valued property's items", () => {
    expect(alice?.tags).toEqual(["a", "b"]);
  });

  test("omits a table property holding a value it cannot carry, as context does", () => {
    expect(Object.keys(alice ?? {})).not.toContain("mixed");
    expect(Object.keys(alice ?? {})).not.toContain("listed");
    const context = program.context?.character?.alice;
    expect(Object.keys(context ?? {})).not.toContain("mixed");
    expect(Object.keys(context ?? {})).not.toContain("listed");
    expect(context?.portrait).toEqual(alice?.portrait);
    expect(context?.tags).toEqual(alice?.tags);
  });
});
