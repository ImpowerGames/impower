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
  TEXTS[MAIN].split("\n").findIndex((line: string) => line.startsWith("scene ")) + 1;

describe("the checkpoints of a game on the program engine", () => {
  it("are images, a keyframe every base interval beats and deltas between", () => {
    const { program, story } = compiler(TEXTS).compile();
    expect(program.chunks).toBeDefined();
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

  // Round 1 of the review of #1618 (report 6026303325): a save's executed
  // record held the addresses of the process that wrote it, whose chunk ids
  // another compile does not give again, so a game that loaded it into such
  // a program lost the last executed location, or read another statement's.
  it("write the executed record durably, which a program whose chunk ids differ places", () => {
    const { program, story } = compiler(TEXTS).compile();
    const game = createGame(program, story, { checkpointBaseInterval: 7 });
    drive(game);
    // A program of the same statements whose chunk ids all differ: a scene
    // above them takes the first ids.
    const EXTRA = ["scene EXTRA", "  Extra one.", "  Extra two.", "end", ""];
    const shifted = { ...TEXTS, [MAIN]: [...EXTRA, TEXTS[MAIN]].join("\n") };
    const lineText = (texts: Record<string, string>, location: any) =>
      texts[location.uri]!.split("\n")[location.range.start.line];
    const executed = (g: Game) =>
      (g as any)._runtimeState.pathsExecutedThisFrame.toArray() as unknown[];
    const store = game.checkpoints;
    // A checkpoint whose beat ran statements, restored in place: a continue
    // starts the record again, so where the run happens to stop says
    // nothing of it.
    const ran = Array.from({ length: store.length }, (_, i) => i).filter(
      (i) => JSON.parse(JSON.parse(store.getJson(i)!).runtime).pathsExecutedThisFrame.length > 0,
    );
    expect(ran.length).toBeGreaterThan(2);
    const mid = ran[Math.floor(ran.length / 2)]!;
    expect(game.restoreCheckpoint(mid)).toBe(true);
    expect(executed(game).length).toBeGreaterThan(0);
    const saves = [game.save(), store.getJson(mid)!];
    for (const save of saves) {
      const runtime = JSON.parse(JSON.parse(save).runtime);
      expect(runtime.pathsExecutedThisFrame.length).toBeGreaterThan(0);
      const same = compiler(TEXTS).compile();
      const here = createGame(same.program, same.story);
      here.start();
      expect(here.load(save)).toBe(true);
      const other = compiler(shifted).compile();
      const there = createGame(other.program, other.story);
      there.start();
      expect(there.load(save)).toBe(true);
      // The last executed location is the same line of the same script.
      const hereAt = here.getLastExecutedDocumentLocation();
      const thereAt = there.getLastExecutedDocumentLocation();
      expect(hereAt).not.toBeNull();
      expect(thereAt).not.toBeNull();
      expect(thereAt!.range.start.line - hereAt!.range.start.line).toBe(
        thereAt!.uri === MAIN ? EXTRA.length : 0,
      );
      expect(lineText(shifted, thereAt)).toBe(lineText(TEXTS, hereAt));
      // Every executed position is placed, at another address, and the save
      // holds none of the writer's addresses.
      expect(executed(there).length).toBe(runtime.pathsExecutedThisFrame.length);
      expect(executed(here).length).toBe(runtime.pathsExecutedThisFrame.length);
      expect(executed(there)).not.toEqual(executed(here));
      expect(
        runtime.pathsExecutedThisFrame.every((e: unknown) => typeof e === "string"),
      ).toBe(true);
      // And it saves again as it was written.
      expect(JSON.parse(there.save()).runtime).toBe(JSON.parse(save).runtime);
    }
  });

  // Round 1 of the review of #1579 (report 6016565874): a refused save left
  // the modules it carried loaded.
  it("refuse a save the story cannot place, leaving every module, the story and a waiting preview as they were", () => {
    const { program, story } = compiler(TEXTS).compile();
    const game = createGame(program, story, { checkpointBaseInterval: 7 });
    drive(game);
    const store = game.checkpoints;
    // An early checkpoint's save, with a module state the game does not
    // have now and a story of a format this engine does not read.
    const early = JSON.parse(store.getJson(5)!);
    const story5 = JSON.parse(early.story);
    story5.format = 99;
    early.story = JSON.stringify(story5);
    early.modules.core = { ...early.modules.core, marker: "from the refused save" };
    const before = game.save();
    expect(JSON.stringify(JSON.parse(before).modules)).not.toBe(
      JSON.stringify(early.modules),
    );
    // A preview waiting for its pictures (round 2 of the review of #1579,
    // report 6018735541) still waits after the refusal, and a load that
    // succeeds lets go of it.
    let cancelled = 0;
    const waiting = () => ({
      path: "preview",
      generation: 0,
      promise: Promise.resolve(null),
      abandon: () => {},
      cancel: () => {
        cancelled += 1;
      },
    });
    (game as any)._pendingPreview = waiting();
    expect(game.load(JSON.stringify(early))).toBe(false);
    expect(game.save()).toBe(before);
    expect(cancelled).toBe(0);
    expect((game as any)._pendingPreview).not.toBeNull();
    expect(game.load(store.getJson(5)!)).toBe(true);
    expect(cancelled).toBe(1);
    expect((game as any)._pendingPreview).toBeNull();
  });

  // Round 1 of the review of #1579 (report 6017530237): a save the story
  // places but cannot read ended the line in progress before it failed.
  it("refuse a save malformed past its placement with a line in progress, which stays in progress", () => {
    const { program, story } = compiler(TEXTS).compile();
    const game = createGame(program, story, { checkpointBaseInterval: 7 });
    drive(game);
    const malformed = JSON.parse(game.checkpoints.getJson(5)!);
    const inner = JSON.parse(malformed.story);
    inner.beats[0].counts = [null];
    malformed.story = JSON.stringify(inner);
    malformed.modules.core = { ...malformed.modules.core, marker: "from the refused save" };
    const engine = game.story as unknown as ProgramStory;
    engine.ChoosePathString("MAIN");
    engine.ContinueAsync();
    expect(engine.asyncContinueComplete).toBe(false);
    const state = engine.state.toJson();
    const core = () => JSON.stringify((game as any)._modules.core?.state);
    const modules = core();
    // And with a preview waiting for its pictures (round 2 of the review of
    // #1579, report 6019356082), which still waits.
    let cancelled = 0;
    (game as any)._pendingPreview = {
      path: "preview",
      generation: 0,
      promise: Promise.resolve(null),
      abandon: () => {},
      cancel: () => {
        cancelled += 1;
      },
    };
    expect(game.load(JSON.stringify(malformed))).toBe(false);
    expect(engine.asyncContinueComplete).toBe(false);
    expect(engine.state.toJson()).toBe(state);
    expect(core()).toBe(modules);
    expect(cancelled).toBe(0);
    expect((game as any)._pendingPreview).not.toBeNull();
  });

  // Round 3 of the review of #1579 (report 6019804221): a save written
  // while the story could not save holds an empty story, and a save whose
  // runtime record or module states cannot be read failed only after the
  // story had loaded.
  // Round 4 (report 6020262053): a module state missing or null, a module
  // map that is a list, a runtime record missing or of another shape.
  it("refuse a save with no story, or whose runtime record or module states cannot be read, changing nothing", () => {
    const { program, story } = compiler(TEXTS).compile();
    const game = createGame(program, story, { checkpointBaseInterval: 7 });
    drive(game);
    const valid = game.checkpoints.getJson(5)!;
    const engine = game.story as unknown as ProgramStory;
    engine.ChoosePathString("MAIN");
    engine.ContinueAsync();
    expect(engine.asyncContinueComplete).toBe(false);
    // A save the game wrote while its story could not save (asked from
    // inside a continue, or with a line in progress on a story that keeps no
    // beat images) holds an empty story. A line in progress on the game's
    // story saves (#1693), so that save is written here as the game writes
    // it.
    const storyless = JSON.stringify({ ...JSON.parse(valid), story: "" });
    const unreadableRuntime = { ...JSON.parse(valid), runtime: "{not json" };
    const noModules = JSON.parse(valid);
    delete noModules.modules;
    expect(Object.keys(JSON.parse(valid).modules)).toContain("interpreter");
    const noInterpreter = JSON.parse(valid);
    delete noInterpreter.modules.interpreter;
    const nullInterpreter = JSON.parse(valid);
    nullInterpreter.modules.interpreter = null;
    const listModules = { ...JSON.parse(valid), modules: [] };
    const noRuntime = JSON.parse(valid);
    delete noRuntime.runtime;
    const runtimeOfAnotherShape = {
      ...JSON.parse(valid),
      runtime: JSON.stringify({
        pathsExecutedThisFrame: [],
        choicesEncountered: {},
        conditionsEncountered: {},
      }),
    };
    const state = engine.state.toJson();
    const core = () => JSON.stringify((game as any)._modules.core?.state);
    const modules = core();
    const runtime = () => (game as any)._runtimeState.toJSON();
    const runtimeBefore = runtime();
    let cancelled = 0;
    (game as any)._pendingPreview = {
      path: "preview",
      generation: 0,
      promise: Promise.resolve(null),
      abandon: () => {},
      cancel: () => {
        cancelled += 1;
      },
    };
    for (const save of [
      storyless,
      JSON.stringify(unreadableRuntime),
      JSON.stringify(noModules),
      JSON.stringify(noInterpreter),
      JSON.stringify(nullInterpreter),
      JSON.stringify(listModules),
      JSON.stringify(noRuntime),
      JSON.stringify(runtimeOfAnotherShape),
    ]) {
      expect(game.load(save)).toBe(false);
      expect(engine.asyncContinueComplete).toBe(false);
      expect(engine.state.toJson()).toBe(state);
      expect(core()).toBe(modules);
      expect(runtime()).toBe(runtimeBefore);
      expect(cancelled).toBe(0);
    }
    // The valid save loads, and ends the line and the wait.
    expect(game.load(valid)).toBe(true);
    expect(engine.asyncContinueComplete).toBe(true);
    expect(cancelled).toBe(1);
  });

  it("restore in place after a compile for every statement it kept, translate one it emitted again, and report one it cannot place unplaced", () => {
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
    // An edit to the statement the checkpoint rests at emits it again: the
    // checkpoint is translated through its saved form in the root it was
    // taken in, and placed at the edited statement (#1429).
    const at = edit(3, 6, "  Three".length, " again");
    game.updateProgram(at.program, at.story);
    expect(game.checkpoints.getJson(two)).not.toBeNull();
    expect(game.restoreCheckpoint(two)).toBe(true);
    expect(game.story.variablesState.GetVariableWithName("seen")?.toString()).toBe("1");
    // A compile that leaves none of the scene's statements places nothing.
    c.compiler.updateDocument({
      textDocument: { uri: MAIN, version: 4 },
      contentChanges: [
        {
          range: {
            start: { line: 3, character: 0 },
            end: { line: 8, character: "  Five.".length },
          },
          text: "  Elsewhere.",
        },
      ],
    });
    const gone = c.compile();
    game.updateProgram(gone.program, gone.story);
    // It has no save (round 2 of the review of #1579, report 6019356082):
    // one with no story would load the checkpoint's modules beside a story
    // that stands elsewhere.
    expect(game.checkpoints.getJson(two)).toBeNull();
    expect(game.checkpoints.at(two)).toBeNull();
    // With a line in progress (round 1 of the review of #1579, report
    // 6016969769): the unplaced checkpoint cancels nothing.
    const engine = game.story as unknown as ProgramStory;
    engine.ChoosePathString("MAIN");
    engine.ContinueAsync();
    expect(engine.asyncContinueComplete).toBe(false);
    const before = engine.state.toJson();
    expect(game.restoreCheckpoint(two)).toBe(false);
    expect(engine.asyncContinueComplete).toBe(false);
    expect(engine.state.toJson()).toBe(before);
  });
});
