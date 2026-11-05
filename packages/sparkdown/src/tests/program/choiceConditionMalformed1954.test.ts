import { describe, expect, it } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, storyRun } from "./programHarness";

const PRELUDE = [
  "store has_key = true",
  "store you = true",
  "store a = false",
  "store b = true",
  "function allowed()",
  "  return true",
  "end",
];
const CHOICE_LINE = PRELUDE.length + 2;
const UNREADABLE =
  "This condition cannot be read here, so the choice is never offered. Close any bracket left open, or compute the condition into a variable on an earlier line and test that, as in `* if ready Text`.";

const run = (line: string) => {
  const { program } = compileScript(
    [...PRELUDE, "scene start", "  choose", `    ${line}`, "    * Fallback", "  end", "end", ""].join("\n"),
  );
  const diagnostics = Object.values(program.diagnostics ?? {})
    .flat()
    .filter((d) => d.severity === 1)
    .map((d) => ({
      line: d.range.start.line,
      from: d.range.start.character,
      to: d.range.end.character,
      message: typeof d.message === "string" ? d.message : d.message.value,
    }));
  const story = storyRun(new ProgramStory(program.chunks!), []);
  return {
    errors: diagnostics,
    runErrors: story.errors,
    menu: story.menus[0]?.choices.map((c) => c.text) ?? [],
  };
};

describe("a choice condition that is clearly code but cannot be read is reported (I-1954)", () => {
  const cases: [string, string][] = [
    ["* if allowed( First", "allowed("],
    ["* if allowed[], First", "allowed["],
    ["* if not allowed( First", "allowed("],
    ["* if t.check( First", "t.check("],
    ["* if t:open( First", "t:open("],
    ["+ if allowed( First", "allowed("],
    ["* (lbl) if allowed( First", "allowed("],
    ["* (lbl)if allowed( First", "allowed("],
    ["* if allowed(", "allowed("],
  ];
  for (const [line, call] of cases) {
    it(line, () => {
      const { errors, menu } = run(line);
      const column = 4 + line.indexOf(call);
      expect(errors).toEqual([
        {
          line: CHOICE_LINE,
          from: column,
          to: column + call.length,
          message: UNREADABLE,
        },
      ]);
      expect(menu).toEqual(["Fallback"]);
    });
  }
});

describe("a label on the line after a readable condition stays text (I-1954)", () => {
  for (const indent of ["", "      "]) {
    it(`indent ${JSON.stringify(indent)}`, () => {
      const result = run(`* if has_key\n${indent}if allowed( First`);
      expect(result.errors).toEqual([]);
      expect(result.runErrors).toEqual([]);
      expect(result.menu).toEqual(["if allowed( First", "Fallback"]);
    });
  }
});

describe("choice lines starting with if keep their readings (I-1954)", () => {
  const cases: [string, string[]][] = [
    ["* if you're sure", ["if you're sure", "Fallback"]],
    ["* if has_key (aside) Take it", ["(aside) Take it", "Fallback"]],
    ["* if a or b Then", ["Fallback"]],
    ["* if b or a Then", ["or a Then", "Fallback"]],
    ["* if you dare, jump", ["dare, jump", "Fallback"]],
    ["* if b () First", ["() First", "Fallback"]],
    ["* if allowed() First", ["First", "Fallback"]],
    ["* if (allowed()) First", ["First", "Fallback"]],
    ["* if [you dare] jump", ["if you dare", "Fallback"]],
    ["* if (you're sure) jump", ["if (you're sure) jump", "Fallback"]],
    ["* if (you dare), jump", ["if (you dare), jump", "Fallback"]],
    ["* if (I'm lucky) jump", ["if (I'm lucky) jump", "Fallback"]],
    ["* if (maybe jump", ["if (maybe jump", "Fallback"]],
    ["* if (friend(s) agree), jump", ["if (friend(s) agree), jump", "Fallback"]],
    ["* if (maybe(?) you dare), jump", ["if (maybe(?) you dare), jump", "Fallback"]],
    ["* if (friend(s) don't agree) jump", ["if (friend(s) don't agree) jump", "Fallback"]],
    ["* if friend(s), we go", ["if friend(s), we go", "Fallback"]],
  ];
  for (const [line, menu] of cases) {
    it(line, () => {
      const result = run(line);
      expect(result.errors).toEqual([]);
      expect(result.runErrors).toEqual([]);
      expect(result.menu).toEqual(menu);
    });
  }
});

describe("an unclosed group stays choice text, as on main (I-1954)", () => {
  for (const line of [
    "* if (allowed( First",
    "* if (not allowed( First",
    "* if (has_key and allowed( First",
    "* if (has_key First",
  ]) {
    it(line, () => {
      const result = run(line);
      expect(result.errors).toEqual([]);
      expect(result.runErrors).toEqual([]);
      expect(result.menu).toEqual([line.slice(2), "Fallback"]);
    });
  }
});

describe("a word glued to closed brackets keeps the condition reading (I-1954)", () => {
  for (const line of ["* if maybe(?) jump", "* if friend(s) agree"]) {
    it(line, () => {
      const result = run(line);
      expect(result.errors.map((e) => e.message)).not.toContain(UNREADABLE);
      expect(result.menu).not.toContain(line.slice(2));
    });
  }
});
