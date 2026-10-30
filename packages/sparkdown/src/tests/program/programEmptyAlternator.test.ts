import { describe, expect, it } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, errorsOf, storyRun } from "./programHarness";

const run = (text: string) => {
  const { program } = compileScript(text);
  const result = program.chunks ? storyRun(new ProgramStory(program.chunks), []) : null;
  return { errors: errorsOf(program), result };
};

const noArm = (name: string, line: number): [number, string] => [
  line,
  `A \`${name}\` needs at least one arm, written \`| ...\``,
];

describe("an alternator keyword with no arms (#1617)", () => {
  it.each([
    ["shuffle done", "scene start\n  shuffle done\nend\n", "shuffle", 1],
    ["shuffle, done with a comma for an arm separator", "scene start\n  shuffle, done\nend\n", "shuffle", 1],
    ["shuffle on its own line", "scene start\n  shuffle\n  done\nend\n", "shuffle", 1],
    ["shuffle cycle x", "scene start\n  shuffle cycle x\nend\n", "shuffle cycle", 1],
    ["shuffle once x", "scene start\n  shuffle once x\nend\n", "shuffle", 1],
    ["shuffle x after a line that reads the scene's count", "scene start\n  Seen {start}.\n  shuffle x\nend\n", "shuffle", 2],
    ["cycle x", "scene start\n  cycle x\nend\n", "cycle", 1],
    ["queue done", "scene start\n  queue done\nend\n", "queue", 1],
    ["shuffle queue x", "scene start\n  shuffle queue x\nend\n", "shuffle queue", 1],
  ] as const)("reports the missing arm and does not throw out of Continue: %s", (_name, text, keyword, line) => {
    let outcome: ReturnType<typeof run> | undefined;
    expect(() => {
      outcome = run(text);
    }).not.toThrow();
    expect(outcome!.errors).toContainEqual(noArm(keyword, line));
  });

  it("reads an inline {shuffle} as a name and does not throw out of Continue", () => {
    let outcome: ReturnType<typeof run> | undefined;
    expect(() => {
      outcome = run("scene start\n  Pick {shuffle}.\n  done\nend\n");
    }).not.toThrow();
    expect(outcome!.errors).toEqual([]);
  });

  it("leaves an alternator with arms unchanged", () => {
    const { errors, result } = run("scene start\n  shuffle queue | Lucky. | Plain. end\nend\n");
    expect(errors).toEqual([]);
    expect(result!.errors).toEqual([]);
    expect(result!.beats.length).toBe(1);
  });
});
