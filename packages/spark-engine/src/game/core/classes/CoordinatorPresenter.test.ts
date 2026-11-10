import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Instructions } from "../types/Instructions";
import { BEAT_LEAD_MS } from "../utils/sharedClock";
import { Clock } from "./Clock";
import { Coordinator } from "./Coordinator";
import type { Game } from "./Game";
import { EventMessage } from "./messages/EventMessage";
import type { PresentOptions } from "./presenters/Presenter";

const recorded = vi.hoisted(() => ({
  calls: [] as unknown[][],
  options: [] as PresentOptions[],
}));

vi.mock("./presenters/VisualNovelPresenter", () => ({
  writeBeatText: () => [],
  VisualNovelPresenter: class {
    instructions: Instructions;
    constructor(_game: unknown, instructions: Instructions, options: PresentOptions) {
      this.instructions = instructions;
      recorded.options.push(options);
    }
    present(time?: number) {
      recorded.calls.push(["present", this.instructions, time]);
    }
    finish() {
      recorded.calls.push(["finish", this.instructions]);
    }
  },
}));

vi.mock("./presenters/InteractiveFictionPresenter", () => ({
  InteractiveFictionPresenter: class {},
  textstreamOpenAfter: () => false,
}));

const NOW = 5000;

const UI_TARGET_WRITES = [
  "beginCompose",
  "endCompose",
  "composeWait",
  "applyLayoutInstructions",
  "showLayout",
  "reveal",
  "refreshLayouts",
  "observe",
  "unobserve",
  "hideAll",
] as const;

const createGame = (previewing?: boolean) => {
  const uiWrites: string[] = [];
  const recorder = (path: string) =>
    new Proxy(
      {},
      {
        get: (_target, name) => () => {
          uiWrites.push(`${path}.${String(name)}`);
        },
      },
    );
  const ui: Record<string, unknown> = {
    text: recorder("text"),
    image: recorder("image"),
    style: recorder("style"),
    initialLayoutsOpened: true,
    openedLayoutsAfter: () => ["main", "textbox"],
    layoutHolds: () => true,
    afterCompose: (work: () => void) => work(),
    getTransientTargets: () => {
      uiWrites.push("getTransientTargets");
      return [];
    },
  };
  for (const name of UI_TARGET_WRITES) {
    ui[name] = () => {
      uiWrites.push(name);
    };
  }
  const chosen: number[] = [];
  const advanced = { clicked: 0, auto: 0 };
  const game = {
    context: {
      system: {
        previewing,
        simulating: undefined,
        now: () => NOW,
      },
      preferences: { flow: { auto_advance_delay: 0 } },
    },
    module: {
      ui,
      audio: {
        stopChannel: () => {},
        schedule: () => 0,
        isReady: () => true,
        triggerAll: () => {},
        outputLatency: 0,
      },
      assets: {
        prepareBeat: () => null,
        runLoad: () => 0,
        isReady: () => true,
        trigger: () => {},
        onBeatDisplayed: () => {},
      },
    },
    clickedToContinue: () => {
      advanced.clicked += 1;
    },
    autoAdvancedToContinue: () => {
      advanced.auto += 1;
    },
    chosePathToContinue: (index: number) => chosen.push(index),
  };
  return { game: game as unknown as Game, uiWrites, chosen, advanced };
};

const tick = (deltaMS: number) => ({ deltaMS }) as Clock;

const click = () =>
  EventMessage.type.notification({ type: "pointerdown", button: 0 } as never);

const line = (text: string, end = 1): Instructions => ({
  text: { action: [{ control: "show", text }] as any },
  end,
});

beforeEach(() => {
  recorded.calls.length = 0;
  recorded.options.length = 0;
});

describe("the Coordinator presents a beat through its presenter (#1988)", () => {
  it("presents each played beat once, timed from its start, and finishes it when its time ends", () => {
    const { game, uiWrites, advanced } = createGame();
    const first = line("First.");
    const coordinator = new Coordinator(game, first);
    expect(recorded.calls).toEqual([["present", first, NOW + BEAT_LEAD_MS]]);
    expect(recorded.options).toEqual([
      expect.objectContaining({ instant: undefined, preview: undefined }),
    ]);

    coordinator.onUpdate(tick(BEAT_LEAD_MS + 999));
    expect(recorded.calls).toHaveLength(1);
    coordinator.onUpdate(tick(1));
    expect(recorded.calls).toEqual([
      ["present", first, NOW + BEAT_LEAD_MS],
      ["finish", first],
    ]);

    coordinator.onMessage(click());
    coordinator.onUpdate(tick(0));
    expect(advanced.clicked).toBe(1);

    const second = line("Second.");
    new Coordinator(game, second);
    expect(recorded.calls.slice(2)).toEqual([
      ["present", second, NOW + BEAT_LEAD_MS],
    ]);
    expect(uiWrites).toEqual([]);
  });

  it("presents a previewed beat at once and finishes it straight away", () => {
    const { game, uiWrites } = createGame(true);
    const beat = line("Shown at once.");
    new Coordinator(game, beat);
    expect(recorded.calls).toEqual([
      ["present", beat, undefined],
      ["finish", beat],
    ]);
    expect(recorded.options).toEqual([
      expect.objectContaining({ instant: true, preview: true }),
    ]);
    expect(uiWrites).toEqual([]);
  });

  it("presents the rest of a beat at once on a click mid-type, then finishes it", () => {
    const { game, uiWrites, advanced } = createGame();
    const beat = line("Typed slowly.", 10);
    const coordinator = new Coordinator(game, beat);
    coordinator.onMessage(click());
    coordinator.onUpdate(tick(0));
    expect(advanced.clicked).toBe(0);
    expect(recorded.calls).toEqual([
      ["present", beat, NOW + BEAT_LEAD_MS],
      ["present", beat, undefined],
      ["finish", beat],
    ]);
    expect(recorded.options.map((o) => o.instant)).toEqual([undefined, true]);
    expect(uiWrites).toEqual([]);
  });

  it("hands the presenter a choice callback that reaches chosePathToContinue with the picked index", () => {
    const { game, uiWrites, chosen } = createGame();
    const menu: Instructions = {
      text: {
        "choice 0": [{ control: "show", text: "Left" }] as any,
        "choice 1": [{ control: "show", text: "Right" }] as any,
      },
      choices: ["choice 0", "choice 1"],
      options: ["Left", "Right"],
      kind: "choice",
      end: 0,
    };
    new Coordinator(game, menu);
    expect(recorded.calls[0]).toEqual(["present", menu, NOW + BEAT_LEAD_MS]);
    recorded.options[0]!.choose(1);
    expect(chosen).toEqual([1]);
    expect(uiWrites).toEqual([]);
  });
});
