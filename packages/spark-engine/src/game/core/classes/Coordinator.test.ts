import { describe, expect, it } from "vitest";
import { Instructions } from "../types/Instructions";
import { Clock } from "./Clock";
import { Coordinator } from "./Coordinator";
import type { Game } from "./Game";
import { EventMessage } from "./messages/EventMessage";

/**
 * `shouldContinue()` return codes.
 */
const STAY = 0;
const AUTO_ADVANCED = 1;
const INTERACTED = 2;

interface Calls {
  clickedToContinue: number;
  autoAdvancedToContinue: number;
  chosePathToContinue: number[];
  /** One entry per `ui.text.write`, recording whether it was an instant reveal. */
  textWrites: { target: string; instant: boolean }[];
  loadedWorlds: string[];
}

/**
 * A stand-in for `Game` exposing only the surface `Coordinator` touches.
 * `setTimeout` runs synchronously so a tick fully resolves before returning,
 * which keeps the tests free of timers.
 */
const createGame = (
  overrides: { autoAdvanceDelay?: number; previewing?: boolean } = {},
) => {
  const calls: Calls = {
    clickedToContinue: 0,
    autoAdvancedToContinue: 0,
    chosePathToContinue: [],
    textWrites: [],
    loadedWorlds: [],
  };
  const game = {
    context: {
      system: {
        previewing: overrides.previewing,
        simulating: undefined,
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
        reveal: () => {},
        hideAll: () => {},
        observe: () => {},
        unobserve: () => {},
        text: {
          clearAll: () => {},
          write: (target: string, _events: unknown, instant?: boolean) =>
            calls.textWrites.push({ target, instant: Boolean(instant) }),
        },
        image: { clearAll: () => {}, write: () => {} },
        style: { update: () => {} },
      },
      audio: {
        stopChannel: () => {},
        schedule: () => 0,
        isReady: () => true,
        triggerAll: () => {},
        outputLatency: 0,
      },
      assets: {
        prepareBeat: () => null,
        // A `load` beat reaches the loader with every name it carries.
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

/**
 * Exposes the execution flags so the state-machine hygiene tests can assert
 * them directly. Behaviour is otherwise identical to `Coordinator`.
 */
class ProbeCoordinator extends Coordinator<Game> {
  get finishedExecution(): boolean {
    return this._finishedExecution;
  }
  get startedExecution(): boolean {
    return this._startedExecution;
  }
}

/** A beat with text that takes 1s to reveal. */
const textBeat = (extra: Partial<Instructions> = {}): Instructions => ({
  text: { textbox: [{ text: "Hello." }] as never },
  end: 1,
  ...extra,
});

/**
 * A coordinator part-way through revealing its text: execution has started
 * (so an interaction means "reveal the rest"), but hasn't finished.
 */
const midReveal = (instructions: Instructions = textBeat()) => {
  const { game, calls } = createGame();
  const coordinator = new ProbeCoordinator(game, instructions);
  return { coordinator, calls };
};

/**
 * A coordinator whose text has fully revealed and is now waiting on the
 * player (this is the state that shows the tap-to-continue indicator).
 */
const finishedBeat = (
  instructions: Instructions = textBeat(),
  gameOverrides: Parameters<typeof createGame>[0] = {},
) => {
  const { game, calls } = createGame(gameOverrides);
  const coordinator = new ProbeCoordinator(game, instructions);
  // Run out the reveal duration so handleFinished() fires
  coordinator.onUpdate(tick(instructions.end * 1000));
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

/**
 * The three ways a player can say "continue". These must stay
 * indistinguishable to the Coordinator -- they all set the same latch.
 */
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
        // The initial reveal is animated, not instant
        expect(calls.textWrites).toEqual([
          { target: "textbox", instant: false },
        ]);

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

    // An interaction that is deliberately ignored must not disturb the state
    // machine. Clearing the finished flag here used to strand the beat out of
    // its "finished revealing" state for the rest of its life (#231).
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
      // Consumed by the advance itself
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
      // Ticking while the load is still running changes nothing.
      coordinator.onUpdate(tick(0));
      coordinator.onUpdate(tick(0));
      expect(coordinator.shouldContinue()).toBe(STAY);
      assets.isReady = () => true;
      coordinator.onUpdate(tick(0));
      expect(coordinator.shouldContinue()).toBe(AUTO_ADVANCED);
    });
  });
});
