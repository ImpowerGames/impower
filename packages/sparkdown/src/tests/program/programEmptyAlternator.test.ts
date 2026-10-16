import { describe, expect, it } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, errorsOf, storyRun } from "./programHarness";

const run = (text: string, from?: string) => {
  const { program } = compileScript(text);
  const result = program.chunks
    ? storyRun(new ProgramStory(program.chunks), [], from ? { from } : {})
    : null;
  return { errors: errorsOf(program), result };
};

const noArm = (name: string, line: number): [number, string] => [
  line,
  `A \`${name}\` needs at least one arm, written \`| ...\``,
];

describe("an alternator keyword with no arms (#1617)", () => {
  it.each([
    ["shuffle done at the top level", "shuffle done\n", undefined, "shuffle", 0],
    ["shuffle, done with a comma for an arm separator", "shuffle, done\n", undefined, "shuffle", 0],
    ["shuffle on its own line in a scene", "scene A\n  shuffle\n  done\nend\n", "A", "shuffle", 1],
    ["shuffle cycle x", "scene A\n  shuffle cycle x\nend\n", "A", "shuffle cycle", 1],
    ["shuffle once x", "scene A\n  shuffle once x\nend\n", "A", "shuffle", 1],
    ["shuffle x after a line that reads the scene's count", "scene A\n  Seen {A}.\n  shuffle x\nend\n", "A", "shuffle", 2],
    ["cycle x at the top level", "cycle x\n", undefined, "cycle", 0],
    ["queue done in a scene", "scene A\n  queue done\nend\n", "A", "queue", 1],
    ["shuffle queue x in a scene", "scene A\n  shuffle queue x\nend\n", "A", "shuffle queue", 1],
  ] as const)("reports the missing arm and does not throw out of Continue: %s", (_name, text, from, keyword, line) => {
    let outcome: ReturnType<typeof run> | undefined;
    expect(() => {
      outcome = run(text, from);
    }).not.toThrow();
    expect(outcome!.errors).toContainEqual(noArm(keyword, line));
  });

  // A structural word with no construct after it is a name, as in Luau
  // (#1906), so `{shuffle}` reads a variable named `shuffle`.
  it("reads an inline {shuffle} as a name and does not throw out of Continue", () => {
    let outcome: ReturnType<typeof run> | undefined;
    expect(() => {
      outcome = run("scene A\n  Pick {shuffle}.\n  done\nend\n", "A");
    }).not.toThrow();
    expect(outcome!.errors).toEqual([]);
  });

  it("leaves an alternator with arms unchanged", () => {
    const { errors, result } = run("shuffle queue | Lucky. | Plain. end\n");
    expect(errors).toEqual([]);
    expect(result!.errors).toEqual([]);
    expect(result!.beats.length).toBe(1);
  });
});
