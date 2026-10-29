import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import { describeInstruction } from "../../program/BinaryProgramWriter";
import type { ProgramRoot } from "../../program/ProgramRoot";
import type { ProgramChunk } from "../../program/ProgramChunk";
import { ProgramStory } from "../../program/ProgramStory";
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

describe("a save written before colon calls named their method", () => {
  const SAVED_SCRIPT = [
    "store x = 0",
    "store o = nil",
    "",
    "-> start",
    "",
    "scene start",
    "  & o = { left = 2, m = function(self, v) return show(v) end, more = function(self) self.left = self.left - 1 return self.left >= 0 end }",
    "  Before.",
    "  & x = x + o:m(10)",
    "  After {x}.",
    "  while o:more() do",
    "    Pass {o.left}.",
    "  end",
    "  The end.",
    "end",
    "",
    "function show(v)",
    '  display("Shown " .. v)',
    "  return v",
    "end",
    "",
  ].join("\n");

  const fixture = JSON.parse(
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "fixtures", "program-save-pre-1412.json"),
      "utf-8",
    ),
  );

  const loaded = (save: unknown) => {
    const story = new ProgramStory(compiled(SAVED_SCRIPT));
    story.onError = () => {};
    story.loadSave(JSON.stringify(save));
    const beats: string[] = [];
    while (story.canContinue) {
      story.Continue();
      const text = story.currentText?.trim();
      if (text) beats.push(text);
    }
    return { report: story.loadedSaveReport!, beats };
  };

  it("resumes inside the statement whose colon call the frame returns to", () => {
    const { report, beats } = loaded(fixture.insideStatement);
    expect(report.warnings).toEqual([]);
    expect(report.exact).toBe(true);
    expect(beats).toEqual(["After 10.", "Pass 1.", "Pass 0.", "The end."]);
  });

  it("resumes inside the loop whose test is a colon call", () => {
    const { report, beats } = loaded(fixture.insideLoop);
    expect(report.warnings).toEqual([]);
    expect(report.exact).toBe(true);
    expect(beats).toEqual(["Pass 0.", "The end."]);
  });
});
