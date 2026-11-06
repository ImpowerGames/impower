import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Game } from "../../game/core/classes/Game";

const MAIN = "file:///local/main.sd";

const BEATS = 2000;

const BYTES_PER_1000_BEATS = 1_500_000;

function longRun(beats: number): SparkProgram {
  const lines = ["store count = 0", "", "scene start"];
  for (let i = 0; i < beats; i += 1) {
    lines.push("  count = count + 1", `  Beat number ${i} of the long run.`);
  }
  lines.push("end", "");
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: MAIN,
        type: "script",
        name: "main",
        ext: "sd",
        text: lines.join("\n"),
        version: 1,
        languageId: "sparkdown",
      },
    ] as never,
    seedBuiltinsIntoStory: true,
  });
  const program = compiler.compile({ textDocument: { uri: MAIN } }).program;
  expect(program.chunks).toBeDefined();
  return program as SparkProgram;
}

function playAll(program: SparkProgram, checkpointByteBudget?: number) {
  const game = new Game({
    now: () => 0,
    setTimeout: (() => 0) as never,
    resolve: (path: string) => path,
    fetch: async () => "",
    log: () => {},
    program,
    ...(checkpointByteBudget !== undefined ? { checkpointByteBudget } : {}),
  } as never);
  const text = () => (game.story.currentText ?? "").trim();
  game.start();
  for (let i = 1; i < BEATS; i += 1) {
    game.clickedToContinue();
  }
  expect(text()).toBe(`Beat number ${BEATS - 1} of the long run.`);
  const count = () =>
    game.getVarVariables().find((v) => v.name === "count")?.value;
  return { game, text, count };
}

describe("a run keeps its checkpoints within a budget", () => {
  const program = longRun(BEATS);

  test(`a run of ${BEATS} beats keeps every beat within the budget per 1000 beats`, async () => {
    const { game, text, count } = playAll(program);
    const per1000 = Math.round((game.checkpoints.bytes / BEATS) * 1000);
    expect(
      per1000,
      `the store holds ${per1000} bytes per 1000 beats over ${BEATS} beats`,
    ).toBeLessThanOrEqual(BYTES_PER_1000_BEATS);
    expect(game.checkpoints.stats.folded).toBe(0);
    for (let i = BEATS - 2; i >= BEATS - 6; i -= 1) {
      expect((await game.rollBack("beat")).moved).toBe(true);
      expect(text()).toBe(`Beat number ${i} of the long run.`);
    }
    expect((await game.rollBack("choice")).moved).toBe(true);
    expect(text()).toBe("Beat number 0 of the long run.");
    expect(count()).toBe("1");
  }, 600_000);

  test("past the budget the oldest beats fold into keyframes, and the run's start and latest beats stay", async () => {
    const full = playAll(program).game.checkpoints.bytes;
    const budget = Math.round(full / 2);
    const { game, text, count } = playAll(program, budget);
    const stats = game.checkpoints.stats;
    expect(stats.folded).toBeGreaterThan(0);
    expect(game.checkpoints.bytes).toBeLessThanOrEqual(budget);
    const shown = [BEATS - 1];
    while ((await game.rollBack("beat")).moved) {
      shown.push(Number(/Beat number (\d+)/.exec(text())?.[1]));
    }
    const gaps = shown.slice(1).map((n, i) => shown[i]! - n);
    expect(gaps.every((gap) => gap >= 1)).toBe(true);
    expect(gaps.slice(0, 49).every((gap) => gap === 1)).toBe(true);
    expect(Math.max(...gaps)).toBeGreaterThan(1);
    expect(shown.at(-1)).toBe(0);
    expect(count()).toBe("1");
    expect(game.history.canRollBack).toBe(false);
    expect((await game.rollForward("choice")).moved).toBe(true);
    expect(text()).toBe(`Beat number ${BEATS - 1} of the long run.`);
    expect(count()).toBe(String(BEATS));
  }, 600_000);
});
