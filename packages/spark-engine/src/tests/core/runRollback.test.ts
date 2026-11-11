import { describe, expect, test, vi } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Game } from "../../game/core/classes/Game";
import { HISTORY_REASONS } from "../../game/core/constants/HISTORY_REASONS";
import type { GameHistory } from "../../game/core/types/RunHistory";
import { CreateGameMessage } from "../../game/core/classes/messages/CreateGameMessage";
import { RollBackGameMessage } from "../../game/core/classes/messages/RollBackGameMessage";
import { RollForwardGameMessage } from "../../game/core/classes/messages/RollForwardGameMessage";
import { StepGameMessage } from "../../game/core/classes/messages/StepGameMessage";
import { installGameWorker } from "../../worker/installGameWorker";
import { createHarness, flushMicrotasks } from "../ui/harness/uiTestHarness";

const MAIN = "file:///local/main.sd";

const FIXTURE = [
  "define theme as audio with",
  '  src = "https://example.com/theme.wav"',
  "end",
  "",
  "define rain as audio with",
  '  src = "https://example.com/rain.wav"',
  "end",
  "",
  'store mood = "calm"',
  "store visits = 0",
  "",
  "scene start",
  "  ((play music theme))",
  "  The first beat.",
  '  mood = "tense"',
  "  The second beat.",
  "  -> visit ->",
  "  visits = add(visits, 10)",
  "  ((play ambient rain))",
  "  The third beat.",
  "  choose",
  "    * [Stay.]",
  "      Stayed.",
  "    * [Leave.]",
  "      Left.",
  "  end",
  "  The end.",
  "end",
  "",
  "scene visit",
  "  visits = visits + 1",
  "  visits = visits * 2",
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

interface Recorded {
  method: string;
  params: any;
}

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

function play(source = FIXTURE) {
  const game = new Game({
    now: () => 0,
    setTimeout: (() => 0) as never,
    resolve: (path: string) => path,
    fetch: async () => "",
    log: () => {},
    program: compile(source),
  } as never);
  const emitted: Recorded[] = [];
  game.connection.outgoing.addListener("*", (message) => {
    emitted.push(message as unknown as Recorded);
  });
  const of = (method: string) => emitted.filter((m) => m.method === method);
  const text = () => (game.story.currentText ?? "").trim();
  const stoppedAt = () =>
    emitted
      .filter(
        (m) => m.method === "game/hitBreakpoint" || m.method === "game/stepped",
      )
      .at(-1)?.params?.location?.range?.start?.line as number | undefined;
  const variable = (name: string) =>
    game.getVarVariables().find((v) => v.name === name)?.value;
  const looping = (channel: string): string[] =>
    (game.module.audio.state.channels?.[channel]?.looping ?? []).map(
      (state) => state.key ?? "",
    );
  const continueToBreakpoint = () => {
    const hits = of("game/hitBreakpoint").length;
    for (let i = 0; i < 8 && of("game/hitBreakpoint").length === hits; i += 1) {
      game.continue();
    }
  };
  const tap = () => game.clickedToContinue();
  const loadAudioAtOnce = () => {
    (game.module.audio as any).loadAllAudio = async () => {};
  };
  const hear = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    (game as any)._coordinator?.onUpdate({ deltaMS: 1000 });
  };
  return {
    game,
    emitted,
    of,
    text,
    stoppedAt,
    variable,
    looping,
    continueToBreakpoint,
    tap,
    loadAudioAtOnce,
    hear,
  };
}

const playTo = (h: ReturnType<typeof play>, shown: string) => {
  h.game.start();
  for (let i = 0; i < 8 && h.text() !== shown; i += 1) {
    h.tap();
  }
  expect(h.text()).toBe(shown);
};

const history = (h: ReturnType<typeof play>): GameHistory => h.game.history;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("stepping stays at each statement", () => {
  test("Step Into on a line that calls a tunnel stops at the tunnel's first statement", () => {
    const h = play();
    h.game.setBreakpoints([{ file: MAIN, line: lineOf("-> visit ->") }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(lineOf("-> visit ->"));
    h.game.step("in");
    expect(h.stoppedAt()).toBe(lineOf("visits = visits + 1"));
  });

  test("Step Out from inside a tunnel stops at the caller's next statement", () => {
    const h = play();
    h.game.setBreakpoints([{ file: MAIN, line: lineOf("visits = visits + 1") }]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(lineOf("visits = visits + 1"));
    h.game.step("out");
    expect(h.stoppedAt()).toBe(lineOf("visits = add(visits, 10)"));
  });

  test("Step Over on a tunnel call stops at the caller's next statement", () => {
    const h = play();
    h.game.setBreakpoints([{ file: MAIN, line: lineOf("-> visit ->") }]);
    h.game.start();
    h.continueToBreakpoint();
    h.game.step("over");
    expect(h.stoppedAt()).toBe(lineOf("visits = add(visits, 10)"));
    expect(h.variable("visits")).toBe("2");
  });

  test("Step Into a Luau function stops in it, and Step Out returns to its caller", () => {
    const h = play();
    h.game.setBreakpoints([
      { file: MAIN, line: lineOf("visits = add(visits, 10)") },
    ]);
    h.game.start();
    h.continueToBreakpoint();
    h.game.step("in");
    expect(h.stoppedAt()).toBe(lineOf("function add(a, b)"));
    expect(h.game.history.canStepOut).toBe(true);
    h.game.step("out");
    expect(h.stoppedAt()).toBe(lineOf("visits = add(visits, 10)"));
  });

  test("Step Out is refused at the top level, with its reason, and allowed inside a tunnel", () => {
    const h = play();
    h.game.setBreakpoints([
      { file: MAIN, line: lineOf('mood = "tense"') },
      { file: MAIN, line: lineOf("-> visit ->") },
    ]);
    h.game.start();
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(lineOf('mood = "tense"'));
    expect(history(h)).toMatchObject({
      canStepOut: false,
      stepOutRefusal: HISTORY_REASONS.stepOut,
    });
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(lineOf("-> visit ->"));
    expect(history(h)).toMatchObject({
      canStepOut: false,
      stepOutRefusal: HISTORY_REASONS.stepOut,
    });
    h.game.step("in");
    expect(history(h)).toMatchObject({ canStepOut: true, stepOutRefusal: null });
    expect(h.of("game/stepped").at(-1)?.params.history.canStepOut).toBe(true);
  });
});

describe("rolling back to a breakpoint", () => {
  test("rolls back to the most recent earlier beat a breakpoint held, else to the run's first beat", async () => {
    const h = play();
    h.game.setBreakpoints([{ file: MAIN, line: lineOf("visits = add(visits, 10)") }]);
    playTo(h, "The second beat.");
    h.continueToBreakpoint();
    expect(h.stoppedAt()).toBe(lineOf("visits = add(visits, 10)"));
    h.game.continue();
    expect(h.text()).toBe("The third beat.");
    h.tap();
    h.game.chosePathToContinue(0);
    h.tap();
    expect(h.text()).toBe("The end.");
    const held = await h.game.rollBack("breakpoint");
    expect(held.moved && held.restored.beat).toBe(1);
    expect(h.text()).toBe("The second beat.");
    const first = await h.game.rollBack("breakpoint");
    expect(first.moved && first.restored.beat).toBe(0);
    expect(h.text()).toBe("The first beat.");
  });
});

describe("rolling a run back and forward", () => {
  test("Roll back after two beats restores the earlier beat, with the variable set between them as it was", async () => {
    const h = play();
    playTo(h, "The second beat.");
    expect(h.variable("mood")).toBe('"tense"');
    const back = await h.game.rollBack("beat");
    expect(back.moved).toBe(true);
    expect(h.text()).toBe("The first beat.");
    expect(h.variable("mood")).toBe('"calm"');
    expect(history(h)).toMatchObject({
      canRollBack: false,
      canRollForward: true,
      behindLatest: true,
      rollBackRefusal: HISTORY_REASONS.rollBack,
      rollForwardRefusal: null,
      stepRefusal: HISTORY_REASONS.step,
    });
    const forward = await h.game.rollForward("beat");
    expect(forward.moved).toBe(true);
    expect(h.text()).toBe("The second beat.");
    expect(h.variable("mood")).toBe('"tense"');
    expect(history(h)).toMatchObject({
      canRollBack: true,
      canRollForward: false,
      behindLatest: false,
      rollForwardRefusal: HISTORY_REASONS.rollForward,
      stepRefusal: null,
    });
  });

  test("Roll back at the run's first beat and roll forward at its latest move nothing, with their reasons", async () => {
    const h = play();
    playTo(h, "The first beat.");
    expect(await h.game.rollBack("beat")).toMatchObject({
      moved: false,
      reason: "Nothing to go back to.",
    });
    expect(await h.game.rollForward("choice")).toMatchObject({
      moved: false,
      reason: "No later played beat. Continue the story to play more.",
    });
    expect(h.text()).toBe("The first beat.");
  });

  test("a tap behind the latest beat rolls forward one beat rather than playing on", async () => {
    const h = play();
    playTo(h, "The third beat.");
    await h.game.rollBack("beat");
    await h.game.rollBack("beat");
    expect(h.text()).toBe("The first beat.");
    h.tap();
    await settle();
    expect(h.text()).toBe("The second beat.");
    expect(h.of("game/rolled").at(-1)?.params.history.behindLatest).toBe(true);
    h.tap();
    await settle();
    expect(h.text()).toBe("The third beat.");
    expect(history(h).behindLatest).toBe(false);
    h.tap();
    expect(h.game.story.currentChoices.map((c) => c.text)).toEqual([
      "Stay.",
      "Leave.",
    ]);
    expect(history(h)).toMatchObject({
      behindLatest: false,
      canRollBack: true,
    });
  });

  test("Step Over, Step Into and Step Out are refused behind the latest beat", async () => {
    const h = play();
    playTo(h, "The second beat.");
    await h.game.rollBack("beat");
    const stepped = h.of("game/stepped").length;
    for (const traversal of ["over", "in", "out"] as const) {
      expect(h.game.step(traversal)).toBe(false);
    }
    expect(h.of("game/stepped")).toHaveLength(stepped);
    expect(h.text()).toBe("The first beat.");
    expect(h.variable("mood")).toBe('"calm"');
  });

  test("Roll back to a choice reaches the choice beat; the recorded option rolls forward and the other forks", async () => {
    const h = play();
    playTo(h, "The third beat.");
    h.tap();
    expect(h.game.story.currentChoices.map((c) => c.text)).toEqual([
      "Stay.",
      "Leave.",
    ]);
    h.game.chosePathToContinue(0);
    expect(h.text()).toBe("Stayed.");
    h.tap();
    expect(h.text()).toBe("The end.");

    const back = await h.game.rollBack("choice");
    expect(back).toMatchObject({
      moved: true,
      restored: { choices: ["Stay.", "Leave."], chosen: 0 },
    });
    h.game.chosePathToContinue(0);
    await settle();
    expect(h.text()).toBe("Stayed.");
    expect(history(h)).toMatchObject({ behindLatest: true });

    await h.game.rollBack("choice");
    h.game.chosePathToContinue(1);
    expect(h.text()).toBe("Left.");
    expect(history(h)).toMatchObject({
      behindLatest: false,
      canRollForward: false,
    });
    h.tap();
    expect(h.text()).toBe("The end.");
    await h.game.rollBack("beat");
    expect(h.text()).toBe("Left.");
    await h.game.rollBack("beat");
    expect(h.game.story.currentChoices.map((c) => c.text)).toEqual([
      "Stay.",
      "Leave.",
    ]);
    expect((await h.game.rollForward("beat")).moved).toBe(true);
    expect(h.text()).toBe("Left.");
  });

  test("Roll back to a choice with no earlier choice beat goes to the run's first beat", async () => {
    const h = play();
    playTo(h, "The third beat.");
    await h.game.rollBack("choice");
    expect(h.text()).toBe("The first beat.");
    await h.game.rollForward("choice");
    expect(h.text()).toBe("The third beat.");
  });

  test("a restored beat is reported settled, and the roll is announced", async () => {
    const h = play();
    playTo(h, "The second beat.");
    const back = await h.game.rollBack("beat");
    expect(back.moved).toBe(true);
    if (!back.moved) {
      return;
    }
    expect(back.restored).toMatchObject({
      beat: 0,
      choices: [],
      chosen: null,
      textRevealed: true,
      transitionsEnded: true,
      oneShotsSilent: true,
      timersRestarted: true,
    });
    expect(back.restored.location?.range.start.line).toBe(
      lineOf("The first beat."),
    );
    const rolled = h.of("game/rolled").at(-1)?.params;
    expect(rolled).toEqual({
      restored: back.restored,
      history: back.history,
      executed: expect.objectContaining({ history: back.history }),
    });
    expect(rolled.executed.lastLocation?.range.end.line).toBe(
      lineOf("The first beat."),
    );
  });

  test("the published game state carries the history", async () => {
    const h = play();
    playTo(h, "The second beat.");
    const executed = h.of("game/executed").at(-1)?.params;
    expect(executed.history).toEqual({
      canRollBack: true,
      canRollForward: false,
      behindLatest: false,
      canStepOut: false,
      rollBackRefusal: null,
      rollForwardRefusal: HISTORY_REASONS.rollForward,
      stepRefusal: null,
      stepOutRefusal: HISTORY_REASONS.stepOut,
      heldChoices: [],
    });
  });
});

describe("the audio of a restored beat", () => {
  test("a looping track started after the restored beat is absent and one started before it is present", async () => {
    const h = play();
    h.loadAudioAtOnce();
    h.game.start();
    await h.hear();
    h.tap();
    await h.hear();
    h.tap();
    await h.hear();
    expect(h.text()).toBe("The third beat.");
    expect(h.looping("music")).toEqual(["audio.theme"]);
    expect(h.looping("ambient")).toEqual(["audio.rain"]);
    const back = await h.game.rollBack("beat");
    expect(h.text()).toBe("The second beat.");
    expect(h.looping("music")).toEqual(["audio.theme"]);
    expect(h.looping("ambient")).toEqual([]);
    expect(back.moved && back.restored.loops).toEqual([
      { channel: "music", key: "audio.theme", play: "continue" },
    ]);
    expect(back.moved && back.restored.stoppedLoops).toEqual([
      { channel: "ambient", key: "audio.rain" },
    ]);
    const forward = await h.game.rollForward("beat");
    expect(h.looping("ambient")).toEqual(["audio.rain"]);
    expect(forward.moved && forward.restored.loops).toEqual([
      { channel: "music", key: "audio.theme", play: "continue" },
      { channel: "ambient", key: "audio.rain", play: "start" },
    ]);
  });
});

describe("a run that ended", () => {
  test("rolls back to its latest beat, and plays on to the ending again", async () => {
    const h = play();
    playTo(h, "The third beat.");
    h.tap();
    h.game.chosePathToContinue(1);
    h.tap();
    expect(h.text()).toBe("The end.");
    h.tap();
    expect(h.game.ending?.kind).toBeDefined();
    expect((await h.game.rollBack("beat")).moved).toBe(true);
    expect(h.game.ending).toBeNull();
    expect(h.text()).toBe("Left.");
    expect((await h.game.rollForward("beat")).moved).toBe(true);
    expect(h.text()).toBe("The end.");
    expect(history(h).behindLatest).toBe(false);
    h.tap();
    expect(h.game.ending?.kind).toBeDefined();
  });
});

describe("resuming behind the latest beat", () => {
  test("plays on live from the restored beat and drops the later record", async () => {
    const h = play();
    playTo(h, "The third beat.");
    await h.game.rollBack("beat");
    await h.game.rollBack("beat");
    expect(h.text()).toBe("The first beat.");
    h.game.continue();
    expect(h.text()).toBe("The second beat.");
    expect(history(h)).toMatchObject({
      behindLatest: false,
      canRollForward: false,
    });
    expect(h.variable("mood")).toBe('"tense"');
  });
});

describe("the worker game", () => {
  const workerGame = async () => {
    const listeners: ((e: MessageEvent) => void)[] = [];
    const answers: unknown[] = [];
    const state = installGameWorker({
      addEventListener: (_: string, listener: (e: MessageEvent) => void) => {
        listeners.push(listener);
      },
      sendResponse: async (_message: unknown, result: unknown) => {
        try {
          answers.push(
            typeof result === "function" ? await result() : result,
          );
        } catch (error) {
          answers.push({ error });
        }
      },
      sendNotification() {},
      postMessage() {},
    } as any);
    const ask = async (message: unknown) => {
      const asked = answers.length;
      for (const listener of listeners) {
        listener({ data: message } as MessageEvent);
      }
      for (let i = 0; i < 50 && answers.length === asked; i += 1) {
        await settle();
      }
      return answers.at(-1) as any;
    };
    await ask(CreateGameMessage.type.request({ program: compile(FIXTURE) }));
    const game = state.game!;
    game.start();
    game.clickedToContinue();
    expect((game.story.currentText ?? "").trim()).toBe("The second beat.");
    return { game, ask };
  };

  test("answers game/rollBack and game/rollForward, and refuses a step behind the latest beat with its reason", async () => {
    vi.stubGlobal("self", { setTimeout: () => 0, clearTimeout: () => {} });
    try {
      const { ask } = await workerGame();
      const back = await ask(RollBackGameMessage.type.request({ to: "beat" }));
      expect(back).toMatchObject({
        moved: true,
        restored: { beat: 0 },
        history: { behindLatest: true },
      });
      const step = await ask(StepGameMessage.type.request({ traversal: "over" }));
      expect(step.error.message).toBe(
        "Make the choice, or skip to the latest beat, to step on.",
      );
      const forward = await ask(
        RollForwardGameMessage.type.request({ to: "beat" }),
      );
      expect(forward).toMatchObject({
        moved: true,
        restored: { beat: 1 },
        history: { behindLatest: false },
      });
      expect(
        await ask(RollForwardGameMessage.type.request({ to: "choice" })),
      ).toMatchObject({
        moved: false,
        reason: "No later played beat. Continue the story to play more.",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("keeps a held run held through a roll asked to hold it, and leaves a playing run playing", async () => {
    vi.stubGlobal("self", { setTimeout: () => 0, clearTimeout: () => {} });
    try {
      const held = await workerGame();
      held.game.pause();
      expect(
        await held.ask(RollBackGameMessage.type.request({ to: "beat", hold: true })),
      ).toMatchObject({ moved: true, held: true });
      expect(held.game.paused).toBe(true);

      const playing = await workerGame();
      expect(
        await playing.ask(
          RollBackGameMessage.type.request({ to: "beat", hold: true }),
        ),
      ).toMatchObject({ moved: true, held: false });
      expect(playing.game.paused).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("a roll superseded while it draws", () => {
  test("publishes nothing and leaves the newer roll's beat on screen", async () => {
    const h = play();
    playTo(h, "The third beat.");
    const ui = h.game.module.ui;
    const restore = ui.onRestore.bind(ui);
    const releases: (() => void)[] = [];
    ui.onRestore = async () => {
      await new Promise<void>((resolve) => releases.push(resolve));
      await restore();
    };
    const first = h.game.rollBack("beat");
    const second = h.game.rollBack("beat");
    releases[1]!();
    const newer = await second;
    releases[0]!();
    const older = await first;
    expect(newer).toMatchObject({ moved: true, restored: { beat: 0 } });
    expect(older).toMatchObject({ moved: false, superseded: true });
    const rolled = h.of("game/rolled").map((m) => m.params.restored.beat);
    expect(rolled).toEqual([0]);
    expect(h.text()).toBe("The first beat.");
    expect(history(h).canRollBack).toBe(false);
  });

  test("settles as superseded when its game is destroyed before the drawing ends", async () => {
    const h = play();
    playTo(h, "The third beat.");
    const ui = h.game.module.ui;
    ui.onRestore = () => new Promise<void>(() => {});
    const rolling = h.game.rollBack("beat");
    await settle();
    h.game.destroy();
    expect(await rolling).toMatchObject({ moved: false, superseded: true });
    expect(h.of("game/rolled")).toEqual([]);
  });
});

const MUSIC = [
  "define theme as audio with",
  '  src = "https://example.com/theme.wav"',
  "end",
  "",
  "scene start",
  "  ((play music theme))",
  "  First.",
  "  Second.",
  "  ((stop music))",
  "  Third.",
  "end",
].join("\n");

const musicUpdates = (emitted: Recorded[], from: number) =>
  emitted
    .slice(from)
    .filter((m) => m.method === "audio/update" && m.params?.channel === "music")
    .flatMap((m) => m.params.updates ?? []);

describe("the loops of a restored beat, as the player hears them", () => {
  test("a loop faded since the restored beat returns to its default level", async () => {
    const h = play(MUSIC);
    h.loadAudioAtOnce();
    h.game.start();
    await h.hear();
    expect(h.text()).toBe("First.");
    h.game.module.audio.fadeChannel("music", 0.2);
    h.tap();
    await h.hear();
    expect(h.game.module.audio.state.channels?.["music"]?.looping?.[0]?.to).toBe(0.2);
    const from = h.emitted.length;
    const back = await h.game.rollBack("beat");
    expect(back.moved && back.restored.loops).toEqual([
      { channel: "music", key: "audio.theme", play: "continue" },
    ]);
    expect(musicUpdates(h.emitted, from)).toContainEqual(
      expect.objectContaining({ control: "fade", key: "audio.theme", to: 1 }),
    );
  });

  test("a second roll before a restored loop has loaded still starts it", async () => {
    const h = play(MUSIC);
    playTo(h, "Third.");
    expect(h.looping("music")).toEqual([]);
    const audio = h.game.module.audio as any;
    const releases: (() => void)[] = [];
    audio.loadAllAudio = async (data: unknown[]) => {
      if (data.length > 0) {
        await new Promise<void>((resolve) => releases.push(resolve));
      }
    };
    const from = h.emitted.length;
    const back = await h.game.rollBack("beat");
    expect(back.moved && back.restored.loops).toEqual([
      { channel: "music", key: "audio.theme", play: "start" },
    ]);
    const earlier = await h.game.rollBack("beat");
    expect(earlier.moved && earlier.restored.loops).toEqual([
      { channel: "music", key: "audio.theme", play: "start" },
    ]);
    for (const release of releases) {
      release();
    }
    await settle();
    const starts = musicUpdates(h.emitted, from).filter(
      (u) => u.control === "start" && u.key === "audio.theme",
    );
    expect(starts).toHaveLength(1);
  });
});

describe("the stage of a restored beat", () => {
  test("a persistent layer shown after the restored beat is cleared", async () => {
    const h = createHarness(
      [
        "define sky as image with",
        '  src = "https://example.com/sky.png"',
        "end",
        "scene start",
        "  Before the sky.",
        "  [[show backdrop sky]]",
        "  Under the sky.",
        "end",
      ].join("\n"),
    );
    await h.ready;
    h.jumpToFlow("start");
    h.game.start();
    await flushMicrotasks(30);
    (h.game as any)._coordinator?.onUpdate({ deltaMS: 1000 });
    await flushMicrotasks(30);
    expect(h.game.story.currentText?.trim()).toBe("Before the sky.");
    expect(h.game.module.ui.state.image?.["backdrop"]).toBeUndefined();
    h.game.clickedToContinue();
    await flushMicrotasks(30);
    (h.game as any)._coordinator?.onUpdate({ deltaMS: 1000 });
    await flushMicrotasks(30);
    expect(h.game.module.ui.state.image?.["backdrop"]?.[0]?.assets).toEqual([
      "sky",
    ]);
    h.reset();
    expect((await h.game.rollBack("beat")).moved).toBe(true);
    await flushMicrotasks(30);
    expect(h.game.module.ui.state.image?.["backdrop"]).toBeUndefined();
    const writes = h.messages.filter(
      (m) => m.method === "ui/write-image" && m.params.target === "backdrop",
    );
    expect(writes.map((m) => m.params.instructions)).toEqual([[]]);
  });
});

describe("the menu a roll leaves", () => {
  test("stops listening for its options' clicks", async () => {
    const h = createHarness(
      [
        "scene start",
        "  Before the menu.",
        "  choose",
        "    * [Stay.]",
        "      Stayed.",
        "    * [Leave.]",
        "      Left.",
        "  end",
        "end",
      ].join("\n"),
    );
    await h.ready;
    h.jumpToFlow("start");
    h.game.start();
    await flushMicrotasks(30);
    (h.game as any)._coordinator?.onUpdate({ deltaMS: 1000 });
    await flushMicrotasks(30);
    h.game.clickedToContinue();
    await flushMicrotasks(30);
    (h.game as any)._coordinator?.onUpdate({ deltaMS: 1000 });
    await flushMicrotasks(30);
    const clicks = () =>
      Object.keys((h.game.module.ui as any)._events?.click ?? {}).length;
    expect(h.game.story.currentChoices).toHaveLength(2);
    expect(clicks()).toBeGreaterThan(0);
    expect((await h.game.rollBack("beat")).moved).toBe(true);
    await flushMicrotasks(30);
    expect(h.game.story.currentText?.trim()).toBe("Before the menu.");
    expect(clicks()).toBe(0);
  });
});

describe("music still loading when its beat is left", () => {
  test("starts once a roll restores a beat that holds it", async () => {
    const h = createHarness(
      [
        "define theme as audio with",
        '  src = "https://example.com/theme.wav"',
        "end",
        "scene start",
        "  ((play music theme))",
        "  First.",
        "  Second.",
        "  Third.",
        "end",
      ].join("\n"),
    );
    await h.ready;
    h.jumpToFlow("start");
    const audio = h.game.module.audio as any;
    const releases: (() => void)[] = [];
    audio.loadAllAudio = async (data: unknown[]) => {
      if (data.length > 0) {
        await new Promise<void>((resolve) => releases.push(resolve));
      }
    };
    const musicStarts = (from: number) =>
      h.messages
        .slice(from)
        .filter((m) => m.method === "audio/update" && m.params.channel === "music")
        .flatMap((m) => m.params.updates)
        .filter((u: any) => u.control === "start" && u.key === "audio.theme");
    h.game.start();
    h.game.continue();
    h.game.continue();
    expect(h.game.story.currentText?.trim()).toBe("Third.");
    expect(releases.length).toBeGreaterThan(0);
    expect(musicStarts(0)).toEqual([]);
    const from = h.messages.length;
    const rolled = await h.game.rollBack("beat");
    expect(rolled.moved && rolled.restored.loops).toEqual([
      { channel: "music", key: "audio.theme", play: "start" },
    ]);
    for (const release of releases) {
      release();
    }
    await flushMicrotasks(40);
    (h.game as any)._coordinator?.onUpdate({ deltaMS: 1000 });
    await flushMicrotasks(40);
    expect(musicStarts(from)).toHaveLength(1);
  });
});

describe("a replacement track still loading when its beat is left", () => {
  for (const quiet of [true, false]) {
    test(`leaves the track the player still hears ${quiet ? "stopped on an earlier silent beat" : "playing on its own beat"}`, async () => {
      const h = createHarness(
        [
          "define theme as audio with",
          '  src = "https://example.com/theme.wav"',
          "end",
          "define other as audio with",
          '  src = "https://example.com/other.wav"',
          "end",
          "scene start",
          ...(quiet ? ["  Quiet."] : []),
          "  ((play music theme))",
          "  First.",
          "  ((play music other))",
          "  Second.",
          "  Third.",
          "end",
        ].join("\n"),
      );
      await h.ready;
      h.jumpToFlow("start");
      const releases: (() => void)[] = [];
      (h.game.module.audio as any).loadAllAudio = async (data: any[]) => {
        if (data.some((d) => d.key === "audio.other")) {
          await new Promise<void>((resolve) => releases.push(resolve));
        }
      };
      const updates = () =>
        h.messages
          .filter((m) => m.method === "audio/update" && m.params.channel === "music")
          .flatMap((m) => m.params.updates);
      h.game.start();
      if (quiet) {
        h.game.continue();
      }
      await flushMicrotasks(40);
      (h.game as any)._coordinator?.onUpdate({ deltaMS: 1000 });
      await flushMicrotasks(40);
      expect(
        updates().filter((u: any) => u.control === "start" && u.key === "audio.theme"),
      ).toHaveLength(1);
      h.game.continue();
      h.game.continue();
      expect(h.game.story.currentText?.trim()).toBe("Third.");
      expect(releases.length).toBeGreaterThan(0);
      expect(updates().filter((u: any) => u.control === "stop")).toEqual([]);
      const rolled = await h.game.rollBack("choice");
      await flushMicrotasks(40);
      releases.forEach((release) => release());
      await flushMicrotasks(40);
      expect(rolled.moved && rolled.restored.loops).toEqual(
        quiet ? [] : [{ channel: "music", key: "audio.theme", play: "continue" }],
      );
      if (quiet) {
        expect(
          updates().filter((u: any) => u.control === "stop" && u.key === "audio.theme"),
        ).toHaveLength(1);
      } else {
        expect(
          updates().filter((u: any) => u.control === "start" && u.key === "audio.theme"),
        ).toHaveLength(1);
      }
    });
  }
});

describe("a track a queue left to end", () => {
  test("loops again when a roll restores the beat it looped on", async () => {
    const h = createHarness(
      [
        "define theme as audio with",
        '  src = "https://example.com/theme.wav"',
        "end",
        "define other as audio with",
        '  src = "https://example.com/other.wav"',
        "end",
        "scene start",
        "  ((play music theme))",
        "  First.",
        "  ((queue music other))",
        "  Second.",
        "  Third.",
        "end",
      ].join("\n"),
    );
    await h.ready;
    h.jumpToFlow("start");
    const tick = async () => {
      await flushMicrotasks(40);
      (h.game as any)._coordinator?.onUpdate({ deltaMS: 1000 });
      await flushMicrotasks(40);
    };
    const updates = () =>
      h.messages
        .filter((m) => m.method === "audio/update" && m.params.channel === "music")
        .flatMap((m) => m.params.updates);
    h.game.start();
    await tick();
    expect(h.game.story.currentText?.trim()).toBe("First.");
    h.game.continue();
    await tick();
    expect(h.game.story.currentText?.trim()).toBe("Second.");
    expect(updates().some((u: any) => u.control === "await" && u.loop === false)).toBe(true);
    const from = updates().length;
    const rolled = await h.game.rollBack("beat");
    await tick();
    expect(h.game.story.currentText?.trim()).toBe("First.");
    expect(rolled.moved && rolled.restored.loops).toEqual([
      { channel: "music", key: "audio.theme", play: "continue" },
    ]);
    const after = updates().slice(from);
    expect(
      after.filter((u: any) => u.key === "audio.theme" && u.loop === true),
    ).toHaveLength(1);
    expect(
      after.filter((u: any) => u.control === "stop" && u.key === "audio.other"),
    ).toHaveLength(1);
  });
});

describe("a track played once after it looped", () => {
  test("loops again when a roll restores the beat it looped on", async () => {
    const h = createHarness(
      [
        "define theme as audio with",
        '  src = "https://example.com/theme.wav"',
        "end",
        "scene start",
        "  ((play ambient theme))",
        "  First.",
        "  ((play ambient theme once))",
        "  Second.",
        "  Third.",
        "end",
      ].join("\n"),
    );
    await h.ready;
    h.jumpToFlow("start");
    const tick = async () => {
      await flushMicrotasks(40);
      (h.game as any)._coordinator?.onUpdate({ deltaMS: 1000 });
      await flushMicrotasks(40);
    };
    const updates = () =>
      h.messages
        .filter((m) => m.method === "audio/update" && m.params.channel === "ambient")
        .flatMap((m) => m.params.updates);
    h.game.start();
    await tick();
    h.game.continue();
    await tick();
    expect(h.game.story.currentText?.trim()).toBe("Second.");
    expect(
      updates().filter((u: any) => u.control === "start" && u.key === "audio.theme").map((u: any) => u.loop),
    ).toEqual([true, false]);
    const from = updates().length;
    const rolled = await h.game.rollBack("beat");
    await tick();
    expect(h.game.story.currentText?.trim()).toBe("First.");
    expect(rolled.moved && rolled.restored.loops).toEqual([
      { channel: "ambient", key: "audio.theme", play: "continue" },
    ]);
    expect(
      updates().slice(from).filter((u: any) => u.key === "audio.theme" && u.loop === true),
    ).toHaveLength(1);
  });
});

const tickingHarness = async (lines: string[]) => {
  const h = createHarness(lines.join("\n"));
  await h.ready;
  h.jumpToFlow("start");
  const tick = async () => {
    await flushMicrotasks(40);
    (h.game as any)._coordinator?.onUpdate({ deltaMS: 1000 });
    await flushMicrotasks(40);
  };
  return { h, tick };
};

describe("the beat-scoped channels of a restored beat", () => {
  for (const channel of ["sound", "voice"]) {
    test(`keep an explicit ${channel} loop the restored beat holds`, async () => {
      const { h, tick } = await tickingHarness([
        "define theme as audio with",
        '  src = "https://example.com/theme.wav"',
        "end",
        "scene start",
        `  ((play ${channel} theme loop))`,
        "  First.",
        `  ((play ${channel} theme loop))`,
        "  Second.",
        "end",
      ]);
      const keys = () =>
        (h.game.module.audio.state.channels?.[channel]?.looping ?? []).map(
          (state) => state.key,
        );
      h.game.start();
      await tick();
      h.game.continue();
      await tick();
      expect(keys()).toEqual(["audio.theme"]);
      const rolled = await h.game.rollBack("beat");
      await tick();
      expect(h.game.story.currentText?.trim()).toBe("First.");
      expect(keys()).toEqual(["audio.theme"]);
      expect(rolled.moved && rolled.restored.loops).toEqual([
        { channel, key: "audio.theme", play: "continue" },
      ]);
      expect(rolled.moved && rolled.restored.stoppedLoops).toEqual([]);
    });
  }

  test("silence a one-shot sound the left beat played", async () => {
    const { h, tick } = await tickingHarness([
      "define ding as audio with",
      '  src = "https://example.com/ding.wav"',
      "end",
      "scene start",
      "  First.",
      "  ((play sound ding))",
      "  Second.",
      "end",
    ]);
    h.game.start();
    await tick();
    h.game.continue();
    await tick();
    expect(h.game.story.currentText?.trim()).toBe("Second.");
    const from = h.messages.length;
    const rolled = await h.game.rollBack("beat");
    await tick();
    const updates = h.messages
      .slice(from)
      .filter((m) => m.method === "audio/update" && m.params.channel === "sound")
      .flatMap((m) => m.params.updates);
    expect(updates.filter((u: any) => u.control === "stop" && u.key === "audio.ding")).toHaveLength(1);
    expect(rolled.moved && rolled.restored.loops).toEqual([]);
    expect(rolled.moved && rolled.restored.stoppedLoops).toEqual([]);
  });
});

describe("a one-shot still sounding when a roll leaves its beat", () => {
  test("is stopped though a replacement was still loading", async () => {
    const { h, tick } = await tickingHarness([
      "define first as audio with",
      '  src = "https://example.com/first.wav"',
      "end",
      "define other as audio with",
      '  src = "https://example.com/other.wav"',
      "end",
      "define HERO as character with",
      '  name = "HERO"',
      "end",
      "scene start",
      "  Quiet.",
      "  HERO: ((play voice first)) First .. >",
      "  .. ((play voice other)) second.",
      "end",
    ]);
    const releases: (() => void)[] = [];
    (h.game.module.audio as any).loadAllAudio = async (data: any[]) => {
      if (data.some((d) => d.key === "audio.other")) {
        await new Promise<void>((resolve) => releases.push(resolve));
      }
    };
    const updates = (from = 0) =>
      h.messages
        .slice(from)
        .filter((m) => m.method === "audio/update" && m.params.channel === "voice")
        .flatMap((m) => m.params.updates);
    h.game.start();
    await tick();
    h.game.continue();
    await tick();
    expect(
      updates().filter((u: any) => u.control === "start" && u.key === "audio.first"),
    ).toHaveLength(1);
    h.game.continue();
    await tick();
    expect(Boolean((h.game as any)._run.current.shown.extended)).toBe(true);
    expect(releases.length).toBeGreaterThan(0);
    expect(updates().filter((u: any) => u.control === "start" && u.key === "audio.other")).toEqual([]);
    const from = h.messages.length;
    const rolled = await h.game.rollBack("choice");
    await tick();
    expect(h.game.story.currentText?.trim()).toBe("Quiet.");
    expect(rolled.moved && rolled.restored.loops).toEqual([]);
    expect(
      updates(from).filter((u: any) => u.control === "stop" && u.key === "audio.first"),
    ).toHaveLength(1);
    expect(
      updates(from).filter((u: any) => u.key === "audio.other"),
    ).toEqual([]);
  });
});

describe("a channel stop the left beat had only scheduled", () => {
  for (const channel of ["sound", "voice"]) {
    test(`does not stop the ${channel} loop a roll in the same turn restores`, async () => {
      const { h, tick } = await tickingHarness([
        "define theme as audio with",
        '  src = "https://example.com/theme.wav"',
        "end",
        "scene start",
        `  ((play ${channel} theme loop))`,
        "  First.",
        "  Second.",
        "end",
      ]);
      h.game.start();
      await tick();
      expect(h.game.module.audio.loopsPlaying().get(channel)?.has("audio.theme")).toBe(true);
      h.game.continue();
      const from = h.messages.length;
      const rolled = await h.game.rollBack("beat");
      await flushMicrotasks(40);
      expect(rolled.moved && rolled.restored.loops).toEqual([
        { channel, key: "audio.theme", play: "continue" },
      ]);
      const stops = h.messages
        .slice(from)
        .filter((m) => m.method === "audio/update" && m.params.channel === channel)
        .flatMap((m) => m.params.updates)
        .filter((u: any) => u.control === "stop" && (!u.key || u.key === "audio.theme"));
      expect(stops).toEqual([]);
      expect(h.game.module.audio.loopsPlaying().get(channel)?.get("audio.theme")?.looping).toBe(true);
    });
  }
});
