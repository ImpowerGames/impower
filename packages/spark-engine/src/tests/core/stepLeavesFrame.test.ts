import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Game } from "../../game/core/classes/Game";

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

const lineOf = (text: string) =>
  FIXTURE.split("\n").findIndex((line) => line.trim() === text);

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

function play(breakpoint: string) {
  const game = new Game({
    now: () => 0,
    setTimeout: (() => 0) as never,
    resolve: (path: string) => path,
    fetch: async () => "",
    log: () => {},
    program: compile(FIXTURE),
  } as never);
  const stops: number[] = [];
  game.connection.outgoing.addListener("*", (message) => {
    const { method, params } = message as unknown as {
      method: string;
      params: any;
    };
    if (method === "game/hitBreakpoint" || method === "game/stepped") {
      stops.push(params?.location?.range?.start?.line);
    }
  });
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
  return { game, stops, stoppedAt, onScreen, shownBeats, variable };
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

describe("Step Over passes the frames it calls whatever beats they hold", () => {
  test("Step Over on a tunnel call stops at the caller's next statement", () => {
    const h = play("-> visit ->");
    h.game.step("over");
    expect(h.stoppedAt()).toBe(lineOf("visits = add(visits, 10)"));
    expect(h.variable("visits")).toBe("202");
    expect(h.onScreen()).toBe("Still in the tunnel.");
  });

  test("Step Over on a nested tunnel call stops at the outer tunnel's next statement", () => {
    const h = play("-> inner ->");
    h.game.step("over");
    expect(h.stoppedAt()).toBe(lineOf("Still in the tunnel."));
    expect(h.onScreen()).toBe("Deep inside.");
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
