import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Coordinator } from "../../game/core/classes/Coordinator";
import { Game } from "../../game/core/classes/Game";
import { compileProgram } from "../harness/compileProgram";

const MAIN = "inmemory:///main.sd";

const SCRIPT = [
  "store mood = 0",
  "",
  "scene start",
  "  HERO:",
  "    The first line.",
  "  mood = mood + 1",
  "  -> aside ->",
  "  HERO:",
  "    Back in the main line.",
  "end",
  "",
  "scene aside",
  "  local here = 5",
  "",
  "  HERO:",
  "    Inside the tunnel, mood is {mood}.",
  "  ->->",
  "end",
  "",
].join("\n");

const FIRST = "The first line.";
const TUNNEL = "Inside the tunnel, mood is 1.";
const BACK = "Back in the main line.";

const lineOf = (text: string) =>
  SCRIPT.split("\n").findIndex((line) => line.trim() === text);

const TUNNEL_LINE = lineOf("Inside the tunnel, mood is {mood}.");

let program: ReturnType<typeof compileProgram>;

const play = () => {
  const game = new Game({
    program,
    now: () => 0,
    setTimeout: (handler: Function) => {
      handler();
      return 0;
    },
  } as never);
  const methods: string[] = [];
  let stop: number | undefined;
  game.connection.outgoing.addListener("*", (message) => {
    const { method, params } = message as unknown as {
      method: string;
      params: any;
    };
    methods.push(method);
    if (method === "game/hitBreakpoint" || method === "game/stepped") {
      stop = params?.location?.range?.start?.line;
    }
  });
  const internal = game as any;
  const settling = vi.spyOn(Coordinator.prototype, "onSettle");
  const typing = vi.spyOn(Coordinator.prototype, "onExecute");
  const onScreen = () => {
    const coordinator = internal._coordinator;
    const text = Object.values(internal._shownBeatOnScreen?.text ?? {})
      .flat()
      .map((t: any) => t.text)
      .filter((t: string) => t !== "HERO")
      .join("")
      .trim();
    return {
      text,
      settled: settling.mock.contexts.includes(coordinator),
      typed: typing.mock.contexts.includes(coordinator),
    };
  };
  const beats = () => internal._run.beats.length as number;
  return { game, methods, onScreen, beats, stoppedAt: () => stop };
};

const settledOn = (text: string) => ({ text, settled: true, typed: false });

describe("a debugger stop presents the beat it reaches", () => {
  beforeAll(() => {
    program = compileProgram(SCRIPT);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("presents each beat a Step Over reaches, drawn settled while paused", () => {
    const h = play();
    h.game.start();
    h.game.pause();
    const stops: { line?: number; text: string; settled: boolean }[] = [];
    for (let i = 0; i < 5; i += 1) {
      h.game.step("over");
      const { text, settled } = h.onScreen();
      stops.push({ line: h.stoppedAt(), text, settled });
    }
    expect(stops).toEqual([
      { line: lineOf("mood = mood + 1"), text: FIRST, settled: false },
      { line: TUNNEL_LINE, text: TUNNEL, settled: true },
      { line: lineOf("->->"), text: TUNNEL, settled: true },
      { line: lineOf(BACK), text: TUNNEL, settled: true },
      { line: lineOf(BACK), text: BACK, settled: true },
    ]);
    expect(h.game.paused).toBe(true);
  });

  it("presents the beat a Step In reaches", () => {
    const h = play();
    h.game.setBreakpoints([{ file: MAIN, line: lineOf("-> aside ->") }]);
    h.game.start();
    h.game.clickedToContinue();
    h.game.step("in");
    expect(h.stoppedAt()).toBe(lineOf("local here = 5"));
    h.game.step("in");
    h.game.step("in");
    expect(h.stoppedAt()).toBe(TUNNEL_LINE);
    expect(h.onScreen()).toEqual(settledOn(TUNNEL));
    expect(h.game.paused).toBe(true);
  });

  it("presents the beat a Step Out reaches", () => {
    const h = play();
    h.game.setBreakpoints([{ file: MAIN, line: lineOf("local here = 5") }]);
    h.game.start();
    h.game.clickedToContinue();
    h.game.step("out");
    expect(h.stoppedAt()).toBe(TUNNEL_LINE);
    expect(h.onScreen()).toEqual(settledOn(TUNNEL));
    expect(h.game.paused).toBe(true);
  });

  it("resumes on a beat a Step presented without showing it again or skipping it", () => {
    const h = play();
    h.game.start();
    h.game.pause();
    h.game.step("over");
    h.game.step("over");
    expect(h.onScreen()).toEqual(settledOn(TUNNEL));
    const presented = h.beats();
    h.methods.length = 0;
    expect(h.game.resume()).toBe(false);
    expect(h.game.paused).toBe(false);
    expect(h.beats()).toBe(presented);
    expect(h.onScreen()).toEqual(settledOn(TUNNEL));
    expect(h.methods).not.toContain("game/awaitingInteraction");
    h.game.clickedToContinue();
    expect(h.onScreen().text).toBe(BACK);
    expect(h.beats()).toBe(presented + 1);
  });

  it("moves on with a Step from a beat a Step presented", () => {
    const h = play();
    h.game.start();
    h.game.pause();
    h.game.step("over");
    h.game.step("over");
    const presented = h.beats();
    h.game.step("over");
    expect(h.stoppedAt()).toBe(lineOf("->->"));
    expect(h.beats()).toBe(presented);
  });

  it("keeps the beat on screen through a Pause and Resume, then advances on a click", () => {
    const h = play();
    h.game.start();
    const shown = h.beats();
    h.game.pause();
    expect(h.beats()).toBe(shown);
    expect(h.game.resume()).toBe(false);
    expect(h.beats()).toBe(shown);
    expect(h.onScreen().text).toBe(FIRST);
    h.game.clickedToContinue();
    expect(h.onScreen().text).toBe(TUNNEL);
    expect(h.beats()).toBe(shown + 1);
  });

  it("changes nothing at a stop on a line with no beat", () => {
    const h = play();
    h.game.setBreakpoints([{ file: MAIN, line: lineOf("mood = mood + 1") }]);
    h.game.start();
    const before = h.beats();
    h.game.clickedToContinue();
    expect(h.stoppedAt()).toBe(lineOf("mood = mood + 1"));
    expect(h.onScreen().text).toBe(FIRST);
    expect(h.beats()).toBe(before);
    expect(h.game.paused).toBe(false);
    expect(h.game.awaitingResume).toBe(true);
  });

  it("open question for the maintainer: a breakpoint on a dialogue line still stops before the line runs, with the previous beat on screen", () => {
    const h = play();
    h.game.setBreakpoints([{ file: MAIN, line: TUNNEL_LINE }]);
    h.game.start();
    const before = h.beats();
    h.game.clickedToContinue();
    expect(h.stoppedAt()).toBe(TUNNEL_LINE);
    expect(h.onScreen().text).toBe(FIRST);
    expect(h.beats()).toBe(before);
    expect(h.game.paused).toBe(false);
    expect(h.game.awaitingResume).toBe(true);
    h.game.resume();
    expect(h.onScreen()).toEqual({ text: TUNNEL, settled: false, typed: true });
    expect(h.beats()).toBe(before + 1);
  });
});
