import { describe, expect, it } from "vitest";
import { Instructions } from "../types/Instructions";
import { Clock } from "./Clock";
import { BEAT_LEAD_MS } from "../utils/sharedClock";
import { Coordinator } from "./Coordinator";
import type { Game } from "./Game";
import { EventMessage } from "./messages/EventMessage";

const NOW = 5000;

const STAY = 0;
const AUTO_ADVANCED = 1;
const INTERACTED = 2;

interface Calls {
  clickedToContinue: number;
  autoAdvancedToContinue: number;
  chosePathToContinue: number[];
  textWrites: { target: string; instant: boolean; time?: number }[];
  audioTriggerTimes: (number | undefined)[];
  loadedWorlds: string[];
  cutscenes: string[];
  skippedCutscenes: number;
}

const createGame = (
  overrides: {
    autoAdvanceDelay?: number;
    previewing?: boolean;
    outputLatency?: number;
  } = {},
) => {
  const calls: Calls = {
    clickedToContinue: 0,
    autoAdvancedToContinue: 0,
    chosePathToContinue: [],
    textWrites: [],
    audioTriggerTimes: [],
    loadedWorlds: [],
    cutscenes: [],
    skippedCutscenes: 0,
  };
  const game = {
    context: {
      system: {
        previewing: overrides.previewing,
        simulating: undefined,
        now: () => NOW,
        setTimeout: (handler: Function) => {
          handler();
          return 0;
        },
      },
      preferences: {
        flow: { auto_advance_delay: overrides.autoAdvanceDelay ?? 0 },
      },
    },
    module: {
      world: {
        loadWorld: (name: string) => calls.loadedWorlds.push(name),
      },
      ui: {
        getTransientTargets: () => [],
        showLayout: () => {},
        applyLayoutInstructions: () => {},
        refreshLayouts: () => {},
        beginCompose: () => false,
        composeWait: () => {},
        endCompose: async () => {},
        afterCompose: (work: () => void) => work(),
        reveal: () => {},
        hideAll: () => {},
        observe: () => {},
        unobserve: () => {},
        text: {
          clearAll: () => {},
          write: (
            target: string,
            _events: unknown,
            instant?: boolean,
            time?: number,
          ) =>
            calls.textWrites.push({
              target,
              instant: Boolean(instant),
              ...(time != null ? { time } : {}),
            }),
        },
        image: {
          clearAll: () => {},
          restoreCleared: () => {},
          write: () => {},
        },
        style: { update: () => {} },
        cutsceneEnded: false,
        runCutscene(cutscene: { name: string }) {
          calls.cutscenes.push(cutscene.name);
          return 7;
        },
        skipCutscene: () => {
          calls.skippedCutscenes += 1;
        },
        isReady(id: number) {
          return id !== 7 || this.cutsceneEnded;
        },
        trigger: () => {},
      },
      audio: {
        stopChannel: () => {},
        schedule: () => 0,
        isReady: () => true,
        triggerAll: (_ids: number[], time?: number) =>
          calls.audioTriggerTimes.push(time),
        outputLatency: overrides.outputLatency ?? 0,
      },
      assets: {
        prepareBeat: () => null,
        runLoad: (loads: Array<{ name: string }>) => {
          for (const load of loads) {
            calls.loadedWorlds.push(load.name);
          }
          return 0;
        },
        isReady: () => true,
        trigger: () => {},
        onBeatDisplayed: () => {},
      },
    },
    clickedToContinue: () => {
      calls.clickedToContinue += 1;
    },
    autoAdvancedToContinue: () => {
      calls.autoAdvancedToContinue += 1;
    },
    chosePathToContinue: (index: number) =>
      calls.chosePathToContinue.push(index),
  };
  return { game: game as unknown as Game, calls };
};

const tick = (deltaMS: number) => ({ deltaMS }) as Clock;

class ProbeCoordinator extends Coordinator<Game> {
  get finishedExecution(): boolean {
    return this._finishedExecution;
  }
  get startedExecution(): boolean {
    return this._startedExecution;
  }
}

const textBeat = (extra: Partial<Instructions> = {}): Instructions => ({
  text: { textbox: [{ text: "Hello." }] as never },
  end: 1,
  ...extra,
});

const midReveal = (instructions: Instructions = textBeat()) => {
  const { game, calls } = createGame();
  const coordinator = new ProbeCoordinator(game, instructions);
  return { coordinator, calls };
};

const finishedBeat = (
  instructions: Instructions = textBeat(),
  gameOverrides: Parameters<typeof createGame>[0] = {},
) => {
  const { game, calls } = createGame(gameOverrides);
  const coordinator = new ProbeCoordinator(game, instructions);
  coordinator.onUpdate(tick(instructions.end * 1000 + BEAT_LEAD_MS));
  return { coordinator, calls };
};

const pointerdown = (button = 0) =>
  EventMessage.type.notification({ type: "pointerdown", button } as never);

const keydown = (key: string, modifiers: Record<string, boolean> = {}) =>
  EventMessage.type.notification({
    type: "keydown",
    key,
    repeat: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...modifiers,
  } as never);

const ADVANCE_INPUTS = [
  ["tap", () => pointerdown(0)],
  ["Enter", () => keydown("Enter")],
  ["Space", () => keydown(" ")],
] as const;

describe("Coordinator", () => {
  describe("advancing a finished beat", () => {
    for (const [name, event] of ADVANCE_INPUTS) {
      it(`advances on ${name}`, () => {
        const { coordinator } = finishedBeat();
        coordinator.onMessage(event());
        expect(coordinator.shouldContinue()).toBe(INTERACTED);
      });
    }

    it("stays put with no interaction", () => {
      const { coordinator } = finishedBeat();
      expect(coordinator.shouldContinue()).toBe(STAY);
    });

    it("consumes the interaction so one press advances one beat", () => {
      const { coordinator } = finishedBeat();
      coordinator.onMessage(keydown("Enter"));
      expect(coordinator.shouldContinue()).toBe(INTERACTED);
      expect(coordinator.shouldContinue()).toBe(STAY);
    });

    it("calls clickedToContinue through onUpdate", () => {
      const { coordinator, calls } = finishedBeat();
      coordinator.onMessage(keydown("Enter"));
      coordinator.onUpdate(tick(16));
      expect(calls.clickedToContinue).toBe(1);
      expect(calls.autoAdvancedToContinue).toBe(0);
    });
  });

  describe("instant reveal mid-type", () => {
    for (const [name, event] of ADVANCE_INPUTS) {
      it(`reveals the rest of the beat on ${name} instead of advancing`, () => {
        const { coordinator, calls } = midReveal();
        expect(calls.textWrites).toEqual([
          { target: "textbox", instant: false, time: NOW + BEAT_LEAD_MS },
        ]);
        expect(calls.audioTriggerTimes).toEqual([NOW + BEAT_LEAD_MS]);

        coordinator.onMessage(event());

        expect(coordinator.shouldContinue()).toBe(STAY);
        expect(calls.textWrites).toContainEqual({
          target: "textbox",
          instant: true,
        });
        expect(calls.clickedToContinue).toBe(0);
      });
    }

    it("advances on the second interaction, once revealed", () => {
      const { coordinator } = midReveal();
      coordinator.onMessage(keydown("Enter"));
      expect(coordinator.shouldContinue()).toBe(STAY);
      coordinator.onMessage(keydown("Enter"));
      expect(coordinator.shouldContinue()).toBe(INTERACTED);
    });
  });

  describe("choices block advancing", () => {
    const withChoices = () => textBeat({ choices: ["choice_0", "choice_1"] });

    for (const [name, event] of ADVANCE_INPUTS) {
      it(`does not advance past choices on ${name}`, () => {
        const { coordinator, calls } = finishedBeat(withChoices());
        coordinator.onMessage(event());
        expect(coordinator.shouldContinue()).toBe(STAY);
        expect(calls.clickedToContinue).toBe(0);
      });
    }

    it("does not instant-reveal past choices mid-type", () => {
      const { coordinator, calls } = midReveal(withChoices());
      coordinator.onMessage(keydown("Enter"));
      expect(coordinator.shouldContinue()).toBe(STAY);
      expect(calls.textWrites).not.toContainEqual({
        target: "textbox",
        instant: true,
      });
    });

    for (const [name, event] of ADVANCE_INPUTS) {
      it(`keeps the beat marked finished after an ignored ${name}`, () => {
        const { coordinator } = finishedBeat(withChoices());
        expect(coordinator.finishedExecution).toBe(true);

        coordinator.onMessage(event());
        coordinator.shouldContinue();

        expect(coordinator.finishedExecution).toBe(true);
      });
    }

    it("keeps the beat marked finished across repeated ignored interactions", () => {
      const { coordinator } = finishedBeat(withChoices());
      for (let i = 0; i < 3; i += 1) {
        coordinator.onMessage(pointerdown(0));
        expect(coordinator.shouldContinue()).toBe(STAY);
      }
      expect(coordinator.finishedExecution).toBe(true);
    });
  });

  describe("execution flag hygiene", () => {
    it("clears the finished flag only when the interaction advances", () => {
      const { coordinator } = finishedBeat();
      expect(coordinator.finishedExecution).toBe(true);

      coordinator.onMessage(keydown("Enter"));
      expect(coordinator.shouldContinue()).toBe(INTERACTED);
      expect(coordinator.finishedExecution).toBe(false);
    });

    it("leaves the finished flag alone for keys that never advance", () => {
      const { coordinator } = finishedBeat();
      coordinator.onMessage(keydown("Escape"));
      expect(coordinator.shouldContinue()).toBe(STAY);
      expect(coordinator.finishedExecution).toBe(true);
    });

    it("marks the beat finished after an instant reveal", () => {
      const { coordinator } = midReveal();
      expect(coordinator.startedExecution).toBe(true);
      expect(coordinator.finishedExecution).toBe(false);

      coordinator.onMessage(keydown("Enter"));
      expect(coordinator.shouldContinue()).toBe(STAY);
      expect(coordinator.finishedExecution).toBe(true);
    });
  });

  describe("keys that must not advance", () => {
    const ignored: [string, ReturnType<typeof keydown>][] = [
      ["auto-repeat Enter", keydown("Enter", { repeat: true })],
      ["auto-repeat Space", keydown(" ", { repeat: true })],
      ["Ctrl+Enter", keydown("Enter", { ctrlKey: true })],
      ["Alt+Enter", keydown("Enter", { altKey: true })],
      ["Meta+Enter", keydown("Enter", { metaKey: true })],
      ["Shift+Space", keydown(" ", { shiftKey: true })],
      ["Escape", keydown("Escape")],
      ["a letter key", keydown("a")],
      ["Tab", keydown("Tab")],
    ];

    for (const [name, event] of ignored) {
      it(`ignores ${name}`, () => {
        const { coordinator } = finishedBeat();
        coordinator.onMessage(event);
        expect(coordinator.shouldContinue()).toBe(STAY);
      });
    }

    it("ignores non-primary pointer buttons", () => {
      const { coordinator } = finishedBeat();
      coordinator.onMessage(pointerdown(2));
      expect(coordinator.shouldContinue()).toBe(STAY);
    });

    it("ignores keyup", () => {
      const { coordinator } = finishedBeat();
      coordinator.onMessage(
        EventMessage.type.notification({
          type: "keyup",
          key: "Enter",
        } as never),
      );
      expect(coordinator.shouldContinue()).toBe(STAY);
    });
  });

  describe("auto advance", () => {
    it("advances without interaction once the delay elapses", () => {
      const { calls } = finishedBeat(textBeat({ auto: true }), {
        autoAdvanceDelay: 0,
      });
      expect(calls.autoAdvancedToContinue).toBe(1);
      expect(calls.clickedToContinue).toBe(0);
    });

    it("waits for the delay before auto advancing", () => {
      const { coordinator, calls } = finishedBeat(textBeat({ auto: true }), {
        autoAdvanceDelay: 5,
      });
      expect(calls.autoAdvancedToContinue).toBe(0);
      expect(coordinator.shouldContinue()).toBe(STAY);
    });

    it("advances a beat with nothing to show once its duration is up", () => {
      const { game } = createGame();
      const coordinator = new Coordinator(game, { end: 0 });
      expect(coordinator.shouldContinue()).toBe(AUTO_ADVANCED);
    });
  });

  describe("loading", () => {
    it("stays put until the load has finished, then advances on its own", () => {
      const { game, calls } = createGame();
      const assets = (game.module as any).assets;
      assets.isReady = () => false;
      const coordinator = new Coordinator(game, {
        load: [{ name: "world" }] as never,
        end: 0,
      });
      expect(coordinator.shouldContinue()).toBe(STAY);
      expect(calls.loadedWorlds).toEqual(["world"]);
      coordinator.onUpdate(tick(0));
      coordinator.onUpdate(tick(0));
      expect(coordinator.shouldContinue()).toBe(STAY);
      assets.isReady = () => true;
      coordinator.onUpdate(tick(100));
      expect(coordinator.shouldContinue()).toBe(STAY);
      coordinator.onUpdate(tick(BEAT_LEAD_MS - 1));
      expect(coordinator.shouldContinue()).toBe(STAY);
      coordinator.onUpdate(tick(1));
      expect(coordinator.shouldContinue()).toBe(AUTO_ADVANCED);
    });

    it("counts the duration from the page's display, output latency included", () => {
      const { game } = createGame({ outputLatency: 0.04 });
      const assets = (game.module as any).assets;
      assets.isReady = () => false;
      const coordinator = new Coordinator(game, {
        load: [{ name: "world" }] as never,
        end: 0,
      });
      assets.isReady = () => true;
      coordinator.onUpdate(tick(0));
      coordinator.onUpdate(tick(BEAT_LEAD_MS + 39));
      expect(coordinator.shouldContinue()).toBe(STAY);
      coordinator.onUpdate(tick(1));
      expect(coordinator.shouldContinue()).toBe(AUTO_ADVANCED);
    });
  });

  describe("cutscenes", () => {
    const cutsceneBeat = (extra: Partial<Instructions> = {}): Instructions => ({
      cutscene: [{ name: "intro" }],
      end: 0,
      ...extra,
    });

    it("starts the cutscene once the beat's assets are resident", () => {
      const { game, calls } = createGame();
      const assets = (game.module as any).assets;
      assets.prepareBeat = () => 1;
      assets.isReady = () => false;
      const coordinator = new Coordinator(game, cutsceneBeat());
      coordinator.onUpdate(tick(0));
      expect(calls.cutscenes).toEqual([]);
      assets.isReady = () => true;
      coordinator.onUpdate(tick(0));
      expect(calls.cutscenes).toEqual(["intro"]);
      coordinator.onUpdate(tick(BEAT_LEAD_MS));
      coordinator.onUpdate(tick(1000));
      expect(calls.cutscenes).toEqual(["intro"]);
    });

    it("advances on its own once the cutscene has ended, and not before", () => {
      const { game, calls } = createGame();
      const ui = (game.module as any).ui;
      const coordinator = new Coordinator(game, cutsceneBeat());
      expect(calls.cutscenes).toEqual(["intro"]);
      coordinator.onUpdate(tick(BEAT_LEAD_MS));
      coordinator.onUpdate(tick(60_000));
      expect(coordinator.shouldContinue()).toBe(STAY);
      expect(calls.autoAdvancedToContinue).toBe(0);
      ui.cutsceneEnded = true;
      coordinator.onUpdate(tick(0));
      expect(calls.autoAdvancedToContinue).toBe(1);
      expect(calls.clickedToContinue).toBe(0);
    });

    for (const [name, input] of ADVANCE_INPUTS) {
      it(`skips the cutscene on ${name} instead of advancing`, () => {
        const { game, calls } = createGame();
        const ui = (game.module as any).ui;
        const coordinator = new Coordinator(game, cutsceneBeat());
        coordinator.onUpdate(tick(BEAT_LEAD_MS));
        coordinator.onMessage(input());
        coordinator.onUpdate(tick(16));
        expect(calls.skippedCutscenes).toBe(1);
        expect(calls.clickedToContinue).toBe(0);
        expect(calls.autoAdvancedToContinue).toBe(0);
        ui.cutsceneEnded = true;
        coordinator.onUpdate(tick(16));
        expect(calls.autoAdvancedToContinue).toBe(1);
        expect(calls.clickedToContinue).toBe(0);
        expect(calls.skippedCutscenes).toBe(1);
      });
    }

    it("drops a click that lands before the cutscene starts", () => {
      const { game, calls } = createGame();
      const assets = (game.module as any).assets;
      assets.prepareBeat = () => 1;
      assets.isReady = () => false;
      const coordinator = new Coordinator(game, cutsceneBeat());
      coordinator.onMessage(pointerdown());
      coordinator.onUpdate(tick(0));
      expect(calls.skippedCutscenes).toBe(0);
      assets.isReady = () => true;
      coordinator.onUpdate(tick(0));
      coordinator.onUpdate(tick(BEAT_LEAD_MS));
      expect(calls.cutscenes).toEqual(["intro"]);
      expect(calls.skippedCutscenes).toBe(0);
      expect(coordinator.shouldContinue()).toBe(STAY);
    });

    it("does not take a click from before the start for a skip when the gate opens on the next tick", () => {
      const { game, calls } = createGame();
      const assets = (game.module as any).assets;
      assets.prepareBeat = () => 1;
      assets.isReady = () => false;
      const coordinator = new Coordinator(game, cutsceneBeat());
      coordinator.onMessage(pointerdown());
      assets.isReady = () => true;
      coordinator.onUpdate(tick(16));
      expect(calls.cutscenes).toEqual(["intro"]);
      expect(calls.skippedCutscenes).toBe(0);
      coordinator.onMessage(pointerdown());
      coordinator.onUpdate(tick(16));
      expect(calls.skippedCutscenes).toBe(1);
    });

    it("does not wait for a cutscene while a route is simulated", () => {
      const { game, calls } = createGame();
      (game.context.system as any).simulating = true;
      const coordinator = new Coordinator(game, cutsceneBeat());
      expect(calls.cutscenes).toEqual(["intro"]);
      expect(coordinator.shouldContinue()).toBe(AUTO_ADVANCED);
    });

    it("asks a preview for the first frame without waiting for it", () => {
      const { game, calls } = createGame({ previewing: true });
      const coordinator = new Coordinator(game, cutsceneBeat());
      expect(calls.cutscenes).toEqual(["intro"]);
      expect(coordinator.shouldContinue()).toBe(AUTO_ADVANCED);
    });

    it("waits for a choice after the cutscene, as a load beat does", () => {
      const { game, calls } = createGame();
      const ui = (game.module as any).ui;
      const coordinator = new Coordinator(
        game,
        cutsceneBeat({ choices: ["choice 0"] }),
      );
      coordinator.onUpdate(tick(BEAT_LEAD_MS));
      coordinator.onMessage(pointerdown());
      coordinator.onUpdate(tick(0));
      expect(calls.skippedCutscenes).toBe(1);
      ui.cutsceneEnded = true;
      coordinator.onUpdate(tick(0));
      coordinator.onMessage(pointerdown());
      coordinator.onUpdate(tick(0));
      expect(calls.skippedCutscenes).toBe(1);
      expect(calls.autoAdvancedToContinue).toBe(0);
      expect(calls.clickedToContinue).toBe(0);
    });
  });
});
