// The debugger served from the program engine (#702,
// docs/engine/binary-program.md, sections 8 and 9): a breakpoint is a set of
// addresses `addressAt(uri, line)` gives, checked by integer comparison; a
// stack frame is named from its symbol and stands on the line of the
// statement it runs or called from; each frame shows its own temporaries; and
// the lines a breakpoint can sit on come from the chunks' line tables, which
// put a statement of logic in a scene (an assignment, a tunnel, a call) on its
// own line.
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
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

/** The program of a compile configured as the player's worker configures
 *  its compiler. */
function compile(texts: Record<string, string>) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: scriptFiles(texts) as never,
    seedBuiltinsIntoStory: true,
  });
  const program = compiler.compile({ textDocument: { uri: MAIN } }).program;
  return { program };
}

interface Recorded {
  method: string;
  params: any;
}

/** A game of `texts` on the program engine, with every notification it
 *  emits recorded. */
function debugGame(texts: string | Record<string, string>) {
  const { program } = compile(
    typeof texts === "string" ? { [MAIN]: texts } : texts,
  );
  expect(program.chunks).toBeDefined();
  const game = new Game({
    now: () => 0,
    // No timer fires, so nothing advances the game while a case inspects it.
    setTimeout: (() => 0) as never,
    resolve: (path: string) => path,
    fetch: async () => "",
    log: () => {},
    program: program as SparkProgram,
  } as never);
  expect(game.story instanceof ProgramStory).toBe(true);
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

const names = (vars: { name: string; value: string }[]) =>
  vars.map((v) => `${v.name}=${v.value}`);

/** Counts each write watch the game installs on the story's variables
 *  (`VariablesState.writeWatch`, #1664), and each write the engine reports
 *  to it. */
function countWriteWatch(story: ProgramStory) {
  const variables = story.state.variablesState;
  const counts = { variables, installs: 0, calls: 0 };
  let watch: typeof variables.writeWatch = variables.writeWatch;
  Object.defineProperty(variables, "writeWatch", {
    configurable: true,
    get: () =>
      watch === null
        ? null
        : (...args: Parameters<NonNullable<typeof watch>>) => {
            counts.calls += 1;
            watch!(...args);
          },
    set: (value) => {
      if (value !== null) {
        counts.installs += 1;
      }
      watch = value;
    },
  });
  return counts;
}

describe("the debugger on the program engine", () => {
  it("stops at a line breakpoint on its beat, and not again when continued", () => {
    const h = debugGame(NESTED);
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
    const h = debugGame(NESTED);
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
    const h = debugGame(NESTED);
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
    expect(trace.stackFrames.map((f) => f.name)).toEqual(["sub", "main"]);
    // The caller stands on the tunnel that pushed the frame above it.
    expect(lines).toEqual([15, 7]);
    expect(h.game.getThreads()).toEqual([{ id: 0, name: "sub" }]);
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
    const h = debugGame(NESTED);
    stopInAdd(h, 20);
    const trace = h.frames();
    expect(trace.stackFrames.map((f) => f.moduleId)).toEqual([
      "function",
      "tunnel",
    ]);
    const lines = trace.stackFrames.map((f) => f.location?.range.start.line);
    expect(trace.stackFrames.map((f) => f.name)).toEqual(["add", "main"]);
    expect(lines).toEqual([20, 8]);
  });

  it("places the frame of a game that loaded a save on the beat the save was taken at", () => {
    const saved = debugGame(NESTED);
    saved.game.start();
    saved.game.continue();
    expect(saved.game.story.currentText).toBe("Sub here.\n");
    const save = saved.game.save();
    const h = debugGame(NESTED);
    expect(h.game.load(save)).toBe(true);
    const trace = h.frames();
    expect(trace.totalFrames).toBe(2);
    // A save keeps no last instruction, so the frame stands where the
    // runtime record the save carried last ran.
    expect(trace.stackFrames.map((f) => f.location?.range.start.line)).toEqual([14, 7]);
  });

  it("shows the temporaries of the frame that runs, and of the frame below it", () => {
    const h = debugGame(NESTED);
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
    const h = debugGame(NESTED);
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
    const h = debugGame(NESTED);
    stopInAdd(h, 19);
    expect(h.frames().totalFrames).toBe(2);
    // Over: the next line of `add`, in the same frame.
    h.game.step("over");
    expect(h.stoppedAt()).toBe(20);
    expect(h.frames().totalFrames).toBe(2);
    // Out: back in `main`, which called it.
    h.game.step("out");
    expect(h.frames().totalFrames).toBe(1);
    expect(h.stoppedAt()).toBe(8);
  });

  it("fires a function breakpoint where the function binds its parameters", () => {
    const h = debugGame(NESTED);
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
    const h = debugGame(NESTED);
    const set = h.game.setDataBreakpoints([{ dataId: "health" }, { dataId: "nope" }]);
    expect(set.map((b) => b.verified)).toEqual([true, false]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    const health = h.game.getVarVariables().find((v) => v.name === "health");
    // It is placed where the global is declared, and stops once an
    // assignment has written it, on the assignment's line.
    expect(set[0]!.location?.range.start.line).toBe(0);
    expect(h.stoppedAt()).toBe(6);
    expect(health?.value).toBe("75");
  });

  // A breakpoint stops the game part way through a line, which the game
  // keeps in progress to finish when continued. A save taken there is of the
  // beat the line started from, and leaves the line to finish as it would
  // have (#1693).
  it("saves while a breakpoint holds a line in progress, and finishes the line after", () => {
    const h = debugGame(NESTED);
    h.game.setBreakpoints([{ file: MAIN, line: 14 }]);
    h.game.start();
    expect(h.game.story.currentText).toBe("Main here.\n");
    h.game.continue();
    expect(h.stoppedAt()).toBe(14);
    expect(h.game.story.asyncContinueComplete).toBe(false);

    const save = h.game.save();
    const errors = h.emitted.filter((m) => /error/i.test(m.method));
    expect(errors.map((m) => m.params?.message)).toEqual([]);
    expect(JSON.parse(save).story).toBeTruthy();

    // The line still finishes, as it does when nothing saved.
    expect(h.game.story.asyncContinueComplete).toBe(false);
    h.game.continue();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    expect(h.game.story.currentText).toBe("Sub here.\n");
    const health = (g: Game) =>
      g.getVarVariables().find((v) => v.name === "health")?.value;
    expect(health(h.game)).toBe("75");

    // The save is the beat before the line, which continues to that line.
    const loaded = debugGame(NESTED);
    expect(loaded.game.load(save)).toBe(true);
    expect(health(loaded.game)).toBe("100");
    loaded.game.continue();
    expect(loaded.game.story.currentText).toBe("Sub here.\n");
    expect(health(loaded.game)).toBe("75");
  });

  it("steps in to a function from the line that calls it", () => {
    const h = debugGame(NESTED);
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

  // A temporary named like a global shadows it, for reading and for writing.
  const SHADOWED = [
    "store health = 100", //      0
    "-> main", //                 1
    "scene main", //              2
    "  local health = 10", //     3
    "  local count = 0", //       4
    "  First.", //                5
    "  health = health - 1", //   6
    "  count = count + 1", //     7
    "  Second {health}.", //      8
    "  done", //                  9
    "end", //                     10
    "",
  ].join("\n");

  it("fires a data breakpoint on a temporary, named as the variables view scopes it", () => {
    const h = debugGame(SHADOWED);
    h.game.start();
    const count = h.game.getTempVariables().find((v) => v.name === "count")!;
    const dataId = `${count.scopePath}.${count.name}`;
    expect(dataId).toBe("main.count");
    const set = h.game.setDataBreakpoints([{ dataId }, { dataId: "sub.count" }]);
    expect(set.map((b) => b.verified)).toEqual([true, false]);
    expect(set[0]!.location?.range.start.line).toBe(7);
    h.continueToBreakpoint();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    // It stops once the write has run, on the line that wrote it.
    expect(h.stoppedAt()).toBe(7);
    expect(names(h.game.getTempVariables())).toContain("count=1");
  });

  it("fires a global's data breakpoint only when the global is written, not a temporary that shadows it", () => {
    const h = debugGame(SHADOWED);
    const set = h.game.setDataBreakpoints([{ dataId: "health" }]);
    expect(set[0]!.verified).toBe(true);
    // Placed where the global is declared.
    expect(set[0]!.location?.range.start.line).toBe(0);
    h.game.start();
    h.game.continue();
    expect(h.of("game/hitBreakpoint")).toHaveLength(0);
    expect(h.game.story.currentText).toBe("Second 9.\n");
    const global = (h.game.story as unknown as ProgramStory).state
      .variablesState.GetGlobalVariableValue("health") as { value?: unknown };
    expect(global.value).toBe(100);
    // The temporary's own breakpoint does stop there.
    const local = debugGame(SHADOWED);
    local.game.setDataBreakpoints([{ dataId: "main.health" }]);
    local.game.start();
    local.continueToBreakpoint();
    expect(local.stoppedAt()).toBe(6);
    expect(names(local.game.getTempVariables())).toContain("health=9");
  });

  it("stops at a breakpoint inside a function a builtin calls, and records the lines it ran", () => {
    const text = [
      "store order = \"\"", //               0
      "-> main", //                          1
      "scene main", //                       2
      "  local t = {3, 1, 2}", //            3
      "  Before.", //                        4
      "  & table.sort(t, less)", //          5
      "  order = table.concat(t, \",\")", // 6
      "  Sorted {order}.", //                7
      "  done", //                           8
      "end", //                              9
      "function less(a, b)", //              10
      "  local before = a < b", //           11
      "  return before", //                  12
      "end", //                              13
      "",
    ].join("\n");
    const free = debugGame(text);
    free.game.start();
    free.game.continue();
    expect(free.game.story.currentText).toBe("Sorted 1,2,3.\n");
    const ran = free.of("game/executed").at(-1)?.params.executedLines[MAIN]
      .ranges as number[];
    const holds = (line: number) =>
      ran.some((_, k) => k % 2 === 0 && ran[k]! <= line && line <= ran[k + 1]!);
    // The comparator's lines ran inside the step that called `table.sort`.
    expect(holds(11)).toBe(true);
    expect(holds(12)).toBe(true);
    const h = debugGame(text);
    h.game.setBreakpoints([{ file: MAIN, line: 11 }]);
    h.game.start();
    h.continueToBreakpoint();
    // The comparator runs inside the one step that calls `table.sort`, and
    // the game stops once that step returns, standing on the last line the
    // comparator ran.
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    expect(h.stoppedAt()).toBe(12);
  });

  // A divert to a function, in a scene the story never enters, is a
  // construct the program cannot compile: an error at the divert, and no
  // chunks, so a game cannot be given the program.
  it("reports a divert to a function at its line, and makes no chunks", () => {
    const text = `${NESTED}scene unused\n  -> add\nend\n`;
    const { program } = compile({ [MAIN]: text });
    const errors = Object.values(program.diagnostics ?? {})
      .flat()
      .filter((d) => d.severity === 1)
      .map((d) => [
        d.range.start.line,
        typeof d.message === "string" ? d.message : d.message.value,
      ]);
    // `NESTED` holds lines 0 to 21, so the scene starts on line 22 and the
    // divert is line 23. The divert's own error is the one error on that
    // line (#1708): the program's unsupported-construct report is not
    // added on top of it.
    expect(errors.filter(([line]) => line === 23)).toEqual([
      [
        23,
        "A function can't be diverted to: call `add` instead, as `& add()` on a line of its own or `{add()}` in a line.",
      ],
    ]);
    expect(program.chunks).toBeUndefined();
  });

  it("keeps a temporary's data breakpoint on its binding while an inner block shadows it", () => {
    const h = debugGame(
      [
        "-> main", //                 0
        "scene main", //              1
        "  local health = 10", //     2
        "  First.", //                3
        "  do", //                    4
        "    local health = 99", //   5
        "    Inner {health}.", //     6
        "  end", //                   7
        "  health = health - 1", //   8
        "  Second {health}.", //      9
        "  done", //                  10
        "end", //                     11
        "",
      ].join("\n"),
    );
    h.game.start();
    expect(h.game.setDataBreakpoints([{ dataId: "main.health" }])[0]!.verified).toBe(true);
    // The inner declaration, and the block's end, write no value to the
    // outer `health`.
    h.game.continue();
    expect(h.game.story.currentText).toBe("Inner 99.\n");
    expect(h.of("game/hitBreakpoint")).toHaveLength(0);
    h.continueToBreakpoint();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    expect(h.stoppedAt()).toBe(8);
    expect(names(h.game.getTempVariables())).toContain("health=9");
  });

  // A `local function` in a scene is declared as a function of its own; a
  // function value is written in its statement's chunk.
  it.each([["local function bump()"], ["local bump = function()"]])(
    "fires a data breakpoint on a temporary of a function written inside a scene: %s",
    (header) => {
    const text = [
      "-> main", //                    0
      "scene main", //                 1
      `  ${header}`, //                2
      "    local n = 0", //            3
      "    n = n + 1", //              4
      "    return n", //               5
      "  end", //                      6
      "  Start.", //                   7
      "  local r = bump()", //         8
      "  Got {r}.", //                 9
      "  done", //                     10
      "end", //                        11
      "",
    ].join("\n");
    const paused = debugGame(text);
    paused.game.setBreakpoints([{ file: MAIN, line: 4 }]);
    paused.game.start();
    paused.continueToBreakpoint();
    expect(paused.stoppedAt()).toBe(4);
    const n = paused.game.getTempVariables().find((v) => v.name === "n")!;
    const dataId = `${n.scopePath}.${n.name}`;
    const h = debugGame(text);
    const set = h.game.setDataBreakpoints([{ dataId }]);
    expect({ dataId, verified: set[0]!.verified }).toEqual({
      dataId,
      verified: true,
    });
    expect(set[0]!.location?.range.start.line).toBe(4);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    expect(h.stoppedAt()).toBe(4);
    expect(names(h.game.getTempVariables())).toContain("n=1");
    },
  );

  it("fires a data breakpoint on a temporary a closure captured, when the closure writes it", () => {
    const text = [
      "-> main", //                       0
      "scene main", //                    1
      "  Start.", //                      2
      "  Got {outer()}.", //              3
      "  done", //                        4
      "end", //                           5
      "function outer()", //              6
      "  local n = 0", //                 7
      "  local bump = function()", //     8
      "    n = n + 1", //                 9
      "    return n", //                  10
      "  end", //                         11
      "  return bump()", //               12
      "end", //                           13
      "",
    ].join("\n");
    // Stopped in `outer` once `n` is declared, the Variables view names it
    // `outer.n`; the closure writes that variable.
    const h = debugGame(text);
    h.game.setBreakpoints([{ file: MAIN, line: 12 }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(12);
    const n = h.game.getTempVariables().find((v) => v.name === "n")!;
    const dataId = `${n.scopePath}.${n.name}`;
    expect(dataId).toBe("outer.n");
    expect(h.game.setDataBreakpoints([{ dataId }])[0]!.verified).toBe(true);
    h.game.setBreakpoints([]);
    h.continueToBreakpoint();
    expect(h.of("game/hitBreakpoint")).toHaveLength(2);
    expect(h.stoppedAt()).toBe(9);
    // `outer`'s frame, below the closure's, shows the value it wrote.
    const frames = h.frames().stackFrames;
    expect(frames.map((f) => f.name).slice(-2)).toEqual(["outer", "main"]);
    const outerFrame = frames.find((f) => f.name === "outer")!;
    expect(names(h.game.getTempVariables(0, outerFrame.id))).toContain("n=1");
  });

  it("fires a data breakpoint when a callback writes the variable and declares another of its name", () => {
    const text = [
      "-> main", //                                0
      "scene main", //                             1
      "  Start.", //                               2
      "  Got {outer()}.", //                       3
      "  done", //                                 4
      "end", //                                    5
      "function outer()", //                       6
      "  local n = 0", //                          7
      "  local less = function(a, b)", //          8
      "    n = n + 1", //                          9
      "    do", //                                 10
      "      local n = 99", //                     11
      "    end", //                                12
      "    return a < b", //                       13
      "  end", //                                  14
      "  local t = {2, 1}", //                     15
      "  table.sort(t, less)", //                  16
      "  return n", //                             17
      "end", //                                    18
      "",
    ].join("\n");
    const h = debugGame(text);
    h.game.setBreakpoints([{ file: MAIN, line: 16 }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(16);
    expect(h.game.setDataBreakpoints([{ dataId: "outer.n" }])[0]!.verified).toBe(true);
    h.game.setBreakpoints([]);
    h.continueToBreakpoint();
    // The comparator runs inside the step that calls `table.sort`, writes
    // `outer`'s `n` and declares a temporary `n` of its own.
    expect(h.of("game/hitBreakpoint")).toHaveLength(2);
    const outerFrame = h.frames().stackFrames.find((f) => f.name === "outer")!;
    expect(names(h.game.getTempVariables(0, outerFrame.id))).toContain("n=1");
  });

  it("does not take a temporary declared again in its own block for a write to it", () => {
    const h = debugGame(
      [
        "-> main", //              0
        "scene main", //           1
        "  local n = 1", //        2
        "  First.", //             3
        "  local n = 2", //        4
        "  Second.", //            5
        "  n = n + 1", //          6
        "  Third {n}.", //         7
        "  done", //               8
        "end", //                  9
        "",
      ].join("\n"),
    );
    h.game.start();
    h.game.setDataBreakpoints([{ dataId: "main.n" }]);
    h.game.continue();
    expect(h.game.story.currentText).toBe("Second.\n");
    expect(h.of("game/hitBreakpoint")).toHaveLength(0);
    h.continueToBreakpoint();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    expect(h.stoppedAt()).toBe(6);
    expect(names(h.game.getTempVariables())).toContain("n=3");
  });

  // The engine reports the write to the watched binding (#1664): a recursive
  // call of the watched function inside one builtin step declares its own
  // `n` in another invocation, which is not the variable watched, and the
  // comparator's write to the watched invocation's `n` still stops.
  it("fires a data breakpoint on a write to a watched temporary when a recursive call in the same step declares its name", () => {
    const text = [
      "-> main", //                                0
      "scene main", //                             1
      "  Start.", //                               2
      "  Got {outer(true)}.", //                   3
      "  done", //                                 4
      "end", //                                    5
      "function outer(recurse)", //                6
      "  local n = 0", //                          7
      "  if recurse then", //                      8
      "    local less = function(a, b)", //        9
      "      n = n + 1", //                        10
      "      outer(false)", //                     11
      "      return a < b", //                     12
      "    end", //                                13
      "    local t = {2, 1}", //                   14
      "    table.sort(t, less)", //                15
      "  end", //                                  16
      "  return n", //                             17
      "end", //                                    18
      "",
    ].join("\n");
    const h = debugGame(text);
    h.game.setBreakpoints([{ file: MAIN, line: 15 }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(15);
    expect(h.game.setDataBreakpoints([{ dataId: "outer.n" }])[0]!.verified).toBe(true);
    h.game.setBreakpoints([]);
    h.game.continue();
    // The comparator wrote `outer`'s `n`: the game stops after the step
    // that ran `table.sort`, before the beat that shows it.
    expect(h.of("game/hitBreakpoint")).toHaveLength(2);
    // The watched invocation, the outermost `outer` frame, shows the value
    // the comparator wrote; the recursive invocation has returned.
    const outerFrames = h
      .frames()
      .stackFrames.filter((f) => f.name === "outer");
    expect(outerFrames).toHaveLength(1);
    expect(
      names(h.game.getTempVariables(0, outerFrames[0]!.id)).find((v) =>
        v.startsWith("n="),
      ),
    ).toMatch(/^n=[1-9]\d*$/);
  });

  // A closure's frame binds the variable it captured to the cell that
  // outlived the function that declared it; a write in the closure reaches
  // the cell, and only the call that writes it stops.
  it("fires a data breakpoint on a captured variable in its closure's frame, through the cell its function left", () => {
    const text = [
      "-> main", //                       0
      "scene main", //                    1
      "  Start.", //                      2
      "  Got {count()}.", //              3
      "  Then {count()}.", //             4
      "  done", //                        5
      "end", //                           6
      "function make()", //               7
      "  local n = 0", //                 8
      "  return function()", //           9
      "    n = n + 1", //                 10
      "    return n", //                  11
      "  end", //                         12
      "end", //                           13
      "store count = make()", //          14
      "",
    ].join("\n");
    const h = debugGame(text);
    h.game.setBreakpoints([{ file: MAIN, line: 11 }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(11);
    const n = h.game.getTempVariables().find((v) => v.name === "n")!;
    expect(n.value).toBe("1");
    const dataId = `${n.scopePath}.${n.name}`;
    expect(h.game.setDataBreakpoints([{ dataId }])[0]!.verified).toBe(true);
    h.game.setBreakpoints([]);
    // The rest of the first call reads `n`, and the beat shows it; the
    // second call writes it.
    h.continueToBreakpoint();
    expect(h.of("game/hitBreakpoint")).toHaveLength(2);
    expect(h.stoppedAt()).toBe(10);
    expect(names(h.game.getTempVariables())).toContain("n=2");
  });

  // The watch keeps the cell while no frame of the closure runs, so a later
  // call of the closure inside a builtin step, which runs and returns
  // within the step, stops on its write; another closure of the same
  // function, with a cell of its own, does not.
  it("fires a data breakpoint on a captured variable's cell when a builtin calls its closure again", () => {
    const text = [
      "-> main", //                         0
      "scene main", //                      1
      "  Start.", //                        2
      "  local first = less(1, 2)", //      3
      "  First {first}.", //                4
      "  local t = {2, 1}", //              5
      "  & table.sort(t, other)", //        6
      "  Between.", //                      7
      "  local u = {2, 1}", //              8
      "  & table.sort(u, less)", //         9
      "  After.", //                        10
      "  done", //                          11
      "end", //                             12
      "function make()", //                 13
      "  local n = 0", //                   14
      "  return function(a, b)", //         15
      "    n = n + 1", //                   16
      "    return a < b", //                17
      "  end", //                           18
      "end", //                             19
      "store less = make()", //             20
      "store other = make()", //            21
      "",
    ].join("\n");
    const h = debugGame(text);
    h.game.setBreakpoints([{ file: MAIN, line: 17 }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(17);
    const n = h.game.getTempVariables().find((v) => v.name === "n")!;
    expect(n.value).toBe("1");
    const dataId = `${n.scopePath}.${n.name}`;
    expect(h.game.setDataBreakpoints([{ dataId }])[0]!.verified).toBe(true);
    h.game.setBreakpoints([]);
    // The rest of the call returns to the beat that shows it.
    h.game.continue();
    expect(h.game.story.currentText).toBe("First true.\n");
    // `other`'s comparator writes its own cell.
    h.game.continue();
    expect(h.game.story.currentText).toBe("Between.\n");
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    // `less`'s comparator writes the watched cell inside the sort's step.
    h.game.continue();
    expect(h.of("game/hitBreakpoint")).toHaveLength(2);
  });

  // A load reads a captured variable's cell anew. A save written while the
  // watch holds the cell names it by the id the save gave it, and the load
  // binds the watch to the cell it read under that id, so a builtin's call
  // of the closure right after the load stops on its write with no frame of
  // the closure run between steps; another closure of the same function,
  // with a cell of its own, does not. The cases load a closure init built, whose cell the
  // save anchors; one a step built and a global holds, whose cell the save
  // names by an id of its own; and one a step built and a temporary of the
  // running scene holds.
  const closures = {
    "built by init": {
      lines: ["  Ready.", "  Set."],
      declarations: ["store less = make()", "store other = make()"],
    },
    "a global holds": {
      lines: ["  & less = make()", "  & other = make()"],
      declarations: ["store less = nil", "store other = nil"],
    },
    "a scene's temporary holds": {
      lines: ["  local less = make()", "  local other = make()"],
      declarations: [],
    },
  };
  for (const [held, { lines, declarations }] of Object.entries(closures)) {
    it(`keeps a captured variable's watch across a load, for a closure ${held}`, () => {
      const text = [
        "-> main", //                         0
        "scene main", //                      1
        "  Start.", //                        2
        ...lines, //                          3, 4
        "  local first = less(1, 2)", //      5
        "  First {first}.", //                6
        "  local t = {2, 1}", //              7
        "  & table.sort(t, other)", //        8
        "  Between.", //                      9
        "  local u = {2, 1}", //              10
        "  & table.sort(u, less)", //         11
        "  After.", //                        12
        "  done", //                          13
        "end", //                             14
        "function make()", //                 15
        "  local n = 0", //                   16
        "  return function(a, b)", //         17
        "    n = n + 1", //                   18
        "    return a < b", //                19
        "  end", //                           20
        "end", //                             21
        ...declarations, //                   22, 23
        "",
      ].join("\n");
      const h = debugGame(text);
      h.game.setBreakpoints([{ file: MAIN, line: 19 }]);
      h.game.start();
      h.continueToBreakpoint();
      expect(h.stoppedAt()).toBe(19);
      const n = h.game.getTempVariables().find((v) => v.name === "n")!;
      expect(n.value).toBe("1");
      const dataId = `${n.scopePath}.${n.name}`;
      expect(h.game.setDataBreakpoints([{ dataId }])[0]!.verified).toBe(true);
      h.game.setBreakpoints([]);
      h.game.continue();
      expect(h.game.story.currentText).toBe("First true.\n");
      expect(h.of("game/hitBreakpoint")).toHaveLength(1);
      // A save of the state, loaded back through `Game.loadProgramSave`.
      const save = h.game.save();
      expect(JSON.parse(save).watchedCells).toEqual([
        { dataId, cell: expect.any(Number) },
      ]);
      expect(h.game.load(save)).toBe(true);
      expect(h.game.story.currentText).toBe("First true.\n");
      // `other`'s comparator writes its own cell.
      h.game.continue();
      expect(h.game.story.currentText).toBe("Between.\n");
      expect(h.of("game/hitBreakpoint")).toHaveLength(1);
      // `less`'s comparator writes the cell the load read for the watched
      // one, inside the sort's step.
      h.game.continue();
      expect(h.of("game/hitBreakpoint")).toHaveLength(2);
      expect(h.stoppedAt()).toBe(19);
    });
  }

  // A save written before the watch was set names no cell for it, so a
  // load binds the watch to none, however the loaded story reaches its
  // closures: here `less` held another closure when the save was written,
  // and that closure's comparator write after the load does not stop.
  it("carries no captured variable's watch to another closure's variable across a load of a save written before the watch", () => {
    const text = [
      "-> main", //                         0
      "scene main", //                      1
      "  & less = make()", //               2
      "  & other = make()", //              3
      "  Start.", //                        4
      "  local t = {2, 1}", //              5
      "  & table.sort(t, less)", //         6
      "  Sorted.", //                       7
      "  & less = other", //                8
      "  local first = less(1, 2)", //      9
      "  First {first}.", //                10
      "  done", //                          11
      "end", //                             12
      "function make()", //                 13
      "  local n = 0", //                   14
      "  return function(a, b)", //         15
      "    n = n + 1", //                   16
      "    return a < b", //                17
      "  end", //                           18
      "end", //                             19
      "store less = nil", //                20
      "store other = nil", //               21
      "",
    ].join("\n");
    const h = debugGame(text);
    h.game.start();
    expect(h.game.story.currentText).toBe("Start.\n");
    const save = h.game.save();
    expect(JSON.parse(save).watchedCells).toBeUndefined();
    h.game.continue();
    expect(h.game.story.currentText).toBe("Sorted.\n");
    // The call of `less`, which holds `other`'s closure now.
    h.game.setBreakpoints([{ file: MAIN, line: 17 }]);
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(17);
    const n = h.game.getTempVariables().find((v) => v.name === "n")!;
    expect(n.value).toBe("1");
    const dataId = `${n.scopePath}.${n.name}`;
    expect(h.game.setDataBreakpoints([{ dataId }])[0]!.verified).toBe(true);
    h.game.setBreakpoints([]);
    h.game.continue();
    expect(h.game.story.currentText).toBe("First true.\n");
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    expect(h.game.load(save)).toBe(true);
    expect(h.game.story.currentText).toBe("Start.\n");
    // The loaded `less` is the closure the watch never watched.
    h.game.continue();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    expect(h.game.story.currentText).toBe("Sorted.\n");
  });

  // While the function that declared the variable still runs, the closure's
  // frame binds it through an open pointer to that function's block scope,
  // which the watch follows while the closure's frame is gone.
  it("fires a data breakpoint on a captured variable in its closure's frame when a builtin calls the closure again", () => {
    const text = [
      "-> main", //                                0
      "scene main", //                             1
      "  Start.", //                               2
      "  Got {outer()}.", //                       3
      "  done", //                                 4
      "end", //                                    5
      "function outer()", //                       6
      "  local n = 0", //                          7
      "  local less = function(a, b)", //          8
      "    n = n + 1", //                          9
      "    return a < b", //                       10
      "  end", //                                  11
      "  local first = less(1, 2)", //             12
      "  local t = {2, 1}", //                     13
      "  table.sort(t, less)", //                  14
      "  return n", //                             15
      "end", //                                    16
      "",
    ].join("\n");
    const h = debugGame(text);
    h.game.setBreakpoints([{ file: MAIN, line: 10 }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(10);
    // The closure's own frame names the variable it captured.
    const frames = h.frames().stackFrames;
    expect(frames.map((f) => f.name).slice(-2)).toEqual(["outer", "main"]);
    expect(frames[0]!.name).not.toBe("outer");
    const n = h.game.getTempVariables().find((v) => v.name === "n")!;
    expect(n.value).toBe("1");
    const dataId = `${n.scopePath}.${n.name}`;
    expect(h.game.setDataBreakpoints([{ dataId }])[0]!.verified).toBe(true);
    h.game.setBreakpoints([]);
    h.continueToBreakpoint();
    expect(h.of("game/hitBreakpoint")).toHaveLength(2);
    const outerFrame = h.frames().stackFrames.find((f) => f.name === "outer")!;
    expect(names(h.game.getTempVariables(0, outerFrame.id))).toContain("n=2");
  });

  it("fires a global's data breakpoint when a function writes it through _G", () => {
    const h = debugGame(
      [
        "store health = 100", //          0
        "-> main", //                     1
        "scene main", //                  2
        "  First.", //                    3
        "  & hurt()", //                  4
        "  Second {health}.", //          5
        "  done", //                      6
        "end", //                         7
        "function hurt()", //             8
        "  _G.health = health - 1", //    9
        "end", //                         10
        "",
      ].join("\n"),
    );
    h.game.start();
    expect(h.game.setDataBreakpoints([{ dataId: "health" }])[0]!.verified).toBe(true);
    h.continueToBreakpoint();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    expect(h.game.getVarVariables().find((v) => v.name === "health")?.value).toBe("99");
  });

  it("fires a function breakpoint on a named function written inside another function", () => {
    const h = debugGame(
      [
        "-> main", //                       0
        "scene main", //                    1
        "  Start.", //                      2
        "  Got {outer()}.", //              3
        "  done", //                        4
        "end", //                           5
        "function outer()", //              6
        "  local function inner()", //      7
        "    return 1", //                  8
        "  end", //                         9
        "  return inner()", //              10
        "end", //                           11
        "",
      ].join("\n"),
    );
    const set = h.game.setFunctionBreakpoints([{ name: "inner" }, { name: "nope" }]);
    expect(set.map((b) => b.verified)).toEqual([true, false]);
    expect(set[0]!.location?.range.start.line).toBe(7);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    expect(h.stoppedAt()).toBe(7);
    expect(h.frames().stackFrames[0]?.moduleId).toBe("function");
    // Stopped in `inner`'s own frame, above `outer`'s and `main`'s.
    expect(h.frames().totalFrames).toBe(3);
  });

  // `outer` and the functions written in it start on one line: the
  // breakpoint takes the function whose name it gives, not the first one
  // that starts on its line.
  it.each([
    ["is never called", "return 0", 0],
    ["is called", "return inner()", 1],
  ])(
    "resolves a function breakpoint on a function written on its enclosing function's line, which %s",
    (_case, tail, hits) => {
      const h = debugGame(
        [
          "-> main", //                     0
          "scene main", //                  1
          "  Start.", //                    2
          "  Got {outer()}.", //            3
          "  done", //                      4
          "end", //                         5
          `function outer() local function inner() local function deep() return 2 end return 1 end ${tail} end`, // 6
          "",
        ].join("\n"),
      );
      const set = h.game.setFunctionBreakpoints([{ name: "inner" }]);
      expect(set[0]!.verified).toBe(true);
      expect(set[0]!.location?.range.start.line).toBe(6);
      h.game.start();
      if (hits) {
        h.continueToBreakpoint();
        expect(h.of("game/hitBreakpoint")).toHaveLength(1);
        // In `inner`'s frame, not `outer`'s (2 frames) or `deep`'s, which
        // nothing calls.
        expect(h.frames().totalFrames).toBe(3);
      } else {
        // The continue from `Start.` runs `outer` and on to the beat that
        // shows what it returned, with no stop.
        h.game.continue();
        expect(h.game.story.currentText).toBe("Got 0.\n");
        expect(h.of("game/hitBreakpoint")).toHaveLength(0);
      }
    },
  );

  it("offers and stops at the lines of a function written in a declaration", () => {
    const text = [
      "store handler = function()", // 0
      "  local x = 1", //               1
      "  return x + 1", //              2
      "end", //                         3
      "-> main", //                     4
      "scene main", //                  5
      "  Start.", //                    6
      "  local v = handler()", //       7
      "  Got {v}.", //                  8
      "  done", //                      9
      "end", //                         10
      "",
    ].join("\n");
    const h = debugGame(text);
    const lines = h.game.possibleBreakpointLines({
      uri: MAIN,
      range: { start: { line: 0 }, end: { line: 3 } },
    });
    expect(lines).toEqual([1, 2]);
    const set = h.game.setBreakpoints([{ file: MAIN, line: 1 }]);
    expect(set[0]!.verified).toBe(true);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    expect(h.stoppedAt()).toBe(1);
  });

  it("refuses a breakpoint on a declaration, which runs before the story starts", () => {
    const h = debugGame(NESTED);
    const set = h.game.setBreakpoints([{ file: MAIN, line: 0 }]);
    expect(set[0]!.verified).toBe(false);
  });

  it("announces the stop of a step that ends at a beat", () => {
    const h = debugGame(NESTED);
    h.game.setBreakpoints([{ file: MAIN, line: 14 }]);
    h.game.start();
    h.continueToBreakpoint();
    const stepped = h.of("game/stepped").length;
    // The rest of the beat is on the same line: stepping over it ends where
    // the beat waits for the player.
    expect(h.game.step("over")).toBe(true);
    expect(h.of("game/stepped")).toHaveLength(stepped + 1);
    expect(h.game.story.currentText).toBe("Sub here.\n");
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
    const h = debugGame(before);
    h.game.setBreakpoints([{ file: MAIN, line: 14 }]);
    h.game.updateProgram(compile({ [MAIN]: after }).program);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    expect(h.stoppedAt()).toBe(14);
    h.game.continue();
    expect(h.game.story.currentText).toBe("Sub here, edited.\n");
  });

  it("offers the lines a breakpoint can sit on from the line tables", () => {
    const search = { uri: MAIN, range: { start: { line: 0 }, end: { line: 100 } } };
    const program = debugGame(NESTED).game.possibleBreakpointLines(search);
    // Each header, each beat and each line of the function is offered.
    const beats = [3, 5, 9, 12, 14, 15, 18, 19, 20];
    expect(program.filter((line) => beats.includes(line))).toEqual(beats);
    // So is each statement of logic, on its own line, the divert on line 2
    // among them; and no declaration, which runs before a debugger can stop
    // the story.
    const logic = program.filter((line) => !beats.includes(line));
    expect(logic).toEqual([2, 4, 6, 7, 8, 10, 13, 16]);
    // A breakpoint on each of those lines and on each beat stays on it; one
    // on a scene's header moves to the scene's first statement.
    const h = debugGame(NESTED);
    const set = h.game.setBreakpoints(program.map((line) => ({ file: MAIN, line })));
    expect(set.map((b) => b.location?.range.start.line)).toEqual(
      program.map((line) => (line === 3 ? 4 : line === 12 ? 13 : line)),
    );
  });

  it("calls no execution hook and builds no string per step while no breakpoint is set", () => {
    const h = debugGame(NESTED);
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
    h.game.start();
    // The variables of the story the game started.
    const writes = countWriteWatch(story);
    const stepsWatched = story.stepCount;
    try {
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
    // The story wrote variables in those steps (`health`, `result`, the
    // locals), and reported none of them: no write watch was installed.
    expect(story.state.variablesState).toBe(writes.variables);
    expect(story.stepCount - stepsWatched).toBeGreaterThan(20);
    expect(writes.installs).toBe(0);
    expect(writes.calls).toBe(0);
    // What a beat's checkpoint serializes is per beat, not per step.
    expect(strings).toBeLessThan(steps / 4);
    // The game still records each step it takes.
    expect(executed.every((size) => size > 0)).toBe(true);
    // The same counters see the watch a data breakpoint installs.
    const watched = debugGame(NESTED);
    const watchedStory = watched.game.story as unknown as ProgramStory;
    watched.game.setDataBreakpoints([{ dataId: "result" }]);
    watched.game.start();
    const watchedWrites = countWriteWatch(watchedStory);
    watched.continueToBreakpoint();
    expect(watched.of("game/hitBreakpoint")).toHaveLength(1);
    expect(watchedWrites.installs).toBeGreaterThan(0);
    expect(watchedWrites.calls).toBeGreaterThan(0);
  });

  it("records the lines each continue ran", () => {
    const h = debugGame(NESTED);
    const records: Record<string, { ranges: number[] }>[] = [];
    h.game.start();
    for (let i = 0; i < 4; i += 1) {
      records.push(h.of("game/executed").at(-1)?.params.executedLines);
      h.game.continue();
    }
    // Each continue's record holds the beat it stopped at.
    for (const [i, beat] of [5, 14, 15, 9].entries()) {
      const ranges = records[i]![MAIN]!.ranges;
      const holds = ranges.some(
        (_, k) => k % 2 === 0 && ranges[k]! <= beat && beat <= ranges[k + 1]!,
      );
      expect(holds).toBe(true);
    }
  });
});
