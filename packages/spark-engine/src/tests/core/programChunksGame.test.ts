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
import { storyBeats } from "@impower/sparkdown/src/tests/program/programHarness";
import { Game } from "../../game/core/classes/Game";
import { GameEncounteredRuntimeErrorMessage } from "../../game/core/classes/messages/GameEncounteredRuntimeError";

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

/** A game given a compile's program and story with the worker's checkpoint
 *  settings. */
function createGame(
  program: SparkProgram,
  story: Story,
  programChunks: boolean,
  startFrom: { file: string; line: number },
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
    incrementalCheckpoints: true,
    verifyCheckpoints: false,
    programChunks,
    startFrom,
  } as never);
}

/** Runs a game from `startFrom` until it reports that it finished, taking the
 *  first choice wherever one is offered, and returns every beat it flushed and
 *  every runtime error and warning it reported, with its type. `each` runs
 *  after every turn. */
function play(
  program: SparkProgram,
  story: Story,
  programChunks: boolean,
  startFrom: { file: string; line: number },
  each?: (game: Game) => void,
) {
  const game = createGame(program, story, programChunks, startFrom);
  let finished = false;
  const errors: string[] = [];
  game.connection.connectOutput((message) => {
    const { method, params } = message as {
      method?: string;
      params?: { message?: string; type?: string };
    };
    if (method === "game/finished") {
      finished = true;
    }
    if (method === GameEncounteredRuntimeErrorMessage.method) {
      errors.push(`${params?.type}: ${params?.message}`);
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
  each?.(game);
  for (let turns = 0; !finished && turns < 5000; turns += 1) {
    if (flushed.at(-1)?.choices?.length) {
      game.chosePathToContinue(0);
    } else {
      game.clickedToContinue();
    }
    each?.(game);
  }
  return { flushed, errors, finished, engine: game.story, game };
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

  // The game runs the block on the program engine (#697), taking the first
  // choice, and presents the caption with the choices as the current engine
  // does.
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
    expect(on.program.fallback).toBeUndefined();
    const chunks = play(on.program, on.story, true, startFrom);
    expect(chunks.engine).toBeInstanceOf(ProgramStory);
    const off = compile(texts, false);
    const current = play(off.program, off.story, false, startFrom);
    expect(chunks.finished).toBe(true);
    expect(chunks.flushed).toEqual(current.flushed);
    expect(chunks.flushed.some((f) => f.choices?.length)).toBe(true);
  });

  // A block with no caption: the continue after the beat before the block
  // returns only the choices (binary-program.md sections 4 and 7), and the
  // game still presents the menu instead of finishing (#1624).
  it("shows a `choose` block with no caption as the current engine does", () => {
    const texts = {
      [MAIN]: [
        "scene MAIN",
        "  Start.",
        "  Second.",
        "  choose",
        "    * Plain",
        "    * Outer",
        "  end",
        "  After.",
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
    expect(chunks.flushed.some((f) => f.choices?.length === 2)).toBe(true);
  });
});

// A line can hold several beats (a `>` break) and several statements (tags
// written after inline text). PLAY from a line starts at its first beat and a
// preview of it at its last (`Game.setStartFrom`), and the program engine
// starts where the current engine does.
describe("a game started at a line", () => {
  const LINES: [name: string, text: string, line: number][] = [
    ["a line that a break splits", "Intro.\nFirst > Second.\nAfter.\n", 1],
    [
      "a continuation followed by tags",
      "Intro.\nYou see a ..\n.. door# t\nAfter.\n",
      2,
    ],
    [
      "a continuation followed by tags in a scene",
      "scene MAIN\n  You see a ..\n  .. door# t\n  HERO: Wait# mood\n  After.\nend\n",
      2,
    ],
  ];

  for (const [name, text, line] of LINES) {
    it(`plays ${name} from its first beat as the current engine does`, () => {
      const startFrom = { file: MAIN, line };
      const on = compile({ [MAIN]: text }, true);
      expect(on.program.fallback).toBeUndefined();
      const chunks = play(on.program, on.story, true, startFrom);
      expect(chunks.engine).toBeInstanceOf(ProgramStory);
      const off = compile({ [MAIN]: text }, false);
      const current = play(off.program, off.story, false, startFrom);
      expect(chunks.flushed.length).toBeGreaterThan(0);
      expect(chunks.flushed).toEqual(current.flushed);
      expect(chunks.errors).toEqual(current.errors);
    });

    for (const beat of ["first", "last"] as const) {
      it(`starts at the ${beat} beat of ${name} as the current engine does`, () => {
        const shown = (programChunks: boolean) => {
          const { program, story } = compile({ [MAIN]: text }, programChunks);
          const game = createGame(program, story, programChunks, {
            file: MAIN,
            line,
          });
          // The beat's address on the engine the game runs: a number on the
          // program engine, a runtime path on the current one.
          const address = game.locator.addressAt(MAIN, line, { beat });
          expect(address).toBeDefined();
          const engine = game.story as unknown;
          if (engine instanceof ProgramStory) {
            expect(typeof address).toBe("number");
            engine.ChooseAddress(address as number);
          } else {
            game.story.ChoosePathString(String(address));
          }
          return storyBeats(game.story);
        };
        const chunks = shown(true);
        expect(chunks).toEqual(shown(false));
        expect(chunks.beats.length).toBeGreaterThan(0);
      });
    }
  }
});

describe("a game's save", () => {
  // After its last beat a flow rests past its last statement, which a save
  // names by the flow's sequence.
  it("loads at every beat, the last included", () => {
    const texts = { [MAIN]: "scene MAIN\n  One.\n  Two. > Three.\n  Four.\nend\n" };
    const startFrom = { file: MAIN, line: 1 };
    const saveAndLoad = (programChunks: boolean) => {
      const loads: boolean[] = [];
      const { program, story } = compile(texts, programChunks);
      const run = play(program, story, programChunks, startFrom, (game) => {
        loads.push(game.load(game.save()));
      });
      return { run, loads };
    };
    const chunks = saveAndLoad(true);
    expect(chunks.run.engine).toBeInstanceOf(ProgramStory);
    expect(chunks.run.finished).toBe(true);
    expect(chunks.loads.length).toBeGreaterThan(4);
    expect(chunks.loads.every((loaded) => loaded)).toBe(true);
    const current = saveAndLoad(false);
    expect(chunks.run.flushed).toEqual(current.run.flushed);
    expect(chunks.loads).toEqual(current.loads);
  });
});
