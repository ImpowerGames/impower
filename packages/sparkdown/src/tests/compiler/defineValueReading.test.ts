// A define property's value reaches the engine's struct registry
// (`program.context`) as the converter reads it (#1274): a quoted string's
// value with its escapes read, a `--` inside the quotes kept, a number, a
// boolean, a typed reference as a reference, a table as a list, and a
// bracket key's string as the key. A call has no literal form and stays
// with the runtime `__def` table.

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

const SOURCE = String.raw`define Thing with
  quoted = "a -- b"
  escaped = "x\ny\x41"
  count = 5
  flag = true
  target = layer.instance
  made = math.max(1, 2)
  list = { 1, 2 }
  ["$link"] = "x"
end
`;

describe("define property values in the struct registry", () => {
  const program = compile(SOURCE);
  const thing = program.context?.Thing?.$default;

  test("the source compiles without errors", () => {
    const errors = Object.values(program.diagnostics ?? {})
      .flat()
      .filter((d: any) => d.severity === 1);
    expect(errors).toEqual([]);
  });

  test("a quoted string keeps a `--` inside its quotes", () => {
    expect(thing?.quoted).toBe("a -- b");
  });

  test("a string's escapes are read", () => {
    expect(thing?.escaped).toBe("x\nyA");
  });

  test("a number and a boolean", () => {
    expect(thing?.count).toBe(5);
    expect(thing?.flag).toBe(true);
  });

  test("a typed reference is a reference", () => {
    expect(thing?.target).toEqual({ $type: "layer", $name: "instance" });
  });

  test("a table is a list", () => {
    expect(thing?.list).toEqual([1, 2]);
  });

  test("a bracket key's string is the key", () => {
    expect(thing?.$link).toBe("x");
  });

  test("a call stays with the runtime table", () => {
    expect(thing && "made" in thing).toBe(false);
  });
});
