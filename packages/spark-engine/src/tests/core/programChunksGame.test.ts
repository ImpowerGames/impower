// A program compiled to statement chunks runs to its end through a game built
// as the player's worker builds one (#694): the compiler configured as the
// worker configures it, and a game given the compile's program and story with
// the worker's checkpoint settings. With `programChunks` on, the game runs the
// program engine, and every beat it presents is the beat the current engine
// presents.
import "@impower/sparkdown/src/inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { buildBeatsFixture } from "../../../../../scripts/bench/preview-fixture.mjs";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Story } from "@impower/sparkdown/src/inkjs/engine/Story";
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

/** The program and story of a compile configured as the player's worker
 *  configures its compiler. */
function compile(texts: Record<string, string>, programChunks: boolean) {
  const compiler = new SparkdownCompiler();
  let story: Story | undefined;
  compiler.addEventListener("compiler/didCompile", (params) => {
    story = params.story as Story | undefined;
  });
  compiler.configure({
    files: scriptFiles(texts) as never,
    seedBuiltinsIntoStory: true,
    emitCompiledProgram: false,
    programChunks,
  });
  const program = compiler.compile({ textDocument: { uri: MAIN } }).program;
  return { program, story: story! };
}

/** Runs a game from `startFrom` until it reports that it finished, taking the
 *  first choice wherever one is offered, and returns every beat it flushed. */
function play(
  program: SparkProgram,
  story: Story,
  programChunks: boolean,
  startFrom: { file: string; line: number },
) {
  const game = new Game({
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
    incrementalCheckpoints: true,
    verifyCheckpoints: false,
    programChunks,
    startFrom,
  } as never);
  let finished = false;
  game.connection.connectOutput((message) => {
    if ((message as { method?: string }).method === "game/finished") {
      finished = true;
    }
  });
  const flushed: any[] = [];
  const interpreter = game.module.interpreter;
  const flush = interpreter.flush.bind(interpreter);
  interpreter.flush = () => {
    const instructions = flush();
    if (instructions) {
      flushed.push(JSON.parse(JSON.stringify(instructions)));
    }
    return instructions;
  };
  game.start();
  for (let turns = 0; !finished && turns < 5000; turns += 1) {
    if (flushed.at(-1)?.choices?.length) {
      game.chosePathToContinue(0);
    } else {
      game.clickedToContinue();
    }
  }
  return { flushed, finished, engine: game.story, game };
}

describe("a game that runs statement chunks", () => {
  it("runs the beats fixture to its end as it runs on the current engine", () => {
    const { files } = buildBeatsFixture({ lines: 300 });
    const texts = {
      [MAIN]: files.get("main.sd")!,
      "file:///local/scripts/characters.sd": files.get("scripts/characters.sd")!,
    };
    const startFrom = { file: MAIN, line: 3 };
    const on = compile(texts, true);
    expect(on.program.fallback).toBeUndefined();
    expect(on.program.chunks).toBeDefined();
    const chunks = play(on.program, on.story, true, startFrom);
    expect(chunks.engine).toBeInstanceOf(ProgramStory);
    expect(chunks.finished).toBe(true);
    const off = compile(texts, false);
    const current = play(off.program, off.story, false, startFrom);
    expect(current.engine).toBeInstanceOf(Story);
    expect(chunks.flushed.length).toBeGreaterThan(90);
    expect(chunks.flushed).toEqual(current.flushed);
  });

  it("joins lines through a trailing `..` as the current engine does", () => {
    const texts = {
      [MAIN]: [
        "scene MAIN",
        "  You see a ..",
        "  .. red door.",
        "  HERO: Wait ..",
        "  HERO: .. right there. > And more.",
        "  First .. >",
        "  .. second.",
        "  The end.",
        "end",
        "",
      ].join("\n"),
    };
    const startFrom = { file: MAIN, line: 1 };
    const on = compile(texts, true);
    expect(on.program.fallback).toBeUndefined();
    const chunks = play(on.program, on.story, true, startFrom);
    expect(chunks.engine).toBeInstanceOf(ProgramStory);
    const off = compile(texts, false);
    const current = play(off.program, off.story, false, startFrom);
    expect(chunks.finished).toBe(true);
    expect(chunks.flushed).toEqual(current.flushed);
    expect(chunks.flushed.length).toBeGreaterThan(3);
  });

  // The worker hands its game each preview compile's program and story with
  // `updateProgram`, as it hands it a real compile's.
  it("runs a preview compile's program as the current engine does", () => {
    const text = [
      "scene MAIN",
      "  One.",
      "  BOB: Two.",
      "  Three.",
      "end",
      "",
    ].join("\n");
    const run = (programChunks: boolean) => {
      const compiler = new SparkdownCompiler();
      let story: Story | undefined;
      compiler.addEventListener("compiler/didCompile", (params) => {
        story = params.story as Story | undefined;
      });
      let previewStory: Story | undefined;
      compiler.addEventListener("compiler/didPreviewCompile", (params) => {
        previewStory = params.story as Story | undefined;
      });
      compiler.configure({
        files: scriptFiles({ [MAIN]: text }) as never,
        seedBuiltinsIntoStory: true,
        emitCompiledProgram: false,
        programChunks,
      });
      const program = compiler.compile({ textDocument: { uri: MAIN } }).program;
      const played = play(program, story!, programChunks, { file: MAIN, line: 1 });
      const offset = text.indexOf("Two.") + "Two".length;
      const preview = compiler.previewCompile({
        textDocument: { uri: MAIN, version: 1 },
        contentChanges: [
          {
            range: {
              start: { line: 2, character: offset - text.indexOf("  BOB") },
              end: { line: 2, character: offset - text.indexOf("  BOB") },
            },
            text: ", and a half",
          },
        ],
        root: { uri: MAIN },
        startFrom: { file: MAIN, line: 1 },
      });
      const game = played.game;
      const flushed: any[] = [];
      const interpreter = game.module.interpreter;
      const flush = interpreter.flush.bind(interpreter);
      interpreter.flush = () => {
        const instructions = flush();
        if (instructions) {
          flushed.push(JSON.parse(JSON.stringify(instructions)));
        }
        return instructions;
      };
      game.updateProgram(preview.program!, previewStory!);
      game.start();
      for (let turns = 0; turns < 20; turns += 1) {
        game.clickedToContinue();
      }
      return { flushed, engine: game.story };
    };
    const chunks = run(true);
    expect(chunks.engine).toBeInstanceOf(ProgramStory);
    const current = run(false);
    expect(chunks.flushed).toEqual(current.flushed);
    // The game shows a line one character at a time.
    const dialogue = chunks.flushed.map((beat) =>
      (beat.text?.dialogue ?? []).map((show: { text: string }) => show.text).join(""),
    );
    expect(dialogue).toContain("Two, and a half.");
  });

  // Choices are not emitted yet, so the program falls back and the game runs
  // it on the current engine as a whole.
  it("shows a `choose` block's caption as the current engine does", () => {
    const texts = {
      [MAIN]: [
        "scene MAIN",
        "  Before the choice.",
        "  choose",
        "    What now?",
        "    + [Go]",
        "      Gone.",
        "    + [Stay]",
        "      Stayed.",
        "  end",
        "  After.",
        "end",
        "",
      ].join("\n"),
    };
    const startFrom = { file: MAIN, line: 1 };
    const on = compile(texts, true);
    expect(on.program.fallback).toEqual({ construct: "choose", uri: MAIN, line: 2 });
    const chunks = play(on.program, on.story, true, startFrom);
    expect(chunks.engine).toBeInstanceOf(Story);
    const off = compile(texts, false);
    const current = play(off.program, off.story, false, startFrom);
    expect(chunks.finished).toBe(true);
    expect(chunks.flushed).toEqual(current.flushed);
    expect(chunks.flushed.some((f) => f.choices?.length)).toBe(true);
  });
});
