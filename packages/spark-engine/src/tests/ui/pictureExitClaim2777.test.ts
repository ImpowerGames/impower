import { describe, expect, test } from "vitest";
import type { Clock } from "../../game/core/classes/Clock";
import { Coordinator } from "../../game/core/classes/Coordinator";
import type { Game } from "../../game/core/classes/Game";
import { createHarness, flushMicrotasks, type UIHarness } from "./harness/uiTestHarness";

const SOURCE = `define SPRITE as image with
  src = "https://example.com/hero.png"
end

layout main {
  stage {
    portrait {
      image
    }
  }
  dialogue {
    text
  }
  action {
    text
  }
}

style dialogue {
  @hide { opacity = 0 }
}

style frame {
  @showing(portrait) {
    opacity = 1
  }
}

scene start
  HERO: Hello. [[show portrait SPRITE]]
  [[hide portrait with fadeout over 0.5s]] Bye.
  The wind blows.
end
`;

const wire = (messages: any[]): any[] =>
  messages.flatMap((m: any) =>
    (m?.method === "ui/batch" || m?.method === "ui/beat") && Array.isArray(m.params?.messages)
      ? wire(m.params.messages)
      : [m],
  );

const marked = (h: UIHarness): string[] => {
  const counts = new Map<string, number>();
  for (const { params } of wire(h.messages).filter((m: any) => m?.method === "ui/showing")) {
    if (params.reset) {
      counts.clear();
    }
    for (const [name, change] of Object.entries(params.changes as Record<string, number>)) {
      counts.set(name, (counts.get(name) ?? 0) + change);
    }
  }
  return [...counts].filter(([, count]) => count > 0).map(([name]) => name).sort();
};

const claims = (h: UIHarness): number => (h.game.module.ui as any)._exits.size;

const reportedHides = (h: UIHarness) =>
  wire(h.messages).filter(
    (m: any) => m?.method === "ui/write-image" && m.params.target === "portrait" && m.params.reportsExit,
  );

const portraitHides = (h: UIHarness) =>
  wire(h.messages).filter(
    (m: any) =>
      m?.method === "ui/write-image" &&
      m.params.target === "portrait" &&
      m.params.instructions.some((i: any) => i.control === "hide"),
  );

const live = (game: Game) => {
  game.context.system.previewing = undefined;
  game.context.system.composeBeats = true;
};

async function tick(coordinator: Coordinator<Game>, times = 10) {
  for (let i = 0; i < times; i += 1) {
    await flushMicrotasks(20);
    coordinator.onUpdate({ deltaMS: 100 } as Clock);
  }
  await flushMicrotasks(30);
}

async function exiting(opts: { holdPresence?: boolean } = {}) {
  const h = createHarness(SOURCE, 0, {
    reactive: true,
    autoOpenAll: false,
    holdExits: true,
    beforeConnect: live,
    ...opts,
  });
  await h.ready;
  await flushMicrotasks(10);
  h.jumpToFlow("start");
  await tick(new Coordinator(h.game, h.nextBeat()!));
  h.releasePresence();
  await flushMicrotasks(20);
  const save = h.game.save();
  expect(marked(h)).toEqual(["portrait"]);
  const coordinator = new Coordinator(h.game, h.nextBeat()!);
  await tick(coordinator, 2);
  return { h, coordinator, save };
}

describe("a picture's exit claim ends however its exit ends (#2777)", () => {
  test("while the exit plays the picture is marked and one claim waits for the player's report", async () => {
    const { h } = await exiting();
    expect(reportedHides(h)).toHaveLength(1);
    expect(marked(h)).toEqual(["portrait"]);
    expect(claims(h)).toBe(1);
    h.releaseExits();
    await flushMicrotasks(20);
    expect(marked(h)).toEqual([]);
    expect(claims(h)).toBe(0);
  });

  test("a click that settles the line during the exit shows the picture gone and leaves no claim", async () => {
    const { h, coordinator } = await exiting();
    (coordinator as any).showWhole();
    await flushMicrotasks(40);
    expect(marked(h)).toEqual([]);
    expect(claims(h)).toBe(0);
    h.releaseExits();
    await flushMicrotasks(20);
    expect(marked(h)).toEqual([]);
  });

  test("a settled line that held the exit's write gives it up and releases its claim", async () => {
    const { h, coordinator } = await exiting({ holdPresence: true });
    const ui = h.game.module.ui as any;
    expect(ui._line?.held.some((m: any) => m.method === "ui/write-image" && m.params.reportsExit)).toBe(true);
    expect(reportedHides(h)).toEqual([]);
    expect(claims(h)).toBe(1);
    (coordinator as any).showWhole();
    h.releasePresence();
    await flushMicrotasks(60);
    expect(reportedHides(h)).toEqual([]);
    expect(portraitHides(h).every((m: any) => m.params.instant)).toBe(true);
    expect(portraitHides(h).length).toBeGreaterThan(0);
    expect(marked(h)).toEqual([]);
    expect(claims(h)).toBe(0);
  });

  test("an abandoned line that held the exit's write gives it up, releases its claim and the next line hides the picture", async () => {
    const { h } = await exiting({ holdPresence: true });
    expect(claims(h)).toBe(1);
    await tick(new Coordinator(h.game, h.nextBeat()!));
    h.releasePresence();
    await flushMicrotasks(60);
    expect(reportedHides(h)).toEqual([]);
    expect(marked(h)).toEqual([]);
    expect(claims(h)).toBe(0);
  });

  test("a new line replacing the one that started the exit leaves no claim behind", async () => {
    const { h } = await exiting();
    await tick(new Coordinator(h.game, h.nextBeat()!));
    expect(marked(h)).toEqual([]);
    expect(claims(h)).toBe(0);
    h.releaseExits();
    await flushMicrotasks(20);
    expect(marked(h)).toEqual([]);
  });

  test("a reset during the exit leaves no claim", async () => {
    const { h } = await exiting();
    h.game.reset();
    await flushMicrotasks(40);
    expect(claims(h)).toBe(0);
  });

  test("a loaded save during the exit leaves no claim, and the mark follows the loaded screen", async () => {
    const { h, save } = await exiting();
    expect(h.game.load(save)).toBe(true);
    await h.reconnect();
    await flushMicrotasks(40);
    expect(claims(h)).toBe(0);
    expect(marked(h)).toEqual(h.game.module.ui.showingNames());
    h.releaseExits();
    await flushMicrotasks(20);
    expect(claims(h)).toBe(0);
    expect(marked(h)).toEqual(h.game.module.ui.showingNames());
  });

  test("a reconnect during the exit, with a player that never answers the write, leaves no claim", async () => {
    const { h } = await exiting();
    await h.reconnect();
    await flushMicrotasks(40);
    expect(claims(h)).toBe(0);
    expect(marked(h)).toEqual([]);
  });

  test("a player that never answers the write keeps the claim only until the next line clears the picture", async () => {
    const { h } = await exiting();
    await flushMicrotasks(200);
    expect(marked(h)).toEqual(["portrait"]);
    await tick(new Coordinator(h.game, h.nextBeat()!));
    expect(marked(h)).toEqual([]);
    expect(claims(h)).toBe(0);
  });

  test("a paused game keeps the picture marked until the player reports the exit", async () => {
    const { h } = await exiting();
    h.game.pause();
    await flushMicrotasks(40);
    expect(marked(h)).toEqual(["portrait"]);
    h.game.unpause();
    h.releaseExits();
    await flushMicrotasks(20);
    expect(marked(h)).toEqual([]);
    expect(claims(h)).toBe(0);
  });

  test("an instant display of the hide asks for no report and leaves no claim", async () => {
    const h = createHarness(SOURCE, 0, { reactive: true, autoOpenAll: false, holdExits: true, beforeConnect: live });
    await h.ready;
    await flushMicrotasks(10);
    h.jumpToFlow("start");
    await h.display(h.nextBeat()!, true);
    await flushMicrotasks(20);
    expect(marked(h)).toEqual(["portrait"]);
    await h.display(h.nextBeat()!, true);
    await flushMicrotasks(20);
    expect(reportedHides(h)).toEqual([]);
    expect(marked(h)).toEqual([]);
    expect(claims(h)).toBe(0);
  });

  test("a preview of the hide's line asks for no report and leaves no claim", async () => {
    const line = SOURCE.split("\n").findIndex((l) => l.includes("fadeout"));
    const h = createHarness(SOURCE, line, { reactive: true, autoOpenAll: false, holdExits: true });
    await h.ready;
    await h.preview(line);
    await flushMicrotasks(40);
    expect(reportedHides(h)).toEqual([]);
    expect(claims(h)).toBe(0);
    expect(marked(h)).not.toContain("portrait");
  });

  test("a claim from a superseded stream no longer counts", async () => {
    const { h } = await exiting();
    h.game.connection.beginEpoch();
    expect(h.game.module.ui.showingNames()).toEqual([]);
    expect(claims(h)).toBe(0);
  });

  test("a step back during the exit restores the shown picture and leaves no claim", async () => {
    const h = createHarness(SOURCE, 0, { reactive: true, autoOpenAll: false, holdExits: true, beforeConnect: live });
    await h.ready;
    await flushMicrotasks(10);
    const game = h.game as any;
    const run = async () => {
      for (let i = 0; i < 10; i += 1) {
        await flushMicrotasks(20);
        game._coordinator?.onUpdate({ deltaMS: 100 } as Clock);
      }
      await flushMicrotasks(30);
    };
    game.start();
    await run();
    expect(marked(h)).toEqual(["portrait"]);
    game.clickedToContinue();
    await run();
    expect(reportedHides(h)).toHaveLength(1);
    expect(claims(h)).toBe(1);
    const back = await game.rollBack("beat");
    await flushMicrotasks(40);
    expect(back.moved).toBe(true);
    expect(claims(h)).toBe(0);
    expect(marked(h)).toEqual(["portrait"]);
    h.releaseExits();
    await flushMicrotasks(20);
    expect(marked(h)).toEqual(["portrait"]);
  });
});
