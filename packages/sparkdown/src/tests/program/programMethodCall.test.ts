// What the writer emits for a method call (I-1412): a colon call's
// `CallValue` names its method, so a receiver that lacks it raises Luau's
// `attempt to call missing method`, and nothing else of the call changes; a
// dot call's `CallValue` names none.
import { describe, expect, it } from "vitest";
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import { describeInstruction } from "../../program/BinaryProgramWriter";
import type { ProgramRoot } from "../../program/ProgramRoot";
import type { ProgramChunk } from "../../program/ProgramChunk";
import { compileScript } from "./programHarness";

const SCRIPT = "local t = {}\n& t:add(1)\n& t.add(1)\nlocal v = t:add(2, 3)\n";

const compiled = (text: string): ProgramRoot => {
  const { program } = compileScript(text);
  expect(program.chunks).toBeDefined();
  return program.chunks!;
};

const code = (root: ProgramRoot): string[][] =>
  root
    .flowNamed("")!
    .arrays.chunks.map((chunk: ProgramChunk) =>
      [...new BinaryProgramReader(root).instructions(chunk)].map(({ offset }) =>
        describeInstruction(chunk, offset, root.table),
      ),
    );

describe("a method call", () => {
  it("emits a colon call as before, with a CallValue that names the method", () => {
    // Before I-1412 the colon calls ended `CallValue 2` and `CallValue 3`;
    // every other instruction is unchanged.
    expect(code(compiled(SCRIPT))).toEqual([
      ["MakeTable 0", "SetVar t flags 1"],
      [
        "GetVar t",
        "SetVar __t$0 flags 1",
        "GetVar __t$0",
        "Int 1",
        "GetVar __t$0",
        'Str "add"',
        "Index",
        'CallValue 2 method "add"',
        "Pop",
      ],
      ["Int 1", "GetVar t", 'Str "add"', "Index", "CallValue 1", "Pop"],
      [
        "GetVar t",
        "SetVar __t$0 flags 1",
        "GetVar __t$0",
        "Int 2",
        "Int 3",
        "GetVar __t$0",
        'Str "add"',
        "Index",
        'CallValue 3 method "add"',
        "SetVar v flags 1",
      ],
    ]);
  });

  it("names the method by the string its lookup already interned", () => {
    const root = compiled(SCRIPT);
    expect(root.table.strings.filter((s) => s === "add")).toHaveLength(1);
  });
});
