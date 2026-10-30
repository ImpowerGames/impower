import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
import {
  IntValue,
  VariablePointerValue,
} from "@impower/sparkdown/src/runtime/Value";
import { Game } from "../../game/core/classes/Game";
import type { StackFrame } from "../../game/core/types/StackFrame";

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

interface Recorded {
  method: string;
  params: any;
}

function debugGame(texts: string | Record<string, string>) {
  const { program } = compile(
    typeof texts === "string" ? { [MAIN]: texts } : texts,
  );
  expect(program.chunks).toBeDefined();
  const game = new Game({
    now: () => 0,
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
  const stoppedAt = () =>
    emitted
      .filter(
        (m) => m.method === "game/hitBreakpoint" || m.method === "game/stepped",
      )
      .at(-1)?.params?.location?.range?.start?.line as number | undefined;
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
  "store health = 100",
  "store result = 0",
  "",
  "scene main",
  "  local mainLoc = 111",
  "  Main here.",
  "  health = health - 25",
  "  -> sub ->",
  "  result = add(2, 3)",
  "  Back in main {result}.",
  "  done",
  "end",
  "scene sub",
  "  local subLoc = 222",
  "  Sub here.",
  "  More sub.",
  "  ->->",
  "end",
  "function add(a, b)",
  "  local sum = a + b",
  "  return sum",
  "end",
  "scene start",
  "  -> main",
  "end",
  "",
].join("\n");

const names = (vars: { name: string; value: string }[]) =>
  vars.map((v) => `${v.name}=${v.value}`);

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
    expect(lines).toEqual([15, 7]);
    expect(h.game.getThreads()).toEqual([{ id: 0, name: "sub" }]);
  });

  it("pages the stack from the top frame", () => {
    const h = debugGame(NESTED);
    h.game.setBreakpoints([{ file: MAIN, line: 15 }]);
    h.game.start();
    h.continueToBreakpoint();
    const id = h.game.getThreads()[0]!.id;
    const page = (s: number, l?: number) => {
      const trace = h.game.getStackTrace(id, s, l);
      expect(trace.totalFrames).toBe(2);
      return trace.stackFrames.map((f) => `${f.id}:${f.name}`);
    };
    expect(page(0)).toEqual(["1:sub", "0:main"]);
    expect(page(0, 1)).toEqual(["1:sub"]);
    expect(page(1, 1)).toEqual(["0:main"]);
    expect(page(0, 20)).toEqual(["1:sub", "0:main"]);
    expect(page(0, 0)).toEqual(["1:sub", "0:main"]);
    expect(page(1)).toEqual(["0:main"]);
    expect(page(2, 1)).toEqual([]);
  });

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
    expect(trace.stackFrames.map((f) => f.location?.range.start.line)).toEqual([14, 7]);
  });

  it("places the frame of a checkpoint loaded in place on the beat it shows, as a load of its save does (#1200)", () => {
    const script = [
      "scene start",
      "  choose",
      "    First.",
      "    & aside()",
      "    * One",
      "  end",
      "  choose",
      "    Second.",
      "    & aside()",
      "    * Two",
      "  end",
      "end",
      "function aside()",
      '  print("Aside.")',
      "end",
      "",
    ].join("\n");
    const advanceTo = (game: Game, text: string) => {
      for (let i = 0; i < 10 && game.story.currentText !== text; i++) {
        if (game.story.currentChoices.length > 0) {
          game.chosePathToContinue(0);
        } else {
          game.continue();
        }
      }
      expect(game.story.currentText).toBe(text);
    };
    const topLine = (h: ReturnType<typeof debugGame>) =>
      h.frames().stackFrames[0]?.location?.range.start.line;
    const inPlace = debugGame(script);
    inPlace.game.start();
    expect(inPlace.game.story.currentText).toBe("First.\n");
    const checkpoint = inPlace.game.newestCheckpoint()!;
    advanceTo(inPlace.game, "Second.\n");
    expect(inPlace.game.loadCheckpoint(checkpoint)).toBe(true);
    expect(inPlace.game.story.currentText).toBe("First.\n");
    const fromJson = debugGame(script);
    expect(fromJson.game.load(inPlace.game.checkpointJson(checkpoint)!)).toBe(true);
    expect(topLine(fromJson)).toBe(2);
    expect(topLine(inPlace)).toBe(2);
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
    h.game.step("over");
    expect(h.stoppedAt()).toBe(20);
    expect(h.frames().totalFrames).toBe(2);
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

  it("leaves out of the globals the cell a define's method reads a function's local through", () => {
    const h = debugGame(
      [
        "store health = 100",
        "function outer(v)",
        "  local a = v",
        "  define thing with",
        "    function get()",
        "      return a",
        "    end",
        "  end",
        "  return thing.get()",
        "end",
        "",
        "scene main",
        "  Got {outer(7)}.",
        "  done",
        "end",
        "scene start",
        "  -> main",
        "end",
        "",
      ].join("\n"),
    );
    h.game.start();
    expect(h.game.story.currentText).toBe("Got 7.\n");
    const variablesState = h.game.story.state.variablesState;
    expect(variablesState.GlobalVariableExistsWithName("__cell$$thing$get$a")).toBe(true);
    const shown = names(h.game.getVarVariables());
    expect(shown).toContain("health=100");
    expect(shown.filter((entry) => entry.split("=")[0]!.indexOf("$") > 0)).toEqual([]);
  });

  it("fires a data breakpoint where the global is assigned", () => {
    const h = debugGame(NESTED);
    const set = h.game.setDataBreakpoints([{ dataId: "health" }, { dataId: "nope" }]);
    expect(set.map((b) => b.verified)).toEqual([true, false]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    const health = h.game.getVarVariables().find((v) => v.name === "health");
    expect(set[0]!.location?.range.start.line).toBe(0);
    expect(h.stoppedAt()).toBe(6);
    expect(health?.value).toBe("75");
  });

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

    expect(h.game.story.asyncContinueComplete).toBe(false);
    h.game.continue();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    expect(h.game.story.currentText).toBe("Sub here.\n");
    const health = (g: Game) =>
      g.getVarVariables().find((v) => v.name === "health")?.value;
    expect(health(h.game)).toBe("75");

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

  it("steps in to a function once it has bound every parameter", () => {
    const h = debugGame(NESTED);
    h.game.setBreakpoints([{ file: MAIN, line: 8 }]);
    h.game.start();
    h.continueToBreakpoint();
    h.game.step("in");
    expect(h.stoppedAt()).toBe(18);
    expect(names(h.game.getTempVariables()).sort()).toEqual(["a=2", "b=3"]);
  });

  const calling = (call: string, functions: string[]) =>
    [
      "store result = 0",
      "",
      "scene main",
      "  Before.",
      `  result = ${call}`,
      "  done",
      "end",
      ...functions,
      "scene start",
      "  -> main",
      "end",
      "",
    ].join("\n");

  const stepInFromCall = (script: string) => {
    const h = debugGame(script);
    h.game.setBreakpoints([{ file: MAIN, line: 4 }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(4);
    h.game.step("in");
    return {
      h,
      line: h.stoppedAt(),
      temps: names(h.game.getTempVariables()).sort(),
    };
  };

  it("steps in to a function with no parameters on its first line", () => {
    const { line, temps } = stepInFromCall(
      calling("zero()", ["function zero()", "  return 0", "end"]),
    );
    expect(line).toBe(7);
    expect(temps).toEqual([]);
  });

  it("steps in to a function with one parameter once it is bound", () => {
    const { line, temps } = stepInFromCall(
      calling("twice(4)", ["function twice(n)", "  return n * 2", "end"]),
    );
    expect(line).toBe(7);
    expect(temps).toEqual(["n=4"]);
  });

  it("steps in to a vararg function once its named parameters are bound", () => {
    const { line, temps } = stepInFromCall(
      calling("first(7, 8, 9)", ["function first(a, b, ...)", "  return a", "end"]),
    );
    expect(line).toBe(7);
    expect(temps.filter((t) => /^[ab]=/.test(t))).toEqual(["a=7", "b=8"]);
  });

  it("steps in to the call inside an argument, then to the outer call", () => {
    const { h, line, temps } = stepInFromCall(
      calling("add(add(1, 2), 3)", [
        "function add(a, b)",
        "  return a + b",
        "end",
      ]),
    );
    expect(line).toBe(7);
    expect(temps).toEqual(["a=1", "b=2"]);
    h.game.step("out");
    expect(h.stoppedAt()).toBe(4);
    h.game.step("in");
    expect(h.stoppedAt()).toBe(7);
    expect(names(h.game.getTempVariables()).sort()).toEqual(["a=3", "b=3"]);
  });

  it("steps in to each of two calls on one line once each binds its parameters", () => {
    const { h, line, temps } = stepInFromCall(
      calling("add(1, 2) + add(3, 4)", [
        "function add(a, b)",
        "  return a + b",
        "end",
      ]),
    );
    expect(line).toBe(7);
    expect(temps).toEqual(["a=1", "b=2"]);
    h.game.step("out");
    expect(h.stoppedAt()).toBe(4);
    h.game.step("in");
    expect(h.stoppedAt()).toBe(7);
    expect(names(h.game.getTempVariables()).sort()).toEqual(["a=3", "b=4"]);
  });

  it("stops once when a step in lands where a function breakpoint stops", () => {
    const h = debugGame(NESTED);
    h.game.setBreakpoints([{ file: MAIN, line: 8 }]);
    h.game.setFunctionBreakpoints([{ name: "add" }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(8);
    const stops = () =>
      h.of("game/hitBreakpoint").length + h.of("game/stepped").length;
    const before = stops();
    h.game.step("in");
    expect(stops()).toBe(before + 1);
    expect(h.stoppedAt()).toBe(18);
    expect(names(h.game.getTempVariables()).sort()).toEqual(["a=2", "b=3"]);
    h.game.step("in");
    expect(h.stoppedAt()).toBe(19);
  });

  const SHADOWED = [
    "store health = 100",
    "",
    "scene main",
    "  local health = 10",
    "  local count = 0",
    "  First.",
    "  health = health - 1",
    "  count = count + 1",
    "  Second {health}.",
    "  done",
    "end",
    "scene start",
    "  -> main",
    "end",
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
    expect(h.stoppedAt()).toBe(7);
    expect(names(h.game.getTempVariables())).toContain("count=1");
  });

  it("fires a global's data breakpoint only when the global is written, not a temporary that shadows it", () => {
    const h = debugGame(SHADOWED);
    const set = h.game.setDataBreakpoints([{ dataId: "health" }]);
    expect(set[0]!.verified).toBe(true);
    expect(set[0]!.location?.range.start.line).toBe(0);
    h.game.start();
    h.game.continue();
    expect(h.of("game/hitBreakpoint")).toHaveLength(0);
    expect(h.game.story.currentText).toBe("Second 9.\n");
    const global = (h.game.story as unknown as ProgramStory).state
      .variablesState.GetGlobalVariableValue("health") as { value?: unknown };
    expect(global.value).toBe(100);
    const local = debugGame(SHADOWED);
    local.game.setDataBreakpoints([{ dataId: "main.health" }]);
    local.game.start();
    local.continueToBreakpoint();
    expect(local.stoppedAt()).toBe(6);
    expect(names(local.game.getTempVariables())).toContain("health=9");
  });

  it("stops at a breakpoint inside a function a builtin calls, and records the lines it ran", () => {
    const text = [
      "store order = \"\"",
      "",
      "scene main",
      "  local t = {3, 1, 2}",
      "  Before.",
      "  & table.sort(t, less)",
      "  order = table.concat(t, \",\")",
      "  Sorted {order}.",
      "  done",
      "end",
      "function less(a, b)",
      "  local before = a < b",
      "  return before",
      "end",
      "scene start",
      "  -> main",
      "end",
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
    expect(holds(11)).toBe(true);
    expect(holds(12)).toBe(true);
    const h = debugGame(text);
    h.game.setBreakpoints([{ file: MAIN, line: 11 }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    expect(h.stoppedAt()).toBe(12);
  });

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
    expect(errors.filter(([line]) => line === 26)).toEqual([
      [
        26,
        "A function can't be diverted to: call `add` instead, as `& add()` on a line of its own or `{add()}` in a line.",
      ],
    ]);
    expect(program.chunks).toBeUndefined();
  });

  it("keeps a temporary's data breakpoint on its binding while an inner block shadows it", () => {
    const h = debugGame(
      [
        "",
        "scene main",
        "  local health = 10",
        "  First.",
        "  do",
        "    local health = 99",
        "    Inner {health}.",
        "  end",
        "  health = health - 1",
        "  Second {health}.",
        "  done",
        "end",
        "scene start",
        "  -> main",
        "end",
        "",
      ].join("\n"),
    );
    h.game.start();
    expect(h.game.setDataBreakpoints([{ dataId: "main.health" }])[0]!.verified).toBe(true);
    h.game.continue();
    expect(h.game.story.currentText).toBe("Inner 99.\n");
    expect(h.of("game/hitBreakpoint")).toHaveLength(0);
    h.continueToBreakpoint();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    expect(h.stoppedAt()).toBe(8);
    expect(names(h.game.getTempVariables())).toContain("health=9");
  });

  it.each([["local function bump()"], ["local bump = function()"]])(
    "fires a data breakpoint on a temporary of a function written inside a scene: %s",
    (header) => {
    const text = [
      "",
      "scene main",
      `  ${header}`,
      "    local n = 0",
      "    n = n + 1",
      "    return n",
      "  end",
      "  Start.",
      "  local r = bump()",
      "  Got {r}.",
      "  done",
      "end",
      "scene start",
      "  -> main",
      "end",
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

  it("keeps the data breakpoint of one anonymous function's temporary off another's of the same name", () => {
    const text = [
      "",
      "scene main",
      "  local first = function()",
      "    local n = 0",
      "    n = n + 1",
      "    return n",
      "  end",
      "  local second = function()",
      "    local n = 0",
      "    n = n + 2",
      "    return n",
      "  end",
      "  Start.",
      "  local b = second()",
      "  local a = first()",
      "  Got {a} {b}.",
      "  done",
      "end",
      "scene start",
      "  -> main",
      "end",
      "",
    ].join("\n");
    const paused = debugGame(text);
    paused.game.setBreakpoints([{ file: MAIN, line: 9 }]);
    paused.game.start();
    paused.continueToBreakpoint();
    expect(paused.stoppedAt()).toBe(9);
    expect(paused.frames().stackFrames[0]!.name).toBe("<anonymous>");
    const n = paused.game.getTempVariables().find((v) => v.name === "n")!;
    const dataId = `${n.scopePath}.${n.name}`;
    const h = debugGame(text);
    const set = h.game.setDataBreakpoints([{ dataId }]);
    expect(set[0]!.verified).toBe(true);
    expect(set[0]!.location?.range.start.line).toBe(9);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    expect(h.stoppedAt()).toBe(9);
    expect(names(h.game.getTempVariables())).toContain("n=2");
    h.continueToBreakpoint();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
  });

  it("fires a data breakpoint on a temporary a closure captured, when the closure writes it", () => {
    const text = [
      "",
      "scene main",
      "  Start.",
      "  Got {outer()}.",
      "  done",
      "end",
      "function outer()",
      "  local n = 0",
      "  local bump = function()",
      "    n = n + 1",
      "    return n",
      "  end",
      "  return bump()",
      "end",
      "scene start",
      "  -> main",
      "end",
      "",
    ].join("\n");
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
    const frames = h.frames().stackFrames;
    expect(frames.map((f) => f.name).slice(-2)).toEqual(["outer", "main"]);
    const outerFrame = frames.find((f) => f.name === "outer")!;
    expect(names(h.game.getTempVariables(0, outerFrame.id))).toContain("n=1");
  });

  it("fires a data breakpoint when a callback writes the variable and declares another of its name", () => {
    const text = [
      "",
      "scene main",
      "  Start.",
      "  Got {outer()}.",
      "  done",
      "end",
      "function outer()",
      "  local n = 0",
      "  local less = function(a, b)",
      "    n = n + 1",
      "    do",
      "      local n = 99",
      "    end",
      "    return a < b",
      "  end",
      "  local t = {2, 1}",
      "  table.sort(t, less)",
      "  return n",
      "end",
      "scene start",
      "  -> main",
      "end",
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
    expect(h.of("game/hitBreakpoint")).toHaveLength(2);
    const outerFrame = h.frames().stackFrames.find((f) => f.name === "outer")!;
    expect(names(h.game.getTempVariables(0, outerFrame.id))).toContain("n=1");
  });

  it("does not take a temporary declared again in its own block for a write to it", () => {
    const h = debugGame(
      [
        "",
        "scene main",
        "  local n = 1",
        "  First.",
        "  local n = 2",
        "  Second.",
        "  n = n + 1",
        "  Third {n}.",
        "  done",
        "end",
        "scene start",
        "  -> main",
        "end",
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

  it("fires a data breakpoint on a write to a watched temporary when a recursive call in the same step declares its name", () => {
    const text = [
      "",
      "scene main",
      "  Start.",
      "  Got {outer(true)}.",
      "  done",
      "end",
      "function outer(recurse)",
      "  local n = 0",
      "  if recurse then",
      "    local less = function(a, b)",
      "      n = n + 1",
      "      outer(false)",
      "      return a < b",
      "    end",
      "    local t = {2, 1}",
      "    table.sort(t, less)",
      "  end",
      "  return n",
      "end",
      "scene start",
      "  -> main",
      "end",
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
    expect(h.of("game/hitBreakpoint")).toHaveLength(2);
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

  it("does not fire a data breakpoint on a self-recursive local function's declaration, and fires on a later write", () => {
    const text = [
      "",
      "scene main",
      "  Start.",
      "  Got {outer()}.",
      "  done",
      "end",
      "function outer()",
      "  local f = 1",
      "  local g = 2",
      "  local function f(x)",
      "    if x > 0 then",
      "      return f(x - 1)",
      "    end",
      "    return 0",
      "  end",
      "  local r = f(2)",
      "  f = 5",
      "  return r",
      "end",
      "scene start",
      "  -> main",
      "end",
      "",
    ].join("\n");
    const h = debugGame(text);
    h.game.setBreakpoints([{ file: MAIN, line: 8 }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(8);
    const set = h.game.setDataBreakpoints([{ dataId: "outer.f" }]);
    expect(set[0]!.verified).toBe(true);
    expect(set[0]!.location?.range.start.line).toBe(16);
    h.game.setBreakpoints([]);
    h.game.continue();
    expect(h.of("game/hitBreakpoint")).toHaveLength(2);
    expect(h.stoppedAt()).toBe(16);
    expect(names(h.game.getTempVariables())).toContain("f=5");
  });

  it("fires a data breakpoint on a captured variable in its closure's frame, through the cell its function left", () => {
    const text = [
      "",
      "scene main",
      "  Start.",
      "  Got {count()}.",
      "  Then {count()}.",
      "  done",
      "end",
      "function make()",
      "  local n = 0",
      "  return function()",
      "    n = n + 1",
      "    return n",
      "  end",
      "end",
      "store count = make()",
      "scene start",
      "  -> main",
      "end",
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
    h.continueToBreakpoint();
    expect(h.of("game/hitBreakpoint")).toHaveLength(2);
    expect(h.stoppedAt()).toBe(10);
    expect(names(h.game.getTempVariables())).toContain("n=2");
  });

  it("fires a data breakpoint on a captured variable's cell when a builtin calls its closure again", () => {
    const text = [
      "",
      "scene main",
      "  Start.",
      "  local first = less(1, 2)",
      "  First {first}.",
      "  local t = {2, 1}",
      "  & table.sort(t, other)",
      "  Between.",
      "  local u = {2, 1}",
      "  & table.sort(u, less)",
      "  After.",
      "  done",
      "end",
      "function make()",
      "  local n = 0",
      "  return function(a, b)",
      "    n = n + 1",
      "    return a < b",
      "  end",
      "end",
      "store less = make()",
      "store other = make()",
      "scene start",
      "  -> main",
      "end",
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
    h.game.continue();
    expect(h.game.story.currentText).toBe("First true.\n");
    h.game.continue();
    expect(h.game.story.currentText).toBe("Between.\n");
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    h.game.continue();
    expect(h.of("game/hitBreakpoint")).toHaveLength(2);
  });

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
        "",
        "scene main",
        "  Start.",
        ...lines,
        "  local first = less(1, 2)",
        "  First {first}.",
        "  local t = {2, 1}",
        "  & table.sort(t, other)",
        "  Between.",
        "  local u = {2, 1}",
        "  & table.sort(u, less)",
        "  After.",
        "  done",
        "end",
        "function make()",
        "  local n = 0",
        "  return function(a, b)",
        "    n = n + 1",
        "    return a < b",
        "  end",
        "end",
        ...declarations,
        "scene start",
        "  -> main",
        "end",
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
      const save = h.game.save();
      expect(h.game.load(save)).toBe(true);
      expect(h.game.load(save)).toBe(true);
      expect(h.game.story.currentText).toBe("First true.\n");
      h.game.continue();
      expect(h.game.story.currentText).toBe("Between.\n");
      expect(h.of("game/hitBreakpoint")).toHaveLength(1);
      h.game.continue();
      expect(h.of("game/hitBreakpoint")).toHaveLength(2);
      expect(h.stoppedAt()).toBe(19);
      expect(JSON.parse(save).watchedCells).toEqual([
        { dataId, cell: expect.any(Number), tag: expect.any(String) },
      ]);
      const parsed = JSON.parse(save);
      parsed.watchedCells = [
        { dataId, cell: String(parsed.watchedCells[0].cell), tag: 1 },
        "nothing",
      ];
      const hits = h.of("game/hitBreakpoint").length;
      expect(h.game.load(JSON.stringify(parsed))).toBe(true);
      expect(h.game.story.currentText).toBe("First true.\n");
      h.game.continue();
      h.game.continue();
      expect(h.of("game/hitBreakpoint")).toHaveLength(hits);
      expect(h.game.story.currentText).toBe("After.\n");
    });
  }

  it("carries no watch that holds another cell since the save to the cell the save noted", () => {
    const text = [
      "",
      "scene main",
      "  Start.",
      "  local first = less(1, 2)",
      "  First {first}.",
      "  local t = {2, 1}",
      "  & table.sort(t, other)",
      "  Between.",
      "  local u = {2, 1}",
      "  & table.sort(u, less)",
      "  After.",
      "  local second = other(3, 4)",
      "  Second {second}.",
      "  done",
      "end",
      "function make()",
      "  local n = 0",
      "  return function(a, b)",
      "    n = n + 1",
      "    return a < b",
      "  end",
      "end",
      "store less = make()",
      "store other = make()",
      "scene start",
      "  -> main",
      "end",
      "",
    ].join("\n");
    const h = debugGame(text);
    h.game.setBreakpoints([{ file: MAIN, line: 19 }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(19);
    const n = h.game.getTempVariables().find((v) => v.name === "n")!;
    const dataId = `${n.scopePath}.${n.name}`;
    expect(h.game.setDataBreakpoints([{ dataId }])[0]!.verified).toBe(true);
    h.game.setBreakpoints([]);
    h.game.continue();
    expect(h.game.story.currentText).toBe("First true.\n");
    const save = h.game.save();
    h.game.continue();
    expect(h.game.story.currentText).toBe("Between.\n");
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    h.continueToBreakpoint();
    expect(h.of("game/hitBreakpoint")).toHaveLength(2);
    const shown = () => {
      try {
        return h.game.story.currentText;
      } catch {
        return null;
      }
    };
    for (let i = 0; i < 8 && shown() !== "Second true.\n"; i += 1) {
      h.game.continue();
    }
    expect(h.game.story.currentText).toBe("Second true.\n");
    const hits = h.of("game/hitBreakpoint").length;
    expect(h.game.load(save)).toBe(true);
    expect(h.game.story.currentText).toBe("First true.\n");
    h.game.continue();
    expect(h.of("game/hitBreakpoint")).toHaveLength(hits);
    expect(h.game.story.currentText).toBe("Between.\n");
    h.game.continue();
    expect(h.of("game/hitBreakpoint")).toHaveLength(hits);
    expect(h.game.story.currentText).toBe("After.\n");
  });

  it("carries no captured variable's watch to another closure's variable across a load of a save written before the watch", () => {
    const text = [
      "",
      "scene main",
      "  & less = make()",
      "  & other = make()",
      "  Start.",
      "  local t = {2, 1}",
      "  & table.sort(t, less)",
      "  Sorted.",
      "  & less = other",
      "  local first = less(1, 2)",
      "  First {first}.",
      "  done",
      "end",
      "function make()",
      "  local n = 0",
      "  return function(a, b)",
      "    n = n + 1",
      "    return a < b",
      "  end",
      "end",
      "store less = nil",
      "store other = nil",
      "scene start",
      "  -> main",
      "end",
      "",
    ].join("\n");
    const h = debugGame(text);
    h.game.start();
    expect(h.game.story.currentText).toBe("Start.\n");
    const save = h.game.save();
    expect(JSON.parse(save).watchedCells).toBeUndefined();
    h.game.continue();
    expect(h.game.story.currentText).toBe("Sorted.\n");
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
    h.game.continue();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    expect(h.game.story.currentText).toBe("Sorted.\n");
  });

  it("fires a data breakpoint on a captured variable in its closure's frame when a builtin calls the closure again", () => {
    const text = [
      "",
      "scene main",
      "  Start.",
      "  Got {outer()}.",
      "  done",
      "end",
      "function outer()",
      "  local n = 0",
      "  local less = function(a, b)",
      "    n = n + 1",
      "    return a < b",
      "  end",
      "  local first = less(1, 2)",
      "  local t = {2, 1}",
      "  table.sort(t, less)",
      "  return n",
      "end",
      "scene start",
      "  -> main",
      "end",
      "",
    ].join("\n");
    const h = debugGame(text);
    h.game.setBreakpoints([{ file: MAIN, line: 10 }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(10);
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
        "store health = 100",
        "",
        "scene main",
        "  First.",
        "  & hurt()",
        "  Second {health}.",
        "  done",
        "end",
        "function hurt()",
        "  _G.health = health - 1",
        "end",
        "scene start",
        "  -> main",
        "end",
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
        "",
        "scene main",
        "  Start.",
        "  Got {outer()}.",
        "  done",
        "end",
        "function outer()",
        "  local function inner()",
        "    return 1",
        "  end",
        "  return inner()",
        "end",
        "scene start",
        "  -> main",
        "end",
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
    expect(h.frames().totalFrames).toBe(3);
  });

  it.each([
    ["is never called", "return 0", 0],
    ["is called", "return inner()", 1],
  ])(
    "resolves a function breakpoint on a function written on its enclosing function's line, which %s",
    (_case, tail, hits) => {
      const h = debugGame(
        [
          "",
          "scene main",
          "  Start.",
          "  Got {outer()}.",
          "  done",
          "end",
          `function outer() local function inner() local function deep() return 2 end return 1 end ${tail} end`,
          "scene start",
          "  -> main",
          "end",
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
        expect(h.frames().totalFrames).toBe(3);
      } else {
        h.game.continue();
        expect(h.game.story.currentText).toBe("Got 0.\n");
        expect(h.of("game/hitBreakpoint")).toHaveLength(0);
      }
    },
  );

  it("offers and stops at the lines of a function written in a declaration", () => {
    const text = [
      "store handler = function()",
      "  local x = 1",
      "  return x + 1",
      "end",
      "",
      "scene main",
      "  Start.",
      "  local v = handler()",
      "  Got {v}.",
      "  done",
      "end",
      "scene start",
      "  -> main",
      "end",
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
    expect(h.game.step("over")).toBe(true);
    expect(h.of("game/stepped")).toHaveLength(stepped + 1);
    expect(h.game.story.currentText).toBe("Sub here.\n");
  });

  it("stops at a breakpoint inside a loop on every pass", () => {
    const h = debugGame(
      [
        "store total = 0",
        "scene start",
        "  for i = 1, 3 do",
        "    total = total + i",
        "  end",
        "  Total {total}.",
        "end",
        "",
      ].join("\n"),
    );
    h.game.setBreakpoints([{ file: MAIN, line: 3 }]);
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
    const beats = [3, 5, 9, 12, 14, 15, 18, 19, 20, 22];
    expect(program.filter((line) => beats.includes(line))).toEqual(beats);
    const logic = program.filter((line) => !beats.includes(line));
    expect(logic).toEqual([4, 6, 7, 8, 10, 13, 16, 23]);
    const h = debugGame(NESTED);
    const set = h.game.setBreakpoints(program.map((line) => ({ file: MAIN, line })));
    expect(set.map((b) => b.location?.range.start.line)).toEqual(
      program.map((line) =>
        line === 3 ? 4 : line === 12 ? 13 : line === 22 ? 23 : line,
      ),
    );
  });

  it("calls no execution hook and builds no string per step while no breakpoint is set", () => {
    const h = debugGame(NESTED);
    const story = h.game.story as unknown as ProgramStory;
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
    expect(story.state.variablesState).toBe(writes.variables);
    expect(story.stepCount - stepsWatched).toBeGreaterThan(20);
    expect(writes.installs).toBe(0);
    expect(writes.calls).toBe(0);
    expect(strings).toBeLessThan(steps / 4);
    expect(executed.every((size) => size > 0)).toBe(true);
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
    for (const [i, beat] of [5, 14, 15, 9].entries()) {
      const ranges = records[i]![MAIN]!.ranges;
      const holds = ranges.some(
        (_, k) => k % 2 === 0 && ranges[k]! <= beat && beat <= ranges[k + 1]!,
      );
      expect(holds).toBe(true);
    }
  });

  it("shows a table's entries, its array part in order and then its keys, and a nested table's too", () => {
    const h = debugGame(
      [
        "",
        "scene main",
        "  Start.",
        "  local t = {2, 1}",
        "  local n = {10, name = 'a', inner = {x = 1}}",
        "  After.",
        "  done",
        "end",
        "scene start",
        "  -> main",
        "end",
        "",
      ].join("\n"),
    );
    h.game.setBreakpoints([{ file: MAIN, line: 5 }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(5);
    const temps = h.game.getTempVariables();
    expect(names(temps).sort()).toEqual(["n={...}", "t={...}"]);
    const t = temps.find((v) => v.name === "t")!;
    expect(t.namedVariables).toBe(2);
    expect(names(h.game.getChildVariables(t.variablesReference))).toEqual([
      "1=2",
      "2=1",
    ]);
    const n = temps.find((v) => v.name === "n")!;
    const entries = h.game.getChildVariables(n.variablesReference);
    expect(names(entries)).toEqual(["1=10", 'name="a"', "inner={...}"]);
    const inner = entries.find((v) => v.name === "inner")!;
    expect(names(h.game.getChildVariables(inner.variablesReference))).toEqual([
      "x=1",
    ]);
    expect(Object.keys(h.game.getEvaluationContext())).not.toContain("t");
  });

  it("shows a table's keys that a JavaScript object would take for its own", () => {
    const h = debugGame(
      [
        "",
        "scene main",
        "  Start.",
        "  local k = {['__proto__'] = 1, ['$x'] = 2, ['$type'] = 'list.var'}",
        "  After.",
        "  done",
        "end",
        "scene start",
        "  -> main",
        "end",
        "",
      ].join("\n"),
    );
    h.game.setBreakpoints([{ file: MAIN, line: 4 }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(4);
    const k = h.game.getTempVariables().find((v) => v.name === "k")!;
    expect(`${k.value} ${k.type}`).toBe("{...} object");
    expect(names(h.game.getChildVariables(k.variablesReference))).toEqual([
      "__proto__=1",
      "$x=2",
      '$type="list.var"',
    ]);
  });

  it("lists a table's array part before its other integer keys, up to the first hole", () => {
    const h = debugGame(
      [
        "",
        "scene main",
        "  Start.",
        "  local s = {'one', 'two', name = 'n', [0] = 'zero', [4] = 'four'}",
        "  After.",
        "  done",
        "end",
        "scene start",
        "  -> main",
        "end",
        "",
      ].join("\n"),
    );
    h.game.setBreakpoints([{ file: MAIN, line: 4 }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(4);
    const s = h.game.getTempVariables().find((v) => v.name === "s")!;
    expect(names(h.game.getChildVariables(s.variablesReference))).toEqual([
      '1="one"',
      '2="two"',
      'name="n"',
      '0="zero"',
      '4="four"',
    ]);
  });

  it("shows a deeply nested table one level at a time, and a table that holds itself", () => {
    const h = debugGame(
      [
        "",
        "scene main",
        "  Start.",
        "  local d = deep()",
        "  local c = {name = 'c'}",
        "  c.self = c",
        "  After.",
        "  done",
        "end",
        "function deep()",
        "  local t = {}",
        "  for i = 1, 20000 do",
        "    t = {child = t}",
        "  end",
        "  return t",
        "end",
        "scene start",
        "  -> main",
        "end",
        "",
      ].join("\n"),
    );
    h.game.setBreakpoints([{ file: MAIN, line: 6 }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(6);
    const temps = h.game.getTempVariables();
    expect(names(temps).sort()).toEqual(["c={...}", "d={...}"]);
    const d = temps.find((v) => v.name === "d")!;
    const child = h.game.getChildVariables(d.variablesReference);
    expect(names(child)).toEqual(["child={...}"]);
    expect(
      names(h.game.getChildVariables(child[0]!.variablesReference)),
    ).toEqual(["child={...}"]);
    const c = temps.find((v) => v.name === "c")!;
    const own = h.game.getChildVariables(c.variablesReference);
    expect(names(own)).toEqual(['name="c"', "self={...}"]);
    const again = h.game.getChildVariables(own[1]!.variablesReference);
    expect(names(again)).toEqual(['name="c"', "self={...}"]);
  });
});

describe("the variables of a selected frame", () => {
  it("shows every parameter of a function where its breakpoint stops", () => {
    const h = debugGame(NESTED);
    h.game.setFunctionBreakpoints([{ name: "add" }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(18);
    expect(names(h.game.getTempVariables()).sort()).toEqual(["a=2", "b=3"]);
    const caller = h.frames().stackFrames.find((f) => f.name === "main")!;
    expect(names(h.game.getTempVariables(0, caller.id))).toEqual([
      "mainLoc=111",
    ]);
  });

  it("reads a temporary bound to a pointer in the frames of its own thread, not the running one's", () => {
    const h = debugGame(
      [
        "",
        "scene main",
        "  local n = 1",
        "  Before.",
        "  <- side",
        "  After {n}.",
        "  done",
        "end",
        "scene side",
        "  In side.",
        "  done",
        "end",
        "scene start",
        "  -> main",
        "end",
        "",
      ].join("\n"),
    );
    h.game.setBreakpoints([{ file: MAIN, line: 9 }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(9);
    expect(h.game.getThreads()).toEqual([
      { id: 0, name: "main" },
      { id: 1, name: "side" },
    ]);
    const callStack = (h.game.story as unknown as ProgramStory).state
      .callStack;
    const suspended = callStack.ThreadWithIndex(0)!;
    const running = callStack.currentThread;
    expect(running.threadIndex).toBe(1);
    running.callstack[0]!.temporaryScopes[0]!.set("n", new IntValue(5));
    const open = new VariablePointerValue("n", 1);
    open.scopeIndex = 0;
    const closed = new VariablePointerValue("n", 1);
    closed.closedValue = new IntValue(7);
    suspended.callstack[0]!.temporaryScopes[0]!.set("p", open);
    suspended.callstack[0]!.temporaryScopes[0]!.set("q", closed);
    expect(names(h.game.getTempVariables(0)).sort()).toEqual([
      "n=1",
      "p=1",
      "q=7",
    ]);
    expect(names(h.game.getTempVariables(1))).toEqual(["n=5"]);
    expect(names(h.game.getTempVariables())).toEqual(["n=5"]);
  });

  it("shows a global in the Vars scope while a temporary of its name shadows it", () => {
    const h = debugGame(
      [
        "store health = 100",
        "",
        "scene main",
        "  local health = 10",
        "  First.",
        "  done",
        "end",
        "scene start",
        "  -> main",
        "end",
        "",
      ].join("\n"),
    );
    h.game.start();
    expect(h.game.story.currentText).toBe("First.\n");
    const vars = names(h.game.getVarVariables());
    expect(vars.filter((v) => v.startsWith("health="))).toEqual([
      "health=100",
    ]);
    expect(names(h.game.getTempVariables())).toEqual(["health=10"]);
  });

  it("evaluates a caller's temporary in the caller's frame while the running frame holds one of its name", () => {
    const h = debugGame(
      [
        "store health = 100",
        "",
        "scene main",
        "  local n = 1",
        "  Start.",
        "  local r = twice(3)",
        "  Done {r}.",
        "  done",
        "end",
        "function twice(k)",
        "  local health = 10",
        "  local n = k * 2",
        "  return n",
        "end",
        "scene start",
        "  -> main",
        "end",
        "",
      ].join("\n"),
    );
    h.game.setFunctionBreakpoints([{ name: "twice" }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(9);
    for (let i = 0; i < 5 && h.stoppedAt() !== 12; i += 1) {
      h.game.step("over");
    }
    expect(h.stoppedAt()).toBe(12);
    const threadId = h.game.getThreads()[0]!.id;
    const { stackFrames } = h.frames();
    expect(stackFrames.map((f) => f.name)).toEqual(["twice", "main"]);
    const [running, caller] = stackFrames as [StackFrame, StackFrame];
    expect(names(h.game.getTempVariables(threadId, caller.id))).toContain(
      "n=1",
    );
    expect(names(h.game.getTempVariables(threadId, running.id))).toContain(
      "n=6",
    );
    const read = (context: any) => ({ health: context.health, n: context.n });
    expect(read(h.game.getEvaluationContext(threadId, caller.id))).toEqual({
      health: 100,
      n: 1,
    });
    expect(read(h.game.getEvaluationContext(threadId, running.id))).toEqual({
      health: 10,
      n: 6,
    });
    const today = h.game.getEvaluationContext();
    expect(read(today)).toEqual({ health: 10, n: 6 });
    expect(h.game.getEvaluationContext(threadId)).toEqual(today);
    expect(h.game.getEvaluationContext(threadId, 99)).toEqual(today);
    expect(h.game.getEvaluationContext(threadId, -1)).toEqual(today);
    expect(h.game.getEvaluationContext(99, caller.id)).toEqual(today);
  });

  it("evaluates a captured variable as the value it points to, in the closure's frame and the frame that declared it", () => {
    const h = debugGame(
      [
        "",
        "scene main",
        "  Start.",
        "  Got {outer()}.",
        "  done",
        "end",
        "function outer()",
        "  local n = 0",
        "  local bump = function()",
        "    n = n + 1",
        "    return n",
        "  end",
        "  return bump()",
        "end",
        "scene start",
        "  -> main",
        "end",
        "",
      ].join("\n"),
    );
    h.game.setBreakpoints([{ file: MAIN, line: 10 }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(10);
    const threadId = h.game.getThreads()[0]!.id;
    const frames = h.frames().stackFrames;
    const outerFrame = frames.find((f) => f.name === "outer")!;
    expect(names(h.game.getTempVariables(threadId, frames[0]!.id))).toContain(
      "n=1",
    );
    expect(h.game.getEvaluationContext().n).toBe(1);
    expect(h.game.getEvaluationContext(threadId, frames[0]!.id).n).toBe(1);
    expect(h.game.getEvaluationContext(threadId, outerFrame.id).n).toBe(1);
  });
});

const CAPTION = [
  "scene start",
  "  choose",
  "    Pick.",
  "    if true then",
  "      Something shows first.",
  "    end",
  "    * One",
  "  end",
  "end",
  "",
].join("\n");

describe("a choose block's caption on the program engine", () => {
  it("reports the lines of the step it carries with the beat that shows them", () => {
    const h = debugGame(CAPTION);
    const reports: { text: string | null; lines: unknown; follow: unknown }[] =
      [];
    h.game.connection.outgoing.addListener("*", (message) => {
      const m = message as unknown as Recorded;
      if (m.method === "game/executed") {
        reports.push({
          text: h.game.story.currentText,
          lines: m.params.executedLines?.[MAIN],
          follow: m.params.lastLocation?.range?.start?.line,
        });
      }
    });
    h.game.start();
    expect(reports).toEqual([
      { text: "Pick.\n", lines: { ranges: [2, 2], last: 2 }, follow: 2 },
    ]);
    h.game.continue();
    expect(reports.slice(1)).toEqual([
      {
        text: "Something shows first.\n",
        lines: { ranges: [3, 4], last: 4 },
        follow: 4,
      },
    ]);
    h.game.continue();
    expect(h.game.story.currentChoices.map((c) => c.text)).toEqual(["One"]);
  });

  it("reports the carried step's lines after a start from the route's checkpoint at the caption", () => {
    const sim = debugGame(CAPTION);
    sim.game.setStartFrom({ file: MAIN, line: 2 });
    const to = sim.game.startAddress!;
    const route = Game.planRoute(
      sim.game.story,
      sim.program as never,
      sim.game.routeStartOf(to),
      to,
    );
    expect(route == null).toBe(false);
    const checkpoint = sim.game.patchAndSimulateRoute(route!);
    expect(typeof checkpoint).toBe("string");
    const h = debugGame(CAPTION);
    h.game.load(checkpoint!);
    const reports: { text: string | null; lines: unknown; follow: unknown }[] =
      [];
    h.game.connection.outgoing.addListener("*", (message) => {
      const m = message as unknown as Recorded;
      if (m.method === "game/executed") {
        reports.push({
          text: h.game.story.currentText,
          lines: m.params.executedLines?.[MAIN],
          follow: m.params.lastLocation?.range?.start?.line,
        });
      }
    });
    h.game.start();
    h.game.continue();
    expect(reports.at(-1)).toEqual({
      text: "Something shows first.\n",
      lines: { ranges: [3, 4], last: 4 },
      follow: 4,
    });
  });

  it("ends a route to the carried line on the beat that shows it", () => {
    const sim = debugGame(CAPTION);
    sim.game.setStartFrom({ file: MAIN, line: 4 });
    const to = sim.game.startAddress!;
    const route = Game.planRoute(
      sim.game.story,
      sim.program as never,
      sim.game.routeStartOf(to),
      to,
    );
    expect(route == null).toBe(false);
    expect(typeof sim.game.patchAndSimulateRoute(route!)).toBe("string");
    expect(sim.game.story.currentText).toBe("Something shows first.\n");
  });

  it("reports the carried step's lines after a save at a breakpoint on the carried line", () => {
    const h = debugGame(CAPTION);
    h.game.setBreakpoints([{ file: MAIN, line: 4 }]);
    h.game.start();
    expect(h.stoppedAt()).toBe(4);
    expect(typeof h.game.save()).toBe("string");
    const reports: { text: string | null; lines: unknown; follow: unknown }[] =
      [];
    h.game.connection.outgoing.addListener("*", (message) => {
      const m = message as unknown as Recorded;
      if (m.method === "game/executed") {
        reports.push({
          text: h.game.story.currentText,
          lines: m.params.executedLines?.[MAIN],
          follow: m.params.lastLocation?.range?.start?.line,
        });
      }
    });
    h.game.continue();
    h.game.continue();
    expect(reports.map((r) => r.text)).toEqual([
      "Pick.\n",
      "Something shows first.\n",
    ]);
    expect(reports[1]).toEqual({
      text: "Something shows first.\n",
      lines: { ranges: [3, 4], last: 4 },
      follow: 4,
    });
  });

  it("waits on the caption's line, and on the carried line with the beat that shows it", () => {
    const h = debugGame(CAPTION);
    const waits: { line: unknown; frame: unknown }[] = [];
    h.game.connection.outgoing.addListener("*", (message) => {
      const m = message as unknown as Recorded;
      if (m.method === "game/awaitingInteraction") {
        waits.push({
          line: m.params.location?.range?.start?.line,
          frame: h.frames().stackFrames[0]?.location?.range.start.line,
        });
      }
    });
    h.game.start();
    expect(h.game.story.currentText).toBe("Pick.\n");
    expect(waits).toEqual([{ line: 2, frame: 2 }]);
    h.game.continue();
    expect(h.game.story.currentText).toBe("Something shows first.\n");
    expect(waits.slice(1)).toEqual([{ line: 4, frame: 4 }]);
  });

  it("keeps the running frame on the caption's line through a refused load", () => {
    const h = debugGame(CAPTION);
    h.game.start();
    expect(h.frames().stackFrames[0]?.location?.range.start.line).toBe(2);
    expect(h.game.load("{not json")).toBe(false);
    expect(h.game.story.currentText).toBe("Pick.\n");
    expect(h.frames().stackFrames[0]?.location?.range.start.line).toBe(2);
  });

  it("keeps the running frame on the caption's line through a host's call into the story", () => {
    const h = debugGame(
      [CAPTION.trimEnd(), "function quiet()", "  return 1", "end", ""].join("\n"),
    );
    h.game.start();
    expect(h.frames().stackFrames[0]?.location?.range.start.line).toBe(2);
    h.game.story.EvaluateFunction("quiet");
    expect(h.game.story.currentText).toBe("Pick.\n");
    expect(h.frames().stackFrames[0]?.location?.range.start.line).toBe(2);
  });

  it("does not stand a loaded checkpoint's frame on the beat the game waited on before the load", () => {
    const h = debugGame(
      [
        "scene start",
        "  choose",
        "    First.",
        "    & aside()",
        "    * One",
        "  end",
        "  choose",
        "    Second.",
        "    & aside()",
        "    * Two",
        "  end",
        "end",
        "function aside()",
        '  print("Aside.")',
        "end",
        "",
      ].join("\n"),
    );
    h.game.start();
    expect(h.game.story.currentText).toBe("First.\n");
    expect(h.frames().stackFrames[0]?.location?.range.start.line).toBe(2);
    const first = h.game.newestCheckpoint();
    expect(first == null).toBe(false);
    for (let i = 0; i < 8 && h.game.story.currentText !== "Second.\n"; i += 1) {
      if (h.game.story.currentChoices.length > 0) {
        h.game.chosePathToContinue(0);
      } else {
        h.game.continue();
      }
    }
    expect(h.game.story.currentText).toBe("Second.\n");
    expect(h.frames().stackFrames[0]?.location?.range.start.line).toBe(7);
    expect(h.game.loadCheckpoint(first!)).toBe(true);
    expect(h.game.story.currentText).toBe("First.\n");
    expect(h.frames().stackFrames[0]?.location?.range.start.line).not.toBe(7);
  });

  it("stops at a breakpoint on the carried line before the caption's beat displays", () => {
    const h = debugGame(CAPTION);
    h.game.setBreakpoints([{ file: MAIN, line: 4 }]);
    h.game.start();
    expect(h.of("game/hitBreakpoint")).toHaveLength(1);
    expect(h.stoppedAt()).toBe(4);
    expect(h.of("game/awaitingInteraction")).toHaveLength(0);
  });
});
