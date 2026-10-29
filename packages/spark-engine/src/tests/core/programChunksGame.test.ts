import { describe, expect, it } from "vitest";
import { buildBeatsFixture } from "../../../../../scripts/bench/preview-fixture.mjs";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { unsupportedConstructMessage } from "@impower/sparkdown/src/compiler/utils/unsupportedConstructMessage";
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

function compile(texts: Record<string, string>) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: scriptFiles(texts) as never,
    seedBuiltinsIntoStory: true,
  });
  const program = compiler.compile({ textDocument: { uri: MAIN } }).program;
  return { program };
}

function createGame(
  program: SparkProgram,
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
    startFrom,
  } as never);
}

function play(
  program: SparkProgram,
  startFrom: { file: string; line: number },
  each?: (game: Game) => void,
) {
  return playGame(createGame(program, startFrom), each);
}

function playGame(game: Game, each?: (game: Game) => void) {
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

const shown = (flushed: any[]) =>
  flushed.map((beat) =>
    Object.fromEntries(
      Object.entries(beat.text ?? {}).map(([target, shows]) => [
        target,
        (shows as { text: string }[]).map((show) => show.text).join(""),
      ]),
    ),
  );

const UNJOINED =
  "2: This line begins with `..`, but the line shown before it does not end with `..`, so it does not join it.";

describe("a game that runs statement chunks", () => {
  it("runs the beats fixture to its end", () => {
    const { files } = buildBeatsFixture({ lines: 300 });
    const texts = {
      [MAIN]: files.get("main.sd")!,
      "file:///local/scripts/characters.sd": files.get("scripts/characters.sd")!,
    };
    const startFrom = { file: MAIN, line: 3 };
    const { program } = compile(texts);
    expect(program.chunks).toBeDefined();
    const chunks = play(program, startFrom);
    expect(chunks.engine).toBeInstanceOf(ProgramStory);
    expect(chunks.finished).toBe(true);
    expect(chunks.flushed.length).toBeGreaterThan(90);
  });

  it("joins lines through a trailing `..`", () => {
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
    const { program } = compile(texts);
    expect(program.chunks).toBeDefined();
    const chunks = play(program, startFrom);
    expect(chunks.engine).toBeInstanceOf(ProgramStory);
    expect(chunks.finished).toBe(true);
    expect(chunks.flushed.length).toBeGreaterThan(3);
    expect(shown(chunks.flushed)).toEqual([
      { action: "You see a red door." },
      { character_name: "HERO", dialogue: "Wait right there." },
      { character_name: "HERO", dialogue: "And more." },
      { action: "First" },
      { action: "First second." },
      { action: "The end." },
    ]);
  });

  it("runs a preview compile's program", () => {
    const text = [
      "scene MAIN",
      "  One.",
      "  BOB: Two.",
      "  Three.",
      "end",
      "",
    ].join("\n");
    const compiler = new SparkdownCompiler();
    compiler.configure({
      files: scriptFiles({ [MAIN]: text }) as never,
      seedBuiltinsIntoStory: true,
    });
    const program = compiler.compile({ textDocument: { uri: MAIN } }).program;
    const played = play(program, { file: MAIN, line: 1 });
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
    game.updateProgram(preview.program!);
    game.start();
    for (let turns = 0; turns < 20; turns += 1) {
      game.clickedToContinue();
    }
    expect(game.story).toBeInstanceOf(ProgramStory);
    const dialogue = flushed.map((beat) =>
      (beat.text?.dialogue ?? []).map((show: { text: string }) => show.text).join(""),
    );
    expect(dialogue).toContain("Two, and a half.");
  });

  it("shows a `choose` block's caption", () => {
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
    const { program } = compile(texts);
    expect(program.chunks).toBeDefined();
    const chunks = play(program, startFrom);
    expect(chunks.engine).toBeInstanceOf(ProgramStory);
    expect(chunks.finished).toBe(true);
    expect(chunks.flushed.some((f) => f.choices?.length)).toBe(true);
    expect(shown(chunks.flushed)).toEqual([
      { action: "Before the choice." },
      { action: "What now?", "choice 0": "Go", "choice 1": "Stay" },
      { action: "Gone." },
      { action: "After." },
    ]);
  });

  it("shows a `choose` block with no caption", () => {
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
    const { program } = compile(texts);
    expect(program.chunks).toBeDefined();
    const chunks = play(program, startFrom);
    expect(chunks.engine).toBeInstanceOf(ProgramStory);
    expect(chunks.finished).toBe(true);
    expect(chunks.flushed.some((f) => f.choices?.length === 2)).toBe(true);
    expect(shown(chunks.flushed)).toEqual([
      { action: "Start." },
      { action: "Second." },
      { "choice 0": "Plain", "choice 1": "Outer" },
      { action: "Plain" },
      { action: "After." },
    ]);
  });
});

describe("a game started at a line", () => {
  const LINES: [
    name: string,
    text: string,
    line: number,
    played: { flushed: Record<string, string>[]; errors: string[] },
    beats: { first: string[]; last: string[] },
  ][] = [
    [
      "a line that a break splits",
      "Intro.\nFirst > Second.\nAfter.\n",
      1,
      {
        flushed: [{ action: "First" }, { action: "Second." }, { action: "After." }],
        errors: [],
      },
      { first: ["First\n", "Second.\n", "After.\n"], last: ["Second.\n", "After.\n"] },
    ],
    [
      "a continuation followed by tags",
      "Intro.\nYou see a ..\n.. door# t\nAfter.\n",
      2,
      { flushed: [{ action: "door" }, { action: "After." }], errors: [UNJOINED] },
      { first: ["door\n", "After.\n"], last: ["door\n", "After.\n"] },
    ],
    [
      "a continuation followed by tags in a scene",
      "scene MAIN\n  You see a ..\n  .. door# t\n  HERO: Wait# mood\n  After.\nend\n",
      2,
      {
        flushed: [
          { action: "door" },
          { character_name: "HERO", dialogue: "Wait" },
          { action: "After." },
        ],
        errors: [UNJOINED],
      },
      { first: ["door\n", "Wait\n", "After.\n"], last: ["door\n", "Wait\n", "After.\n"] },
    ],
  ];

  for (const [name, text, line, played, beats] of LINES) {
    it(`plays ${name} from its first beat`, () => {
      const startFrom = { file: MAIN, line };
      const { program } = compile({ [MAIN]: text });
      expect(program.chunks).toBeDefined();
      const chunks = play(program, startFrom);
      expect(chunks.engine).toBeInstanceOf(ProgramStory);
      expect(chunks.flushed.length).toBeGreaterThan(0);
      expect({ flushed: shown(chunks.flushed), errors: chunks.errors }).toEqual(played);
    });

    for (const beat of ["first", "last"] as const) {
      it(`starts at the ${beat} beat of ${name}`, () => {
        const { program } = compile({ [MAIN]: text });
        const game = createGame(program, { file: MAIN, line });
        const address = game.locator.addressAt(MAIN, line, { beat });
        expect(typeof address).toBe("number");
        const engine = game.story as unknown as ProgramStory;
        expect(engine).toBeInstanceOf(ProgramStory);
        engine.ChooseAddress(address as number);
        const story = storyBeats(game.story);
        expect(story.beats.map((b) => b.text)).toEqual(beats[beat]);
      });
    }
  }
});

describe("a compile that holds a construct the program cannot compile", () => {
  it("reports it at its statement's line and makes no chunks", () => {
    const text = "scene MAIN\n  One.\n  Two.\nend\nexternal message(x)\n";
    const { program } = compile({ [MAIN]: text });
    const errors = Object.values(program.diagnostics ?? {})
      .flat()
      .filter((d) => d.severity === 1)
      .map((d) => [
        d.range.start.line,
        typeof d.message === "string" ? d.message : d.message.value,
      ]);
    expect(errors).toEqual([[4, unsupportedConstructMessage("external")]]);
    expect(program.chunks).toBeUndefined();
    const game = createGame(compile({ [MAIN]: "scene MAIN\n  One.\n  Two.\nend\n" }).program, {
      file: MAIN,
      line: 1,
    });
    expect(() => game.updateProgram(program)).toThrow(
      "Program must be successfully compiled before it can be run",
    );
  });
});

describe("a game's save", () => {
  it("loads at every beat, the last included", () => {
    const texts = { [MAIN]: "scene MAIN\n  One.\n  Two. > Three.\n  Four.\nend\n" };
    const startFrom = { file: MAIN, line: 1 };
    const loads: boolean[] = [];
    const { program } = compile(texts);
    const run = play(program, startFrom, (game) => {
      loads.push(game.load(game.save()));
    });
    expect(run.engine).toBeInstanceOf(ProgramStory);
    expect(run.finished).toBe(true);
    expect(loads.length).toBeGreaterThan(4);
    expect(loads.every((loaded) => loaded)).toBe(true);
  });
});

describe("an error that stops a route search on the program engine", () => {
  it("is placed at the statement that raised it, in the script that holds it", () => {
    const CHAPTER = "file:///local/chapter.sd";
    const chapter = [
      "scene C",
      "  Before.",
      "  & error(\"boom\", 0)",
      "  Target.",
      "end",
      "",
    ].join("\n");
    const texts = {
      [MAIN]: ["-> C", ""].join("\n"),
      [CHAPTER]: chapter,
    };
    const lines = chapter.split("\n");
    const { program } = compile(texts);
    expect(program.chunks).toBeDefined();
    const game = createGame(program, {
      file: CHAPTER,
      line: lines.indexOf("  Target."),
    });
    game.setStartFrom({ file: CHAPTER, line: lines.indexOf("  Target.") });
    game.simulate();
    expect(game.simulationFailure).toBeDefined();
    const errors = game.routeErrors;
    expect(errors.map((e) => e.message.includes("boom"))).toContain(true);
    const location = errors.find((e) => e.message.includes("boom"))!.location;
    expect({ uri: location?.uri, line: location?.range.start.line }).toEqual({
      uri: CHAPTER,
      line: lines.indexOf("  & error(\"boom\", 0)"),
    });
  });
});
