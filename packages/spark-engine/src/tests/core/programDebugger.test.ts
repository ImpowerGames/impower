// The debugger served from the program engine (#702,
// docs/engine/binary-program.md, sections 8 and 9): a breakpoint is a set of
// addresses `addressAt(uri, line)` gives, checked by integer comparison; a
// stack frame is named from its symbol and stands where the current engine's
// stands; each frame's temporaries are the ones the current engine shows; and
// the lines a breakpoint can sit on come from the chunks' line tables.
//
// Where the two engines differ it is in what the current engine's path table
// can place: it puts a statement of logic in a scene (an assignment, a
// tunnel, a call) on the scene's header line, since its runtime objects carry
// no line of their own, where a chunk's line table puts it on its own line.
// The cases below say so where it shows.
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

interface Recorded {
  method: string;
  params: any;
}

/** A game of `texts` on the engine `programChunks` selects, with every
 *  notification it emits recorded. */
function debugGame(
  texts: string | Record<string, string>,
  programChunks: boolean,
) {
  const { program, story } = compile(
    typeof texts === "string" ? { [MAIN]: texts } : texts,
    programChunks,
  );
  if (programChunks) {
    expect(program.fallback).toBeUndefined();
  }
  const game = new Game({
    now: () => 0,
    // No timer fires, so nothing advances the game while a case inspects it.
    setTimeout: (() => 0) as never,
    resolve: (path: string) => path,
    fetch: async () => "",
    log: () => {},
    program: program as SparkProgram,
    story,
    programChunks,
  } as never);
  expect(game.story instanceof ProgramStory).toBe(programChunks);
  const emitted: Recorded[] = [];
  game.connection.outgoing.addListener("*", (message) => {
    emitted.push(message as unknown as Recorded);
  });
  const of = (method: string) => emitted.filter((m) => m.method === method);
  /** The line the last stop, at a breakpoint or after a step, reported. */
  const stoppedAt = () =>
    emitted
      .filter(
        (m) => m.method === "game/hitBreakpoint" || m.method === "game/stepped",
      )
      .at(-1)?.params?.location?.range?.start?.line as number | undefined;
  /** Continues until the game reports a breakpoint, at most `times` times. */
  const continueToBreakpoint = (times = 8) => {
    const hits = of("game/hitBreakpoint").length;
    for (let i = 0; i < times; i += 1) {
      if (of("game/hitBreakpoint").length > hits) {
        return;
      }
      game.continue();
    }
  };
  const frames = () => game.getStackTrace(game.getThreads()[0]!.id);
  return { game, program, emitted, of, stoppedAt, continueToBreakpoint, frames };
}

const NESTED = [
  "store health = 100", //       0
  "store result = 0", //         1
  "-> main", //                  2
  "scene main", //               3
  "  local mainLoc = 111", //    4
  "  Main here.", //             5
  "  health = health - 25", //   6
  "  -> sub ->", //              7
  "  result = add(2, 3)", //     8
  "  Back in main {result}.", // 9
  "  done", //                   10
  "end", //                      11
  "scene sub", //                12
  "  local subLoc = 222", //     13
  "  Sub here.", //              14
  "  More sub.", //              15
  "  ->->", //                   16
  "end", //                      17
  "function add(a, b)", //       18
  "  local sum = a + b", //      19
  "  return sum", //             20
  "end", //                      21
  "",
].join("\n");

const ENGINES = [
  ["the current engine", false],
  ["the program engine", true],
] as const;

const names = (vars: { name: string; value: string }[]) =>
  vars.map((v) => `${v.name}=${v.value}`);

describe.each(ENGINES)("the debugger on %s", (_name, programChunks) => {
  it("stops at a line breakpoint on its beat, and not again when continued", () => {
    const h = debugGame(NESTED, programChunks);
    const set = h.game.setBreakpoints([{ file: MAIN, line: 14 }]);
    expect(set.map((b) => b.verified)).toEqual([true]);
    expect(set[0]!.location?.range.start.line).toBe(14);
    h.game.start();
    expect(h.of("game/hitBreakpoint")).toHaveLength(0);
    h.game.continue();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    expect(h.stoppedAt()).toBe(14);
    // The beat has not displayed: continuing finishes it and waits there.
    h.game.continue();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    expect(h.of("game/awaitingInteraction").at(-1)?.params.location.range.start.line).toBe(14);
    expect(h.game.story.currentText).toBe("Sub here.\n");
  });

  it("stops at each breakpoint in turn, with the globals as they stand", () => {
    const h = debugGame(NESTED, programChunks);
    h.game.setBreakpoints([
      { file: MAIN, line: 5 },
      { file: MAIN, line: 14 },
    ]);
    h.game.start();
    expect(h.stoppedAt()).toBe(5);
    const health = () =>
      h.game.getVarVariables().find((v) => v.name === "health")?.value;
    expect(health()).toBe("100");
    h.continueToBreakpoint();
    expect(h.of("game/hitBreakpoint")).toHaveLength(2);
    expect(h.stoppedAt()).toBe(14);
    expect(health()).toBe("75");
  });

  it("names the frames of a nested tunnel and gives the line each stands on", () => {
    const h = debugGame(NESTED, programChunks);
    h.game.setBreakpoints([{ file: MAIN, line: 15 }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(15);
    const trace = h.frames();
    expect(trace.totalFrames).toBe(2);
    expect(trace.stackFrames.map((f) => f.id)).toEqual([1, 0]);
    expect(trace.stackFrames.map((f) => f.moduleId)).toEqual([
      "tunnel",
      "tunnel",
    ]);
    const lines = trace.stackFrames.map((f) => f.location?.range.start.line);
    if (programChunks) {
      expect(trace.stackFrames.map((f) => f.name)).toEqual(["sub", "main"]);
      // The caller stands on the tunnel that pushed the frame above it.
      expect(lines).toEqual([15, 7]);
      expect(h.game.getThreads()).toEqual([{ id: 0, name: "sub" }]);
    } else {
      // The current engine names a frame by its runtime path, and places
      // the tunnel on its scene's header.
      expect(trace.stackFrames.map((f) => f.name.split(".")[0])).toEqual([
        "sub",
        "main",
      ]);
      expect(lines).toEqual([15, 3]);
    }
  });

  /** Stops in `add` on its first line (where a function breakpoint stops),
   *  then steps over each line to `line`. */
  const stopInAdd = (h: ReturnType<typeof debugGame>, line: number) => {
    h.game.setFunctionBreakpoints([{ name: "add" }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(18);
    while (h.stoppedAt()! < line) {
      h.game.step("over");
    }
    expect(h.stoppedAt()).toBe(line);
  };

  it("names a function's frame and gives the line of the call below it", () => {
    const h = debugGame(NESTED, programChunks);
    stopInAdd(h, 20);
    const trace = h.frames();
    expect(trace.stackFrames.map((f) => f.moduleId)).toEqual([
      "function",
      "tunnel",
    ]);
    const lines = trace.stackFrames.map((f) => f.location?.range.start.line);
    if (programChunks) {
      expect(trace.stackFrames.map((f) => f.name)).toEqual(["add", "main"]);
      expect(lines).toEqual([20, 8]);
    } else {
      expect(lines).toEqual([20, 3]);
    }
  });

  it("places the frame of a game that loaded a save on the beat the save was taken at", () => {
    const saved = debugGame(NESTED, programChunks);
    saved.game.start();
    saved.game.continue();
    expect(saved.game.story.currentText).toBe("Sub here.\n");
    const save = saved.game.save();
    const h = debugGame(NESTED, programChunks);
    expect(h.game.load(save)).toBe(true);
    const trace = h.frames();
    expect(trace.totalFrames).toBe(2);
    if (programChunks) {
      // A save keeps no last instruction, so the frame stands where the
      // runtime record the save carried last ran.
      expect(trace.stackFrames.map((f) => f.location?.range.start.line)).toEqual([14, 7]);
    } else {
      // The current engine's elements keep no pointer across a load, and
      // its stack trace leaves such a frame out.
      expect(trace.stackFrames).toEqual([]);
    }
  });

  it("shows the temporaries of the frame that runs, and of the frame below it", () => {
    const h = debugGame(NESTED, programChunks);
    h.game.setBreakpoints([{ file: MAIN, line: 15 }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(15);
    expect(names(h.game.getTempVariables())).toEqual(["subLoc=222"]);
    const byFrame = h.frames().stackFrames.map((f) =>
      names(h.game.getTempVariables(0, f.id)),
    );
    expect(byFrame).toEqual([["subLoc=222"], ["mainLoc=111"]]);
  });

  it("shows a function's parameters and locals, each named by its scope", () => {
    const h = debugGame(NESTED, programChunks);
    stopInAdd(h, 20);
    const temps = h.game.getTempVariables();
    expect(names(temps).sort()).toEqual(["a=2", "b=3", "sum=5"]);
    expect(new Set(temps.map((v) => v.scopePath))).toEqual(new Set(["add"]));
    expect(h.game.getEvaluationContext()).toMatchObject({
      a: 2,
      b: 3,
      sum: 5,
      health: 75,
    });
  });

  it("steps over a line of a function in its frame, and out of it to its caller", () => {
    const h = debugGame(NESTED, programChunks);
    stopInAdd(h, 19);
    expect(h.frames().totalFrames).toBe(2);
    // Over: the next line of `add`, in the same frame.
    h.game.step("over");
    expect(h.stoppedAt()).toBe(20);
    expect(h.frames().totalFrames).toBe(2);
    // Out: back in `main`, which called it.
    h.game.step("out");
    expect(h.frames().totalFrames).toBe(1);
    expect(h.stoppedAt()).toBe(programChunks ? 8 : 3);
  });

  it("fires a function breakpoint where the function binds its parameters", () => {
    const h = debugGame(NESTED, programChunks);
    const set = h.game.setFunctionBreakpoints([{ name: "add" }, { name: "nope" }]);
    expect(set.map((b) => b.verified)).toEqual([true, false]);
    expect(set[0]!.location?.range.start.line).toBe(18);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    expect(h.stoppedAt()).toBe(18);
    expect(h.frames().stackFrames[0]?.moduleId).toBe("function");
  });

  it("fires a data breakpoint where the global is assigned", () => {
    const h = debugGame(NESTED, programChunks);
    const set = h.game.setDataBreakpoints([{ dataId: "health" }, { dataId: "nope" }]);
    expect(set.map((b) => b.verified)).toEqual([true, false]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    const health = h.game.getVarVariables().find((v) => v.name === "health");
    if (programChunks) {
      // It stops once the assignment has run, on the assignment's line.
      expect(set[0]!.location?.range.start.line).toBe(6);
      expect(h.stoppedAt()).toBe(6);
      expect(health?.value).toBe("75");
    } else {
      expect(set[0]!.location?.range.start.line).toBe(3);
    }
  });
});

describe("the debugger on the program engine", () => {
  it("steps in to a function from the line that calls it", () => {
    const h = debugGame(NESTED, true);
    h.game.setBreakpoints([{ file: MAIN, line: 8 }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(8);
    expect(h.frames().totalFrames).toBe(1);
    h.game.step("in");
    expect(h.stoppedAt()).toBe(18);
    expect(h.frames().stackFrames.map((f) => f.name)).toEqual(["add", "main"]);
    h.game.step("in");
    expect(h.stoppedAt()).toBe(19);
    h.game.step("out");
    expect(h.stoppedAt()).toBe(8);
    h.game.step("over");
    expect(h.stoppedAt()).toBe(9);
  });

  it("fires a data breakpoint on a temporary, named by its frame", () => {
    const h = debugGame(NESTED, true);
    h.game.setBreakpoints([{ file: MAIN, line: 20 }]);
    h.game.start();
    h.continueToBreakpoint();
    const sum = h.game.getTempVariables().find((v) => v.name === "sum")!;
    // The debugger names it as the variables view scopes it.
    const dataId = `${sum.scopePath}.${sum.name}`;
    expect(dataId).toBe("add.sum");
    // `sum` is declared and never assigned again: no instruction writes it.
    expect(h.game.setDataBreakpoints([{ dataId }])[0]!.verified).toBe(false);
    const mainHealth = h.game.setDataBreakpoints([{ dataId: "main.health" }]);
    expect(mainHealth[0]!.verified).toBe(true);
    expect(mainHealth[0]!.location?.range.start.line).toBe(6);
    expect(h.game.setDataBreakpoints([{ dataId: "sub.health" }])[0]!.verified).toBe(false);
  });

  it("stops at a breakpoint inside a loop on every pass", () => {
    const h = debugGame(
      [
        "store total = 0",
        "for i = 1, 3 do",
        "  total = total + i",
        "end",
        "Total {total}.",
        "",
      ].join("\n"),
      true,
    );
    h.game.setBreakpoints([{ file: MAIN, line: 2 }]);
    h.game.start();
    const seen: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      if (h.of("game/hitBreakpoint").length > seen.length) {
        seen.push(names(h.game.getTempVariables()).join(","));
      }
      h.game.continue();
    }
    expect(seen).toEqual(["i=1", "i=2", "i=3"]);
    expect(h.game.story.currentText).toBe("Total 6.\n");
  });

  it("resolves a breakpoint again when a compile emits its statement again", () => {
    const before = NESTED;
    const after = NESTED.replace("  Sub here.", "  Sub here, edited.");
    const h = debugGame(before, true);
    h.game.setBreakpoints([{ file: MAIN, line: 14 }]);
    h.game.updateProgram(compile({ [MAIN]: after }, true).program);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    expect(h.stoppedAt()).toBe(14);
    h.game.continue();
    expect(h.game.story.currentText).toBe("Sub here, edited.\n");
  });

  it("offers the lines a breakpoint can sit on from the line tables", () => {
    const search = { uri: MAIN, range: { start: { line: 0 }, end: { line: 100 } } };
    const unique = (lines: number[]) => [...new Set(lines)].sort((a, b) => a - b);
    const current = unique(debugGame(NESTED, false).game.possibleBreakpointLines(search));
    const program = debugGame(NESTED, true).game.possibleBreakpointLines(search);
    // Each header, each beat and each line of the function is offered on
    // both engines.
    expect(current).toEqual([3, 5, 9, 12, 14, 15, 18, 19, 20]);
    expect(program.filter((line) => current.includes(line))).toEqual(current);
    // The program engine also offers each statement of logic on its own
    // line, the divert on line 2 among them, where the current engine's
    // table has no line for it; and no declaration, which runs before a
    // debugger can stop the story.
    const logic = program.filter((line) => !current.includes(line));
    expect(logic).toEqual([2, 4, 6, 7, 8, 10, 13, 16]);
    // A breakpoint on each of those lines and on each beat stays on it; one
    // on a scene's header moves to the scene's first statement.
    const h = debugGame(NESTED, true);
    const set = h.game.setBreakpoints(program.map((line) => ({ file: MAIN, line })));
    expect(set.map((b) => b.location?.range.start.line)).toEqual(
      program.map((line) => (line === 3 ? 4 : line === 12 ? 13 : line)),
    );
  });

  it("offers the lines the current engine offers for a script of beats", () => {
    const { files } = buildBeatsFixture({ lines: 40 });
    const texts = {
      [MAIN]: files.get("main.sd")!,
      "file:///local/scripts/characters.sd": files.get("scripts/characters.sd")!,
    };
    const search = { uri: MAIN, range: { start: { line: 0 }, end: { line: 10_000 } } };
    const unique = (lines: number[]) => [...new Set(lines)].sort((a, b) => a - b);
    const current = unique(debugGame(texts, false).game.possibleBreakpointLines(search));
    const program = debugGame(texts, true).game.possibleBreakpointLines(search);
    expect(current.length).toBeGreaterThan(10);
    expect(program).toEqual(current);
  });

  it("calls no execution hook and builds no string per step while no breakpoint is set", () => {
    const h = debugGame(NESTED, true);
    const story = h.game.story as unknown as ProgramStory;
    // Count every call of whatever hook the game installs.
    let hookCalls = 0;
    let installed: ((address: number) => void) | null = story.onExecute;
    Object.defineProperty(story, "onExecute", {
      configurable: true,
      get: () =>
        installed === null
          ? null
          : (address: number) => {
              hookCalls += 1;
              installed!(address);
            },
      set: (value) => {
        installed = value;
      },
    });
    const stringify = JSON.stringify;
    let strings = 0;
    JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => {
      strings += 1;
      return stringify(...args);
    }) as typeof JSON.stringify;
    const stepsBefore = story.stepCount;
    const executed: number[] = [];
    try {
      h.game.start();
      for (let i = 0; i < 3; i += 1) {
        h.game.continue();
        executed.push(h.game.runtimeState.pathsExecutedThisFrame.size);
      }
    } finally {
      JSON.stringify = stringify;
    }
    const steps = story.stepCount - stepsBefore;
    expect(steps).toBeGreaterThan(40);
    expect(installed).toBeNull();
    expect(hookCalls).toBe(0);
    // What a beat's checkpoint serializes is per beat, not per step.
    expect(strings).toBeLessThan(steps / 4);
    // The game still records each step it takes.
    expect(executed.every((size) => size > 0)).toBe(true);
  });

  it("records the lines each continue ran as the current engine does", () => {
    const lines = (programChunks: boolean) => {
      const h = debugGame(NESTED, programChunks);
      const out: unknown[] = [];
      h.game.start();
      for (let i = 0; i < 4; i += 1) {
        out.push(h.of("game/executed").at(-1)?.params.executedLines);
        h.game.continue();
      }
      return out;
    };
    const program = lines(true) as Record<string, { ranges: number[] }>[];
    const current = lines(false) as Record<string, { ranges: number[] }>[];
    // Each continue's record holds the beat it stopped at on both engines.
    for (const [i, beat] of [5, 14, 15, 9].entries()) {
      for (const record of [program[i]!, current[i]!]) {
        const ranges = record[MAIN]!.ranges;
        const holds = ranges.some(
          (_, k) => k % 2 === 0 && ranges[k]! <= beat && beat <= ranges[k + 1]!,
        );
        expect(holds).toBe(true);
      }
    }
  });
});
