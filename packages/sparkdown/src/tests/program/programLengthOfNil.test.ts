/**
 * The length operator on nil (I-1083).
 *
 * Luau raises `attempt to get length of a nil value` for `#nil`. The program
 * engine reports it as a story runtime error on its line, as it does for the
 * binary operators on nil, rather than throwing out of `Continue` or storing a
 * null that a later line trips over. Unary minus on nil raises Luau's
 * arithmetic error the same way; `not nil` stays valid and gives true.
 */
import { describe, expect, it } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, storyRun } from "./programHarness";

const run = (text: string) => {
  const { program } = compileScript(
    `scene start\n${text
      .split("\n")
      .map((line) => (line ? `  ${line}` : line))
      .join("\n")}end\n`,
  );
  const story = new ProgramStory(program.chunks!);
  return storyRun(story);
};

const LENGTH_OF_NIL: Record<string, string> = {
  "in a display interpolation": "Sum {#x}.\n",
  "in a local declaration": "& local n = #x\nAfter.\n",
  "of a nil local in an interpolation": "& local t = nil\nSum {#t}.\n",
  "in an if condition": "if # tag then\n  Yes.\nelse\n  No.\nend\n",
};

describe("the length operator on nil", () => {
  for (const [name, text] of Object.entries(LENGTH_OF_NIL)) {
    it(`raises Luau's runtime error ${name}`, () => {
      let result: ReturnType<typeof run> | undefined;
      expect(() => {
        result = run(text);
      }).not.toThrow();
      expect(result!.errors).toHaveLength(1);
      expect(result!.errors[0]).toContain(
        "attempt to get length of a nil value",
      );
    });
  }
});

it("is reported with the line prefix a binary operator on nil gets", () => {
  const length = run("Before.\n& local n = #x\n").errors;
  const binary = run("Before.\n& local n = x + 1\n").errors;
  expect(binary).toHaveLength(1);
  const prefix = binary[0]!.slice(0, binary[0]!.indexOf("attempt to"));
  expect(prefix).not.toBe("");
  expect(length).toEqual([`${prefix}attempt to get length of a nil value`]);
});

describe("the other unary operators on nil", () => {
  it("unary minus raises Luau's arithmetic error", () => {
    let result: ReturnType<typeof run> | undefined;
    expect(() => {
      result = run("& local n = -x\nAfter.\n");
    }).not.toThrow();
    expect(result!.errors).toHaveLength(1);
    expect(result!.errors[0]).toContain(
      "attempt to perform arithmetic (unm) on a nil value",
    );
  });

  it("not nil is true", () => {
    const result = run("& local t = nil\n{not t}\n");
    expect(result.errors).toEqual([]);
    expect(result.beats.map((b) => JSON.stringify(b))).toEqual([
      expect.stringContaining("true"),
    ]);
  });
});
