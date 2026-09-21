// A route replay runs every beat between the top of the scene and the target
// in one synchronous turn. Nothing displays those beats, so the UI operations
// they would produce must not be buffered: a game that connects after the
// replay displays exactly what a fresh game loaded from the replay's
// checkpoint displays, and a connected game reports nothing for the search.

import { describe, expect, test } from "vitest";
import { Game } from "../../game/core/classes/Game";
import {
  createHarness,
  flushMicrotasks,
  flattenMessages,
  MAIN_URI,
  normalizeMessages,
} from "../ui/harness/uiTestHarness";

// Dialogue, so each replayed beat would start the typewriter.
const BEATS = Array.from(
  { length: 40 },
  (_, i) => `  HERO:\n  Line number ${i}.\n`,
);

const SOURCE = `-> start

scene start
${BEATS.join("\n")}
  The target line.
end
`;

const TARGET_LINE = SOURCE.split("\n").findIndex((l) =>
  l.includes("The target line."),
);

function bufferedOps(game: any): number {
  return (game.module.ui as any)._uiBatch.length;
}

describe("a simulated route buffers no UI operation", { timeout: 30_000 }, () => {
  test("the replay of a long scene leaves nothing in the UI buffer", () => {
    const h = createHarness(SOURCE, 0, { connect: false });
    const game: any = h.game;
    const before = bufferedOps(game);
    game.setStartFrom({ file: MAIN_URI, line: TARGET_LINE });
    game.simulate();
    expect(game.simulation).toBe("success");
    expect(bufferedOps(game)).toBe(before);
  });

  test("a connect in the same turn sends what a fresh game loaded from the checkpoint sends", async () => {
    const routed = createHarness(SOURCE, 0, { connect: false });
    const game: any = routed.game;
    game.setStartFrom({ file: MAIN_URI, line: TARGET_LINE });
    game.simulate();
    const checkpoint = game.save() as string;
    game.endSimulation();
    await routed.reconnect();
    await flushMicrotasks(10);

    const fresh = createHarness(SOURCE, 0, { connect: false });
    fresh.game.setStartFrom({ file: MAIN_URI, line: TARGET_LINE });
    fresh.game.load(checkpoint);
    await fresh.reconnect();
    await flushMicrotasks(10);

    expect(routed.messages.length).toBeGreaterThan(0);
    expect(normalizeMessages(routed.messages)).toEqual(
      normalizeMessages(fresh.messages),
    );

    // And the preview that follows displays the same beat the same way,
    // stopping no sound the replay never played.
    routed.reset();
    fresh.reset();
    await routed.preview(TARGET_LINE);
    await fresh.preview(TARGET_LINE);
    await flushMicrotasks(10);
    expect(
      flattenMessages(routed.messages).some((m) => m.method === "ui/write-text"),
    ).toBe(true);
    expect(normalizeMessages(routed.messages)).toEqual(
      normalizeMessages(fresh.messages),
    );
  });

  test("a connected game sends nothing for a route search", async () => {
    const h = createHarness(SOURCE, 0);
    await h.ready;
    h.reset();
    const game: any = h.game;
    game.setStartFrom({ file: MAIN_URI, line: TARGET_LINE });
    game.simulate();
    expect(game.simulation).toBe("success");
    await flushMicrotasks(10);
    expect(flattenMessages(h.messages).map((m) => m.method)).toEqual([]);
  });

  test("a game marked as previewing saves the checkpoint an unmarked game saves", () => {
    const search = (mark: boolean) => {
      const h = createHarness(SOURCE, 0, {
        connect: false,
        beforeConnect: (g) => {
          (g.context.system as any).previewing = undefined;
        },
      });
      const game: any = h.game;
      if (mark) {
        game.markPreviewing("start");
      }
      game.setStartFrom({ file: MAIN_URI, line: TARGET_LINE });
      game.simulate();
      expect(game.context.system.previewing).toBe(mark ? "start" : undefined);
      // The module state; the story's random seed differs between any two
      // games.
      return JSON.parse(game.save() as string).modules;
    };
    const marked = search(true);
    expect(marked.ui.style.continue_indicator).toBeDefined();
    expect(marked).toEqual(search(false));
  });

  test("a game built without a preview point previews as a game built with one", async () => {
    const h = createHarness(SOURCE, 0, {
      connect: false,
      beforeConnect: (g) => {
        (g as any)._state = "initial";
      },
    });
    await h.reconnect();
    expect(h.game.state).toBe("initial");
    await h.preview(TARGET_LINE);
    expect(h.game.state).toBe("previewing");
  });

  test("a replay that resumes from a checkpoint saves the audio a fresh replay saves", () => {
    const filler = (from: number, n: number) =>
      Array.from({ length: n }, (_, i) => `  Line ${from + i}.`).join("\n");
    const source = `define first_theme as audio with
  src = "https://example.com/first.wav"
end

define second_theme as audio with
  src = "https://example.com/second.wav"
end

-> start

scene start
  ((play music first_theme))
${filler(0, 40)}
  The first stop.
${filler(40, 40)}
  ((play music second_theme))
${filler(80, 20)}
  The second stop.
end
`;
    const lineOf = (text: string) =>
      source.split("\n").findIndex((l) => l.includes(text));
    const planTo = (game: any, line: number) => {
      game.setStartFrom({ file: MAIN_URI, line });
      const toPath = game.startPath as string;
      return Game.planRoute(
        game.story,
        game.program,
        Game.getSimulateFromPath(toPath),
        toPath,
      )!;
    };
    const looping = (game: any) =>
      JSON.parse(game.save() as string).modules.audio;

    const resumed: any = createHarness(source, 0, { connect: false }).game;
    resumed.patchAndSimulateRoute(planTo(resumed, lineOf("The first stop.")));
    let loads = 0;
    const realLoad = resumed.load.bind(resumed);
    resumed.load = (...args: unknown[]) => {
      loads += 1;
      return realLoad(...args);
    };
    resumed.patchAndSimulateRoute(planTo(resumed, lineOf("The second stop.")));
    expect(loads).toBe(1);

    const fresh: any = createHarness(source, 0, { connect: false }).game;
    fresh.patchAndSimulateRoute(planTo(fresh, lineOf("The second stop.")));

    expect(looping(fresh).channels.music.looping.map((s: any) => s.key)).toEqual(
      ["audio.second_theme"],
    );
    expect(looping(resumed)).toEqual(looping(fresh));
  });

  test("a replay that resumes backward from a checkpoint saves the audio a fresh replay saves", () => {
    const filler = (from: number, n: number) =>
      Array.from({ length: n }, (_, i) => `  Line ${from + i}.`).join("\n");
    const source = `define first_theme as audio with
  src = "https://example.com/first.wav"
end

define second_theme as audio with
  src = "https://example.com/second.wav"
end

-> start

scene start
  ((play music first_theme))
${filler(0, 40)}
  ((stop music))
  The music stops.
  The earlier stop.
${filler(50, 30)}
  ((play music second_theme))
${filler(80, 20)}
  The later stop.
end
`;
    const lineOf = (text: string) =>
      source.split("\n").findIndex((l) => l.includes(text));
    const planTo = (game: any, line: number) => {
      game.setStartFrom({ file: MAIN_URI, line });
      const toPath = game.startPath as string;
      return Game.planRoute(
        game.story,
        game.program,
        Game.getSimulateFromPath(toPath),
        toPath,
      )!;
    };
    const audio = (game: any) => JSON.parse(game.save() as string).modules.audio;

    const resumed: any = createHarness(source, 0, { connect: false }).game;
    resumed.patchAndSimulateRoute(planTo(resumed, lineOf("The later stop.")));
    let loads = 0;
    const realLoad = resumed.load.bind(resumed);
    resumed.load = (...args: unknown[]) => {
      loads += 1;
      return realLoad(...args);
    };
    resumed.patchAndSimulateRoute(planTo(resumed, lineOf("The earlier stop.")));
    expect(loads).toBe(1);

    const fresh: any = createHarness(source, 0, { connect: false }).game;
    fresh.patchAndSimulateRoute(planTo(fresh, lineOf("The earlier stop.")));

    expect(audio(fresh).channels?.music?.looping ?? []).toEqual([]);
    expect(audio(resumed)).toEqual(audio(fresh));
  });

  test("a connected game sends nothing for a route that closes and reopens a layout", async () => {
    const source = `layout hud with
  text "HUD"
end

-> start

scene start
  [[open hud]]
${BEATS.slice(0, 5).join("\n")}
  [[close hud with fade over 0.5s]] [[open hud with fade over 0.5s]]
  The line after the hud.
end
`;
    const h = createHarness(source, 0, { autoOpenAll: false });
    await h.ready;
    h.reset();
    const game: any = h.game;
    game.setStartFrom({
      file: MAIN_URI,
      line: source.split("\n").findIndex((l) => l.includes("after the hud")),
    });
    game.simulate();
    expect(game.simulation).toBe("success");
    await flushMicrotasks(20);
    expect(flattenMessages(h.messages).map((m) => m.method)).toEqual([]);
    expect(
      JSON.parse(game.save() as string).modules.ui.layout?.map(
        (l: any) => l.name,
      ),
    ).toContain("hud");
  });

  test("a connected game sends nothing for a route through an animated layout", async () => {
    const source = `layout hud with
  text "HUD"
end

-> start

scene start
${BEATS.slice(0, 10).join("\n")}
  [[open hud with fade over 0.5s]]
  The line after the hud.
end
`;
    const h = createHarness(source, 0, { autoOpenAll: false });
    await h.ready;
    h.reset();
    const game: any = h.game;
    game.setStartFrom({
      file: MAIN_URI,
      line: source.split("\n").findIndex((l) => l.includes("after the hud")),
    });
    game.simulate();
    expect(game.simulation).toBe("success");
    await flushMicrotasks(10);
    expect(flattenMessages(h.messages).map((m) => m.method)).toEqual([]);
    expect(
      JSON.parse(game.save() as string).modules.ui.layout?.map(
        (l: any) => l.name,
      ),
    ).toContain("hud");
  });

  test("ending the simulation clears the flag the replay set", () => {
    const h = createHarness(SOURCE, 0, { connect: false });
    const game: any = h.game;
    game.setStartFrom({ file: MAIN_URI, line: TARGET_LINE });
    game.simulate();
    expect(game.context.system.simulating).toBeTruthy();
    game.endSimulation();
    expect(game.context.system.simulating).toBeUndefined();
    expect(game.simulation).toBe("success");
  });
});

// A route replayed from the top of its scene saves the checkpoint a game that
// has never run saves (#680). The player's worker routes on the game that also
// displays the preview when it displays from its own game, so the same route
// through the same program follows a displayed preview as often as it follows
// another route; neither may leave anything in the checkpoints it saves.
describe("a route replayed from the top of its scene", { timeout: 30_000 }, () => {
  // The target is the scene's first beat, so the replay reaches it before any
  // beat of its own displays and sets nothing over what came before it.
  const SHORT = `-> start

scene start
  HERO:
  The first line.

  HERO:
  The second line.
end
`;
  const lineOf = (text: string) =>
    SHORT.split("\n").findIndex((l) => l.includes(text));
  const FIRST = lineOf("The first line.");
  const SECOND = lineOf("The second line.");

  /** The module state a route to `line` saves, on a game that has done
   *  `before` first. The story's random seed differs between any two games,
   *  so the modules are what is compared. */
  const routed = async (line: number, before?: (h: any) => Promise<void>) => {
    const h = createHarness(SHORT, 0);
    await h.ready;
    await before?.(h);
    const game: any = h.game;
    game.setStartFrom({ file: MAIN_URI, line });
    game.simulate();
    expect(game.simulation).toBe("success");
    return JSON.parse(game.save() as string).modules;
  };

  test("saves what a fresh game saves after the game displayed a preview", async () => {
    // The preview's beat sets the continue indicator as a preview shows it.
    const afterDisplay = await routed(FIRST, async (h) => {
      await h.preview(SECOND);
      await flushMicrotasks(10);
    });
    expect(afterDisplay).toEqual(await routed(FIRST));
  });

  test("saves what a fresh game saves after the game replayed another route", async () => {
    // That route ends on its target beat without displaying it, which leaves
    // the beat queued.
    const afterRoute = await routed(FIRST, async (h) => {
      h.game.setStartFrom({ file: MAIN_URI, line: FIRST });
      h.game.simulate();
    });
    expect(afterRoute).toEqual(await routed(FIRST));
  });
});
