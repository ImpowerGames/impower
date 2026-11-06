import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Game } from "../../game/core/classes/Game";

const MAIN = "file:///local/main.sd";

const BEATS = 2000;

const BYTES_PER_1000_BEATS = 7_200_000;

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

function compileSource(text: string): SparkProgram {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: MAIN,
        type: "script",
        name: "main",
        ext: "sd",
        text,
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

function startGame(program: SparkProgram, options: Record<string, unknown>) {
  const game = new Game({
    now: () => 0,
    setTimeout: (() => 0) as never,
    resolve: (path: string) => path,
    fetch: async () => "",
    log: () => {},
    program,
    ...options,
  } as never);
  game.start();
  return game;
}

const liveImages = (game: Game): unknown[] =>
  ((game.checkpoints as any)._entries as any[])
    .filter((entry) => !entry.folded)
    .map((entry) => entry.image);

const reachableImages = (roots: unknown[]): Set<any> => {
  const seen = new Set<any>();
  const pending = [...roots] as any[];
  while (pending.length > 0) {
    const image = pending.pop();
    if (!image || seen.has(image)) {
      continue;
    }
    seen.add(image);
    pending.push(image.parent, image.keyframe, image.afterChoice?.menu);
  }
  return seen;
};

const menus = (n: number) =>
  [
    "store count = 0",
    "scene start",
    "  Begin.",
    ...Array.from({ length: n }, (_, i) => [
      "  count = count + 1",
      "  choose",
      `    * [A${i}]`,
      `      A result ${i}.`,
      `    * [B${i}]`,
      `      B result ${i}.`,
      "  end",
      `  After ${i}.`,
    ]).flat(),
    "  Final.",
    "end",
  ].join("\n");

describe("the store's count and its folding", () => {
  test("past the budget the oldest keyframes fold too, keeping the run's start", async () => {
    const budget = 800_000;
    const { game, text, count } = playAll(longRun(BEATS), budget);
    expect(
      game.checkpoints.bytes,
      `the store holds ${game.checkpoints.bytes} bytes with a budget of ${budget}`,
    ).toBeLessThanOrEqual(budget);
    expect(game.checkpoints.stats.keyframes).toBeLessThan(BEATS / 50);
    expect((await game.rollBack("choice")).moved).toBe(true);
    expect(text()).toBe("Beat number 0 of the long run.");
    expect(count()).toBe("1");
    expect((await game.rollForward("choice")).moved).toBe(true);
    expect(text()).toBe(`Beat number ${BEATS - 1} of the long run.`);
  }, 600_000);

  test("the count covers the story values every live checkpoint holds, and folding brings it within the budget", () => {
    const size = 50_000;
    const beats = 30;
    const budget = 2_000_000;
    const source = [
      'store payload = ""',
      "scene start",
      ...Array.from({ length: beats }, (_, i) => [
        `  payload = string.reverse(string.rep(tostring(${i}), ${size}))`,
        `  Beat ${i}.`,
      ]).flat(),
      "end",
    ].join("\n");
    const game = startGame(compileSource(source), {
      checkpointByteBudget: budget,
      checkpointBaseInterval: 5,
    });
    for (let i = 1; i < beats; i += 1) {
      game.clickedToContinue();
    }
    expect((game.story.currentText ?? "").trim()).toBe(`Beat ${beats - 1}.`);
    const strings = new Set<string>();
    for (const image of reachableImages(liveImages(game))) {
      for (const value of image.globals.values()) {
        if (typeof value?.value === "string" && value.value.length >= size) {
          strings.add(value.value);
        }
      }
    }
    const characters = [...strings].reduce((sum, s) => sum + s.length, 0);
    expect(characters).toBeGreaterThan(size);
    expect(
      game.checkpoints.bytes,
      `the store counts ${game.checkpoints.bytes} bytes while its checkpoints hold ${characters} characters of strings`,
    ).toBeGreaterThanOrEqual(characters * 2);
    expect(game.checkpoints.bytes).toBeLessThanOrEqual(budget);
    expect(game.checkpoints.stats.folded).toBeGreaterThan(0);
  });

  test("no folded checkpoint's image stays held by a live one", () => {
    const game = startGame(compileSource(menus(80)), {});
    for (let i = 0; i < 80; i += 1) {
      game.clickedToContinue();
      game.chosePathToContinue(0);
      game.clickedToContinue();
    }
    const entries = (game.checkpoints as any)._entries as any[];
    const images = entries.map((entry) => entry.image);
    const budget = Math.floor(game.checkpoints.bytes * 0.75);
    const folded = game.checkpoints.fold(
      budget,
      (game as any)._run.first.checkpoint,
    );
    expect(folded.length).toBeGreaterThan(0);
    const live = new Set(liveImages(game));
    const held = reachableImages([...live]);
    expect(
      folded.filter((i) => held.has(images[i]) && !live.has(images[i])),
    ).toEqual([]);
  });
});

describe("the count of tables a checkpoint holds", () => {
  test("covers the keys and values of tables held only through the story's globals", () => {
    const size = 50_000;
    const beats = 30;
    const budget = 2_000_000;
    const source = [
      "store payload = {}",
      "scene start",
      ...Array.from({ length: beats }, (_, i) => [
        `  payload = {[string.reverse(string.rep(tostring(${i}), ${size}))] = ${i}}`,
        `  Beat ${i}.`,
      ]).flat(),
      "end",
    ].join("\n");
    const game = startGame(compileSource(source), {
      checkpointByteBudget: budget,
      checkpointBaseInterval: 5,
    });
    for (let i = 1; i < beats; i += 1) {
      game.clickedToContinue();
    }
    expect((game.story.currentText ?? "").trim()).toBe(`Beat ${beats - 1}.`);
    const keys = new Set<string>();
    for (const image of reachableImages(liveImages(game))) {
      for (const copy of image.tables.values()) {
        for (const key of copy.entries?.keys() ?? []) {
          if (key.length >= size) {
            keys.add(key);
          }
        }
      }
      for (const value of image.globals.values()) {
        if (value?.value instanceof Map) {
          for (const key of value.value.keys()) {
            if (typeof key === "string" && key.length >= size) {
              keys.add(key);
            }
          }
        }
      }
    }
    const characters = [...keys].reduce((sum, key) => sum + key.length, 0);
    expect(characters).toBeGreaterThan(size);
    expect(
      game.checkpoints.bytes,
      `the store counts ${game.checkpoints.bytes} bytes while its checkpoints hold ${characters} characters of table keys`,
    ).toBeGreaterThanOrEqual(characters * 2);
    expect(game.checkpoints.bytes).toBeLessThanOrEqual(budget);
  });
});

describe("the count of what checkpoints hold beyond the globals", () => {
  const tightGame = (source: string) =>
    startGame(compileSource(source), {
      checkpointByteBudget: 2_000_000,
      checkpointBaseInterval: 5,
    });

  test("covers the keys a table's copies keep after the table is cleared", () => {
    const size = 50_000;
    const source = [
      "store payload = {}",
      "scene start",
      "  Begin.",
      ...Array.from({ length: 30 }, (_, i) => [
        "  table.clear(payload)",
        `  payload[string.reverse(string.rep(tostring(${i}), ${size}))] = ${i}`,
        `  Beat ${i}.`,
      ]).flat(),
      "end",
    ].join("\n");
    const game = tightGame(source);
    for (let i = 0; i < 100 && (game.story.currentText ?? "").trim() !== "Beat 29."; i += 1) {
      game.clickedToContinue();
    }
    expect((game.story.currentText ?? "").trim()).toBe("Beat 29.");
    const keys = new Set<string>();
    for (const image of reachableImages(liveImages(game))) {
      for (const copy of image.tables.values()) {
        for (const key of copy.entries?.keys() ?? []) {
          if (key.length >= size) {
            keys.add(key);
          }
        }
      }
    }
    const bytes = [...keys].reduce((sum, key) => sum + key.length * 2, 0);
    expect(bytes).toBeGreaterThan(2 * size);
    expect(
      game.checkpoints.bytes,
      `the store counts ${game.checkpoints.bytes} bytes while the table copies it holds keep ${bytes} bytes of keys`,
    ).toBeGreaterThanOrEqual(bytes);
  });

  test("covers the locals of the frames a checkpoint holds", () => {
    const size = 50_000;
    const source = [
      "scene start",
      "  -> visit ->",
      "  Done.",
      "end",
      "scene visit",
      '  local payload = ""',
      ...Array.from({ length: 30 }, (_, i) => [
        `  payload = string.reverse(string.rep(tostring(${i}), ${size}))`,
        `  Beat ${i}.`,
      ]).flat(),
      "  ->->",
      "end",
    ].join("\n");
    const game = tightGame(source);
    for (let i = 1; i < 30; i += 1) {
      game.clickedToContinue();
    }
    expect((game.story.currentText ?? "").trim()).toBe("Beat 29.");
    const strings = new Set<string>();
    for (const image of reachableImages(liveImages(game))) {
      for (const thread of image.positional.threads) {
        for (const frame of thread.elements) {
          for (const scope of frame.scopes) {
            for (const value of scope.values()) {
              if (typeof value?.value === "string" && value.value.length >= size) {
                strings.add(value.value);
              }
            }
          }
        }
      }
    }
    const bytes = [...strings].reduce((sum, value) => sum + value.length * 2, 0);
    expect(bytes).toBeGreaterThan(2 * size);
    expect(
      game.checkpoints.bytes,
      `the store counts ${game.checkpoints.bytes} bytes while the frames it holds keep ${bytes} bytes of locals`,
    ).toBeGreaterThanOrEqual(bytes);
  });
});

describe("the count of the run record", () => {
  test("charges each recorded beat's instructions to its checkpoint", () => {
    const line = "word ".repeat(4000).trim();
    const source = ["scene start", `  ${line} One.`, `  ${line} Two.`, "end"].join("\n");
    const game = startGame(compileSource(source), {});
    game.clickedToContinue();
    const beats = (game as any)._run.beats as { checkpoint: number; shown: unknown }[];
    expect(beats).toHaveLength(2);
    const entries = (game.checkpoints as any)._entries as { bytes: number }[];
    for (const beat of beats) {
      const shown = JSON.stringify(beat.shown).length * 2;
      expect(shown).toBeGreaterThan(line.length * 2);
      expect(entries[beat.checkpoint]!.bytes).toBeGreaterThanOrEqual(shown);
    }
  });
});
