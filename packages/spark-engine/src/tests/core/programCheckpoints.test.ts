// A game on the program engine checkpoints its beats as images of the
// engine's state (#699, docs/engine/binary-program.md, section 7): a keyframe
// every `baseInterval` beats and deltas between, which hold the counts,
// globals and tables a beat changed and no JSON. A checkpoint's full save is
// the engine's durable save of its image, which loads into a fresh game and
// saves again as it was; a checkpoint restores in place within the session,
// across a compile for every statement the compile kept.
import "@impower/sparkdown/src/inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { buildChunksFixture } from "../../../../../scripts/bench/preview-fixture.mjs";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import type { Story } from "@impower/sparkdown/src/inkjs/engine/Story";
import {
  keyedStateOf,
  type ProgramImage,
} from "@impower/sparkdown/src/program/ProgramImages";
import { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
import { Game } from "../../game/core/classes/Game";

const MAIN = "file:///local/main.sd";

const scriptFiles = (texts: Record<string, string>) =>
  Object.entries(texts).map(([uri, text]) => ({
    uri,
    type: "script",
    name: uri.split("/").at(-1)!.split(".")[0]!,
    ext: "sd",
    text,
    version: 1,
    languageId: "sparkdown",
  }));

/** A compiler configured as the player's worker configures its compiler,
 *  with statement chunks on. */
function compiler(texts: Record<string, string>) {
  const c = new SparkdownCompiler();
  let story: Story | undefined;
  c.addEventListener("compiler/didCompile", (params) => {
    story = params.story as Story | undefined;
  });
  c.configure({
    files: scriptFiles(texts) as never,
    seedBuiltinsIntoStory: true,
    emitCompiledProgram: false,
    programChunks: true,
  });
  return {
    compiler: c,
    compile() {
      const program = c.compile({ textDocument: { uri: MAIN } }).program;
      return { program, story: story! };
    },
  };
}

function createGame(
  program: SparkProgram,
  story: Story,
  config: Record<string, unknown> = {},
) {
  return new Game({
    now: () => 0,
    setTimeout: (handler: Function) => {
      handler();
      return 0;
    },
    resolve: (path: string) => path,
    fetch: async () => "",
    log: () => {},
    program,
    story,
    programChunks: true,
    startFrom: { file: MAIN, line: FIRST_LINE },
    ...config,
  } as never);
}

/** Drives a game until it finishes, taking the first choice wherever one is
 *  offered, and returns the beats it flushed, and for each checkpoint it
 *  took, how many beats it had flushed by then. */
function drive(game: Game, start = true) {
  let finished = false;
  game.connection.connectOutput((message) => {
    if ((message as { method?: string }).method === "game/finished") {
      finished = true;
    }
  });
  const flushed: string[] = [];
  const interpreter = game.module.interpreter;
  const flush = interpreter.flush.bind(interpreter);
  interpreter.flush = () => {
    const instructions = flush();
    if (instructions) {
      flushed.push(JSON.stringify(instructions));
    }
    return instructions;
  };
  const at: number[] = [];
  const checkpoint = game.checkpoint.bind(game);
  game.checkpoint = () => {
    checkpoint();
    at[game.checkpoints.length - 1] = flushed.length;
  };
  if (start) {
    game.start();
  }
  let lastChoices = false;
  for (let turns = 0; !finished && turns < 5000; turns += 1) {
    const last = flushed.at(-1);
    lastChoices = Boolean(last && JSON.parse(last).choices?.length);
    if (lastChoices) {
      game.chosePathToContinue(0);
    } else {
      game.clickedToContinue();
    }
  }
  return { flushed, at, finished };
}

const FIXTURE = buildChunksFixture({ scenes: 4, linesPerScene: 60, thenLines: 160 });
const TEXTS = {
  [MAIN]: FIXTURE.files.get("main.sd")!,
  "file:///local/scripts/characters.sd": FIXTURE.files.get("scripts/characters.sd")!,
};
// The first line of the fixture's first scene, which the game starts from.
const FIRST_LINE =
  TEXTS[MAIN].split("\n").findIndex((line) => line.startsWith("scene ")) + 1;

describe("the checkpoints of a game on the program engine", () => {
  it("are images, a keyframe every base interval beats and deltas between", () => {
    const { program, story } = compiler(TEXTS).compile();
    expect(program.fallback).toBeUndefined();
    const game = createGame(program, story, { checkpointBaseInterval: 10 });
    const run = drive(game);
    expect(run.finished).toBe(true);
    expect(game.story).toBeInstanceOf(ProgramStory);
    const store = game.checkpoints;
    expect(store.length).toBeGreaterThan(80);
    expect(store.stats.keyframes).toBe(Math.ceil(store.length / 10));
    expect(store.stats.fallbacks).toBe(0);
    for (let i = 0; i < store.length; i += 1) {
      const image = store.imageAt(i)!.image as ProgramImage;
      expect(image.keyframe === image).toBe(i % 10 === 0);
    }
  });

  it("hold the changed count ids only, and do not grow with the number of beats replayed", () => {
    const { program, story } = compiler(TEXTS).compile();
    const game = createGame(program, story, { checkpointBaseInterval: 50 });
    drive(game);
    const store = game.checkpoints;
    const images = Array.from(
      { length: store.length },
      (_, i) => store.imageAt(i)!.image as ProgramImage,
    );
    const sizes: number[] = [];
    images.forEach((image, i) => {
      if (image.keyframe === image) {
        return;
      }
      // The count ids a delta holds are the ids whose visits or turn changed
      // since the image before it.
      const before = keyedStateOf(images[i - 1]!);
      const after = keyedStateOf(image);
      const changed: number[] = [];
      for (let id = 0; id < after.visits.length; id += 1) {
        if (
          after.visits[id] !== (before.visits[id] ?? 0) ||
          after.turns[id] !== (before.turns[id] ?? -0x80000000)
        ) {
          changed.push(id);
        }
      }
      expect([...image.countIds!].sort((a, b) => a - b)).toEqual(changed);
      sizes.push(
        image.countIds!.length +
          image.globals.size +
          image.tables.size +
          image.cells.size +
          image.positional.frames +
          image.positional.output.length,
      );
    });
    // What a beat's delta holds is what that beat changed, however many
    // beats came before it: the deltas of the last third of the route are
    // the size of those of the first.
    const third = Math.floor(sizes.length / 3);
    const early = Math.max(...sizes.slice(0, third));
    const late = Math.max(...sizes.slice(-third));
    expect(sizes.length).toBeGreaterThan(80);
    expect(late).toBeLessThanOrEqual(early * 2);
    expect(late).toBeLessThan(40);
  });

  it("each load into a fresh game, which saves again as it was and continues as the game did", () => {
    const { program, story } = compiler(TEXTS).compile();
    const game = createGame(program, story, { checkpointBaseInterval: 7 });
    const run = drive(game);
    const store = game.checkpoints;
    for (let i = 0; i < store.length; i += Math.ceil(store.length / 12)) {
      const save = store.getJson(i)!;
      expect(JSON.parse(JSON.parse(save).story).engine).toBe("program");
      const again = compiler(TEXTS).compile();
      const fresh = createGame(again.program, again.story);
      fresh.start();
      expect(fresh.load(save)).toBe(true);
      expect(fresh.save()).toBe(save);
      const rest = drive(fresh, false);
      expect(rest.flushed).toEqual(run.flushed.slice(run.at[i]));
    }
  });

  it("restore in place after a compile for every statement it kept, and report one it emitted again unplaced", () => {
    const text = [
      "store seen = 0",
      "",
      "scene MAIN",
      "  One.",
      "  & seen = seen + 1",
      "  Two {seen}.",
      "  Three.",
      "  Four.",
      "end",
      "",
    ].join("\n");
    const c = compiler({ [MAIN]: text });
    const first = c.compile();
    const game = createGame(first.program, first.story, {
      startFrom: { file: MAIN, line: 3 },
    });
    const run = drive(game);
    expect(run.finished).toBe(true);
    // The checkpoint of the beat `Two`.
    const two = run.at.findIndex((count, i) => count === 2 && i > 0);
    expect(two).toBeGreaterThan(0);
    const edit = (version: number, line: number, character: number, insert: string) => {
      c.compiler.updateDocument({
        textDocument: { uri: MAIN, version },
        contentChanges: [
          {
            range: { start: { line, character }, end: { line, character } },
            text: insert,
          },
        ],
      });
      return c.compile();
    };
    // An edit below the checkpoint keeps every statement it names.
    const below = edit(2, 7, "  Four.".length, "\n  Five.");
    game.updateProgram(below.program, below.story);
    expect(game.restoreCheckpoint(two)).toBe(true);
    expect(game.story.variablesState.GetVariableWithName("seen")?.toString()).toBe("1");
    // An edit to the statement the checkpoint rests at emits it again.
    const at = edit(3, 6, "  Three".length, " again");
    game.updateProgram(at.program, at.story);
    const before = (game.story as unknown as ProgramStory).state.toJson();
    expect(game.restoreCheckpoint(two)).toBe(false);
    expect((game.story as unknown as ProgramStory).state.toJson()).toBe(before);
  });
});
