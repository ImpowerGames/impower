import { afterEach, describe, expect, test, vi } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Game } from "../../game/core/classes/Game";
import { compileUI, MAIN_URI } from "../ui/harness/uiTestHarness";

const MAIN = "file:///local/main.sd";

const FIXTURE = [
  "store visits = 0",
  "",
  "scene start",
  "  The first beat.",
  "  -> visit ->",
  "  visits = add(visits, 10)",
  "  The third beat.",
  "  The end.",
  "end",
  "",
  "scene visit",
  "  visits = visits + 1",
  "  Inside the tunnel.",
  "  -> inner ->",
  "  Still in the tunnel.",
  "  visits = visits * 2",
  "  ->->",
  "end",
  "",
  "scene inner",
  "  visits = visits + 100",
  "  Deep inside.",
  "  ->->",
  "end",
  "",
  "function add(a, b)",
  "  local sum = a + b",
  "  return sum",
  "end",
  "",
].join("\n");

const TWO_LINES = [
  "store visits = 0",
  "",
  "scene start",
  "  The first beat.",
  "  -> visit ->",
  "  visits = visits + 10",
  "  Back in the caller.",
  "  The end.",
  "end",
  "",
  "scene visit",
  "  visits = visits + 1",
  "  Inside the tunnel.",
  "  Still in the tunnel.",
  "  ->->",
  "end",
  "",
].join("\n");

const lineIn = (source: string, text: string) =>
  source.split("\n").findIndex((line) => line.trim() === text);

const lineOf = (text: string) => lineIn(FIXTURE, text);

function compile(source: string): SparkProgram {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: MAIN,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
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

function play(breakpoint: string, source = FIXTURE) {
  const lineOf = (text: string) => lineIn(source, text);
  const game = new Game({
    now: () => 0,
    setTimeout: (() => 0) as never,
    resolve: (path: string) => path,
    fetch: async () => "",
    log: () => {},
    program: compile(source),
  } as never);
  const stops: number[] = [];
  const methods: string[] = [];
  game.connection.outgoing.addListener("*", (message) => {
    const { method, params } = message as unknown as {
      method: string;
      params: any;
    };
    methods.push(method);
    if (method === "game/hitBreakpoint" || method === "game/stepped") {
      stops.push(params?.location?.range?.start?.line);
    }
  });
  const topFrameLine = () => {
    const thread = game.getThreads()[0]!.id;
    return game.getStackTrace(thread).stackFrames[0]?.location?.range.start
      .line;
  };
  const frames = () => {
    const thread = game.getThreads()[0]!.id;
    return game
      .getStackTrace(thread)
      .stackFrames.map(
        (frame) => `${frame.name}@${frame.location?.range.start.line}`,
      );
  };
  const step = (traversal: "in" | "out" | "over") => {
    methods.length = 0;
    game.step(traversal);
    return methods;
  };
  const internal = game as any;
  const onScreen = () =>
    Object.values(internal._shownBeatOnScreen?.text ?? {})
      .flat()
      .map((t: any) => t.text)
      .join("")
      .trim();
  const shownBeats = () =>
    (internal._run.beats as { shown: any }[]).map((beat) =>
      Object.values(beat.shown?.text ?? {})
        .flat()
        .map((t: any) => t.text)
        .join("")
        .trim(),
    );
  const variable = (name: string) =>
    game.getVarVariables().find((v) => v.name === name)?.value;
  game.setBreakpoints([{ file: MAIN, line: lineOf(breakpoint) }]);
  game.start();
  for (let i = 0; i < 8 && stops.length === 0; i += 1) {
    game.continue();
  }
  expect(stops).toEqual([lineOf(breakpoint)]);
  const stoppedAt = () => stops.at(-1);
  return {
    game,
    stops,
    stoppedAt,
    onScreen,
    shownBeats,
    variable,
    topFrameLine,
    frames,
    step,
  };
}

describe("Step Out leaves the frame whatever beats remain in it", () => {
  test("Step Out from a tunnel's first statement stops at the caller's next statement, past the tunnel's text lines", () => {
    const h = play("-> visit ->");
    h.game.step("in");
    expect(h.stoppedAt()).toBe(lineOf("visits = visits + 1"));
    h.game.step("out");
    expect(h.stoppedAt()).toBe(lineOf("visits = add(visits, 10)"));
    expect(h.variable("visits")).toBe("202");
    expect(h.shownBeats()).toEqual([
      "The first beat.",
      "Inside the tunnel.",
      "Deep inside.",
      "Still in the tunnel.",
    ]);
    expect(h.onScreen()).toBe("Still in the tunnel.");
    expect(h.game.paused).toBe(true);
    h.game.resume();
    expect(h.onScreen()).toBe("The third beat.");
  });

  test("Step Out from a tunnel holding two text lines in a row stops at the caller's next statement", () => {
    const h = play("-> visit ->", TWO_LINES);
    h.game.step("in");
    expect(h.stoppedAt()).toBe(lineIn(TWO_LINES, "visits = visits + 1"));
    const sent = h.step("out");
    expect(h.stoppedAt()).toBe(lineIn(TWO_LINES, "visits = visits + 10"));
    expect(h.topFrameLine()).toBe(lineIn(TWO_LINES, "visits = visits + 10"));
    expect(sent).not.toContain("game/awaitingInteraction");
    expect(h.onScreen()).toBe("Still in the tunnel.");
    expect(h.game.paused).toBe(true);
  });

  test("Step Out still stops at a breakpoint the frame reaches before it returns", () => {
    const h = play("visits = visits + 1");
    h.game.setBreakpoints([
      { file: MAIN, line: lineOf("visits = visits + 1") },
      { file: MAIN, line: lineOf("visits = visits * 2") },
    ]);
    h.game.step("out");
    expect(h.stoppedAt()).toBe(lineOf("visits = visits * 2"));
    expect(h.onScreen()).toBe("Still in the tunnel.");
  });

  test("Step Out from a nested tunnel stops at its caller's next statement in the outer tunnel", () => {
    const h = play("visits = visits + 100");
    h.game.step("out");
    expect(h.stoppedAt()).toBe(lineOf("Still in the tunnel."));
    expect(h.onScreen()).toBe("Deep inside.");
  });

  test("Step Into onto a tunnel's text line still stops on it, then presents its beat", () => {
    const h = play("visits = visits + 1");
    h.game.step("in");
    expect(h.stoppedAt()).toBe(lineOf("Inside the tunnel."));
    expect(h.onScreen()).toBe("The first beat.");
    h.game.step("in");
    expect(h.stoppedAt()).toBe(lineOf("Inside the tunnel."));
    expect(h.onScreen()).toBe("Inside the tunnel.");
  });
});

describe("a step stops at a passed beat that cannot be drawn settled", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const CUTSCENE = [
    "store visits = 0",
    "scene start",
    "  Before.",
    "  -> visit ->",
    "  visits = visits + 10",
    "  After.",
    "end",
    "scene visit",
    "  visits = visits + 1",
    "  [[play intro]]",
    "  Passed text.",
    "  ->->",
    "end",
    "",
  ].join("\n");

  test("Step Out holds a cutscene inside the tunnel, and Resume plays it", () => {
    const line = (text: string) => lineIn(CUTSCENE, text);
    const { program } = compileUI(CUTSCENE, {
      assets: [
        {
          uri: "inmemory:///intro.webm",
          type: "video",
          name: "intro",
          ext: "webm",
          src: "/intro.webm",
        },
      ],
    });
    const game = new Game({
      program,
      now: () => 0,
      setTimeout: () => 0,
      log: () => {},
    } as never);
    const stops: number[] = [];
    game.connection.outgoing.addListener("*", (message) => {
      const { method, params } = message as unknown as {
        method: string;
        params: any;
      };
      if (method === "game/stepped" || method === "game/hitBreakpoint") {
        stops.push(params?.location?.range?.start?.line);
      }
    });
    game.setBreakpoints([{ file: MAIN_URI, line: line("visits = visits + 1") }]);
    game.start();
    for (let i = 0; i < 8 && stops.length === 0; i += 1) {
      game.continue();
    }
    expect(stops).toEqual([line("visits = visits + 1")]);
    let ready = false;
    vi.spyOn(game.module.assets, "prepareBeat").mockReturnValue(101 as never);
    vi.spyOn(game.module.assets, "isReady").mockImplementation(() => ready);
    const playing = vi
      .spyOn(game.module.ui, "runCutscene")
      .mockReturnValue(0 as never);
    game.step("out");
    expect(stops.at(-1)).toBe(line("[[play intro]]"));
    expect((game as any)._shownBeatOnScreen?.cutscene).toBeTruthy();
    expect(game.paused).toBe(true);
    ready = true;
    game.resume();
    for (let i = 0; i < 5; i += 1) {
      game.update({ deltaMS: 100, elapsedMS: i * 100 } as never);
    }
    expect(playing).toHaveBeenCalledOnce();
  });
});

describe("Step Over passes the frames it calls whatever beats they hold", () => {
  test("Step Over on a tunnel call stops at the caller's next statement", () => {
    const h = play("-> visit ->");
    const sent = h.step("over");
    expect(h.stoppedAt()).toBe(lineOf("visits = add(visits, 10)"));
    expect(h.topFrameLine()).toBe(lineOf("visits = add(visits, 10)"));
    expect(sent).not.toContain("game/awaitingInteraction");
    expect(h.variable("visits")).toBe("202");
    expect(h.onScreen()).toBe("Still in the tunnel.");
  });

  test("Step Over on a nested tunnel call stops at the outer tunnel's next statement", () => {
    const h = play("-> inner ->");
    h.game.step("over");
    expect(h.stoppedAt()).toBe(lineOf("Still in the tunnel."));
    expect(h.onScreen()).toBe("Deep inside.");
  });

  test("Step Over onto a tunnel call line stops on the call line", () => {
    const h = play("Inside the tunnel.");
    h.game.step("over");
    expect(h.stoppedAt()).toBe(lineOf("Inside the tunnel."));
    h.game.step("over");
    expect(h.stoppedAt()).toBe(lineOf("-> inner ->"));
    expect(h.topFrameLine()).toBe(lineOf("-> inner ->"));
    h.game.step("over");
    expect(h.stoppedAt()).toBe(lineOf("Still in the tunnel."));
  });

  test("Step Over on a function call stops at the next statement", () => {
    const h = play("visits = add(visits, 10)");
    h.game.step("over");
    expect(h.stoppedAt()).toBe(lineOf("The third beat."));
    expect(h.variable("visits")).toBe("212");
  });

  test("Step Over on a text line in the same frame still stops on it, then on the next statement", () => {
    const h = play("Still in the tunnel.");
    h.game.step("over");
    expect(h.stoppedAt()).toBe(lineOf("Still in the tunnel."));
    expect(h.onScreen()).toBe("Still in the tunnel.");
    h.game.step("over");
    expect(h.stoppedAt()).toBe(lineOf("visits = visits * 2"));
  });
});

const RECURSION = [
  "store visits = 0",
  "store depth = 0",
  "",
  "scene start",
  "  Begin.",
  "  -> loop ->",
  "  visits = fact(3)",
  "  Done.",
  "end",
  "",
  "scene loop",
  "  depth = depth + 1",
  "  if depth < 3 then",
  "    -> loop ->",
  "  end",
  "  Unwinding.",
  "  ->->",
  "end",
  "",
  "function fact(n)",
  "  if n <= 1 then",
  "    return 1",
  "  end",
  "  return n * fact(n - 1)",
  "end",
  "",
].join("\n");

const recursionLine = (text: string) => lineIn(RECURSION, text);
const RECURSIVE_CALL = recursionLine("if depth < 3 then") + 1;
const FACT_CALL = recursionLine("return n * fact(n - 1)");
const named = (frames: string[], name: string) =>
  frames.filter((frame) => frame.startsWith(`${name}@`)).length;

describe("a step judges frames by the call stack when a frame calls itself on one line", () => {
  test("Step Out from a tunnel's recursive call returns to the tunnel that called it", () => {
    const h = play("-> loop ->", RECURSION);
    for (let i = 0; i < 4; i += 1) {
      h.game.step("in");
    }
    expect(h.frames()).toEqual([
      `loop@${recursionLine("depth = depth + 1")}`,
      `loop@${RECURSIVE_CALL}`,
      `start@${recursionLine("-> loop ->")}`,
    ]);
    h.game.step("out");
    expect(named(h.frames(), "loop")).toBe(1);
  });

  test("Step Over on a tunnel's recursive call line stays in the calling tunnel", () => {
    const h = play("-> loop ->", RECURSION);
    for (let i = 0; i < 3; i += 1) {
      h.game.step("in");
    }
    expect(h.stoppedAt()).toBe(RECURSIVE_CALL);
    h.game.step("over");
    expect(named(h.frames(), "loop")).toBe(1);
    expect(h.stoppedAt()).not.toBe(recursionLine("depth = depth + 1"));
  });

  test("Step Out from a function's recursive call returns to the call that made it", () => {
    const h = play("visits = fact(3)", RECURSION);
    for (let i = 0; i < 4; i += 1) {
      h.game.step("in");
    }
    expect(h.frames()).toEqual([
      `fact@${recursionLine("function fact(n)")}`,
      `fact@${FACT_CALL}`,
      `start@${recursionLine("visits = fact(3)")}`,
    ]);
    h.game.step("out");
    expect(h.frames()).toEqual([
      `fact@${FACT_CALL}`,
      `start@${recursionLine("visits = fact(3)")}`,
    ]);
  });

  test("Step Out and Step Over from a recursive call standing on its caller's line leave one frame", () => {
    const h = play("visits = fact(3)", RECURSION);
    for (let i = 0; i < 8; i += 1) {
      h.game.step("in");
    }
    h.game.step("over");
    h.game.step("out");
    expect(h.frames()).toEqual([
      `fact@${FACT_CALL}`,
      `fact@${FACT_CALL}`,
      `start@${recursionLine("visits = fact(3)")}`,
    ]);
    h.game.step("out");
    expect(h.frames()).toEqual([
      `fact@${FACT_CALL}`,
      `start@${recursionLine("visits = fact(3)")}`,
    ]);
    h.game.step("over");
    expect(h.frames()).toEqual([`start@${recursionLine("visits = fact(3)")}`]);
  });
});

describe("a step through nested frames", () => {
  test("Step Out twice from a tunnel two deep reaches the scene that started them", () => {
    const h = play("visits = visits + 100");
    h.game.step("out");
    expect(h.stoppedAt()).toBe(lineOf("Still in the tunnel."));
    h.game.step("out");
    expect(h.stoppedAt()).toBe(lineOf("visits = add(visits, 10)"));
    expect(h.frames()).toEqual([`start@${lineOf("visits = add(visits, 10)")}`]);
  });

  const FUNCTION_IN_TUNNEL = [
    "store visits = 0",
    "",
    "scene start",
    "  -> visit ->",
    "  visits = visits + 10",
    "  The end.",
    "end",
    "",
    "scene visit",
    "  visits = visits + 1",
    "  visits = add(visits, 5)",
    "  Inside.",
    "  ->->",
    "end",
    "",
    "function add(a, b)",
    "  local sum = a + b",
    "  return sum",
    "end",
    "",
  ].join("\n");
  const inTunnel = (text: string) => lineIn(FUNCTION_IN_TUNNEL, text);

  test("Step Out of a function called from a tunnel returns to the tunnel's line", () => {
    const h = play("visits = add(visits, 5)", FUNCTION_IN_TUNNEL);
    h.game.step("in");
    expect(h.stoppedAt()).toBe(inTunnel("function add(a, b)"));
    h.game.step("out");
    expect(h.stoppedAt()).toBe(inTunnel("visits = add(visits, 5)"));
    expect(h.frames()).toEqual([
      `visit@${inTunnel("visits = add(visits, 5)")}`,
      `start@${inTunnel("-> visit ->")}`,
    ]);
  });

  test("Step Over on a function call inside a tunnel stops at the tunnel's next statement", () => {
    const h = play("visits = add(visits, 5)", FUNCTION_IN_TUNNEL);
    h.game.step("over");
    expect(h.stoppedAt()).toBe(inTunnel("Inside."));
    expect(h.variable("visits")).toBe("6");
  });

  test("Step Out of a tunnel passes a function it calls and stops at the caller", () => {
    const h = play("visits = visits + 1", FUNCTION_IN_TUNNEL);
    h.game.step("out");
    expect(h.stoppedAt()).toBe(inTunnel("visits = visits + 10"));
    expect(h.variable("visits")).toBe("6");
  });
});

describe("a step stops on each kind of media beat inside the frame it leaves", () => {
  const MEDIA = (beat: string) =>
    [
      "define sky as image with",
      '  src = "https://example.com/sky.png"',
      "end",
      "",
      "define theme as audio with",
      '  src = "https://example.com/theme.wav"',
      "end",
      "",
      "store visits = 0",
      "",
      "scene start",
      "  Before.",
      "  -> visit ->",
      "  visits = visits + 10",
      "  After.",
      "end",
      "",
      "scene visit",
      "  visits = visits + 1",
      "  Passed text.",
      `  ${beat}`,
      "  Later text.",
      "  ->->",
      "end",
      "",
      "scene other",
      "  Loaded.",
      "end",
      "",
    ].join("\n");

  test.each([
    ["an image", "[[show backdrop sky]]"],
    ["an audio", "((play music theme))"],
    ["a load", "-> load other"],
  ])("Step Out stops on %s beat inside the tunnel", (_, beat) => {
    const source = MEDIA(beat);
    const h = play("visits = visits + 1", source);
    h.game.step("out");
    const shown = (h.game as any)._shownBeatOnScreen;
    const carriesMedia =
      (shown?.load?.length ?? 0) > 0 ||
      Object.values(shown?.image ?? {}).some((e: any) => e.length > 0) ||
      Object.entries(shown?.audio ?? {}).some(
        ([target, e]: [string, any]) => target !== "typewriter" && e.length > 0,
      );
    expect(carriesMedia).toBe(true);
    expect(h.frames()[0]).toMatch(/^visit@/);
    expect(h.stoppedAt()).toBeGreaterThanOrEqual(lineIn(source, beat));
    expect(h.stoppedAt()).toBeLessThan(lineIn(source, "->->"));
    expect(h.game.paused).toBe(true);
  });
});
