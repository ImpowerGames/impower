import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Coordinator } from "../../game/core/classes/Coordinator";
import { Game } from "../../game/core/classes/Game";
import { compileProgram } from "../harness/compileProgram";
import { compileUI } from "../ui/harness/uiTestHarness";

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

describe("a debugger stop leaves a beat the settled drawing cannot finish to run as it plays", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const CUTSCENE_ASSETS = [
    {
      uri: "inmemory:///intro.webm",
      type: "video",
      name: "intro",
      ext: "webm",
      src: "/intro.webm",
    },
  ];

  const make = (
    source: string,
    assets?: typeof CUTSCENE_ASSETS,
  ): Game => {
    const compiled = assets
      ? compileUI(source, { assets: assets as never }).program
      : compileProgram(source);
    expect(compiled.chunks).toBeDefined();
    return new Game({
      program: compiled,
      now: () => 0,
      setTimeout: () => 0,
      log: () => {},
    } as never);
  };

  const shown = (game: Game) => (game as any)._shownBeatOnScreen;

  const stepUntil = (game: Game, reached: () => boolean) => {
    for (let i = 0; i < 80 && !reached() && !game.ending; i += 1) {
      game.step("over");
    }
    expect(reached()).toBe(true);
  };

  it("runs a load a Step reaches, once", () => {
    const game = make(
      "scene start\n  Before.\n  -> load other\nend\nscene other\n  After.\nend\n",
    );
    const settling = vi.spyOn(Coordinator.prototype, "onSettle");
    const load = vi
      .spyOn(game.module.assets, "runLoad")
      .mockReturnValue(null as never);
    game.start();
    game.pause();
    stepUntil(game, () => Boolean(shown(game)?.load));
    expect(settling).not.toHaveBeenCalled();
    game.resume();
    expect(load).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledWith([{ name: "other" }]);
  });

  it("holds a cutscene a Step reaches in its playing drawing, and Resume plays it rather than passing it", () => {
    const game = make(
      "scene start\n  Before.\n  [[play intro]]\n  After.\nend\n",
      CUTSCENE_ASSETS,
    );
    const settling = vi.spyOn(Coordinator.prototype, "onSettle");
    const playing = vi.spyOn(Coordinator.prototype, "onExecute");
    vi.spyOn(game.module.ui, "runCutscene").mockReturnValue(0);
    game.start();
    game.pause();
    stepUntil(game, () => Boolean(shown(game)?.cutscene));
    const coordinator = (game as any)._coordinator;
    expect(coordinator._instructions.cutscene).toEqual([{ name: "intro" }]);
    expect(playing.mock.contexts).toContain(coordinator);
    expect(settling).not.toHaveBeenCalled();
    expect(game.paused).toBe(true);
    const beats = (game as any)._run.beats.length;
    expect(game.resume()).toBe(false);
    expect(game.paused).toBe(false);
    expect((game as any)._coordinator).toBe(coordinator);
    expect((game as any)._run.beats.length).toBe(beats);
  });

  it("schedules the music a Step reaches", () => {
    const game = make(
      [
        "define theme as audio with",
        '  src = "https://example.com/theme.wav"',
        "end",
        "",
        "scene start",
        "  Before.",
        "  ((play music theme))",
        "  With music.",
        "end",
        "",
      ].join("\n"),
    );
    const settling = vi.spyOn(Coordinator.prototype, "onSettle");
    const schedule = vi.spyOn(game.module.audio, "schedule");
    game.start();
    game.pause();
    stepUntil(game, () => Boolean(shown(game)?.audio?.music?.length));
    expect(settling).not.toHaveBeenCalled();
    expect(schedule).toHaveBeenCalledWith("music", expect.anything());
  });

  it("keeps a held roll on the beat it restored when a beat is still queued there", async () => {
    const game = make(
      "scene start\n  Before. [[play intro]] After.\n  Last.\nend\n",
      CUTSCENE_ASSETS,
    );
    vi.spyOn(game.module.ui, "runCutscene").mockReturnValue(0);
    game.start();
    const first = shown(game);
    expect(game.module.interpreter.hasQueuedBeats).toBe(true);
    game.clickedToContinue();
    game.clickedToContinue();
    await game.rollBack("beat");
    await game.rollBack("beat");
    expect(shown(game)).toEqual(first);
    const count = (game as any)._run.beats.length;
    game.pause();
    expect(shown(game)).toEqual(first);
    expect((game as any)._run.beats.length).toBe(count);
    expect(game.history.behindLatest).toBe(true);
  });
});

describe("a beat a Step presents joins the page as a new beat", () => {
  const TEXTSTREAM = [
    "define ui as config with",
    '  layouts_initial = { "textstream" }',
    "end",
    "scene start",
    "  First beat.",
    "  Second beat.",
    "  Third beat.",
    "end",
    "",
  ].join("\n");

  const paragraphs = (game: Game) =>
    game.module.ui.page.entries
      .filter((entry) => entry.text)
      .map((entry) => entry.text!.map((event) => event.text).join(""));

  it("keeps the earlier paragraph in a textstream, through the stop and Resume", () => {
    const { program: compiled } = compileUI(TEXTSTREAM);
    const game = new Game({
      program: compiled,
      now: () => 0,
      setTimeout: () => 0,
      log: () => {},
    } as never);
    game.start();
    expect(paragraphs(game)).toEqual(["First beat."]);
    game.pause();
    for (let i = 0; i < 30 && (game as any)._run.beats.length < 2; i += 1) {
      game.step("over");
    }
    expect(game.paused).toBe(true);
    expect(paragraphs(game)).toEqual(["First beat.", "Second beat."]);
    expect(game.resume()).toBe(false);
    expect(paragraphs(game)).toEqual(["First beat.", "Second beat."]);
    game.clickedToContinue();
    expect(paragraphs(game)).toEqual([
      "First beat.",
      "Second beat.",
      "Third beat.",
    ]);
  });
});
