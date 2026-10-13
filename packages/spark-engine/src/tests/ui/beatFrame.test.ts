// A beat changes the screen in one frame (#1820): the game brackets what the
// beat sends between a `ui/frame` open and its close, so the page can put the
// beat's clears and rewrites up together, and a preview's reconcile pass asks
// the page to hold the whole display until its sweep.

import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { describe, expect, test } from "vitest";
import { type Clock } from "../../game/core/classes/Clock";
import { Coordinator } from "../../game/core/classes/Coordinator";
import { type Game } from "../../game/core/classes/Game";
import {
  createHarness,
  flattenMessages,
  flushMicrotasks,
} from "./harness/uiTestHarness";

const STORY = `define HERO as character with
  name = "HERO"
end

layout main with
  textbox {
    character_info {
      character_name {
        text
      }
    }
    dialogue {
      text
    }
  }
end

-> start

scene start
  HERO: The first line.

  HERO: The second line.
end
`;

const playing = (game: Game) => {
  game.context.system.previewing = undefined;
};

const tick = (deltaMS = 0) => ({ deltaMS }) as Clock;

const isWrite = (m: any) =>
  m.method === "ui/write-text" || m.method === "ui/write-image";

/** The beat's messages: where its frame opens and closes, and its writes. */
function framesOf(messages: any[]) {
  const flat = flattenMessages(messages);
  const at = (open: boolean) =>
    flat.flatMap((m, i) =>
      m.method === "ui/frame" && m.params.open === open ? [i] : [],
    );
  const writes = flat.flatMap((m, i) => (isWrite(m) ? [i] : []));
  return { flat, opens: at(true), closes: at(false), writes };
}

/** Play the next beat until it has gone up on the page. */
async function playNextBeat(h: ReturnType<typeof createHarness>) {
  const beat = h.nextBeat();
  expect(beat).toBeTruthy();
  const coordinator = new Coordinator(h.game, beat!);
  for (let i = 0; i < 10; i += 1) {
    await flushMicrotasks();
    coordinator.onUpdate(tick());
  }
  await flushMicrotasks(10);
}

describe("a beat goes up in one frame (#1820)", () => {
  test("a played beat sends its clears and its writes between one frame's open and its close", async () => {
    const h = createHarness(STORY, 0, { beforeConnect: playing });
    await h.ready;
    h.jumpToFlow("start");
    h.reset();

    await playNextBeat(h);

    const { flat, opens, closes, writes } = framesOf(h.messages);
    expect(opens).toHaveLength(1);
    expect(closes).toHaveLength(1);
    const [open, close] = [opens[0]!, closes[0]!];
    expect(open).toBeLessThan(close);
    // The clears go with it: an empty write of the name and of the box.
    const cleared = flat
      .slice(open, close)
      .filter((m) => isWrite(m) && m.params.instructions.length === 0)
      .map((m) => m.params.target);
    expect(cleared).toEqual(
      expect.arrayContaining(["character_name", "dialogue"]),
    );
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every((i) => i > open && i < close)).toBe(true);
  });

  test("the next played beat clears and rewrites the name inside a frame of its own", async () => {
    const h = createHarness(STORY, 0, { beforeConnect: playing });
    await h.ready;
    h.jumpToFlow("start");
    await playNextBeat(h);
    h.reset();

    await playNextBeat(h);

    const { flat, opens, closes, writes } = framesOf(h.messages);
    expect(opens).toHaveLength(1);
    expect(closes).toHaveLength(1);
    const inside = flat.slice(opens[0]!, closes[0]!);
    const names = inside.filter(
      (m) => isWrite(m) && m.params.target === "character_name",
    );
    // Cleared, then written with the same name: the page applies them in
    // one task, and the signature check leaves the name as it was.
    const written = names.map((m) => m.params.instructions.length > 0);
    expect(written.length).toBeGreaterThan(1);
    expect(written.at(-1)).toBe(true);
    expect(written.slice(0, -1).every((w) => !w)).toBe(true);
    expect(writes.every((i) => i > opens[0]! && i < closes[0]!)).toBe(true);
  });

  test("a previewed beat goes up in a frame too", async () => {
    const h = createHarness(STORY, 0);
    await h.ready;
    h.jumpToFlow("start");
    h.reset();
    const beat = h.nextBeat();
    new Coordinator(h.game, { ...beat!, end: 0 });
    await flushMicrotasks(10);

    const { opens, closes, writes } = framesOf(h.messages);
    expect(opens).toHaveLength(1);
    expect(closes).toHaveLength(1);
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every((i) => i > opens[0]! && i < closes[0]!)).toBe(true);
  });

  test("a preview's reconcile pass asks the page to hold it, and PLAY's does not", async () => {
    const begin = async (beforeConnect?: (game: Game) => void) => {
      const h = createHarness(STORY, 0, { beforeConnect });
      await h.ready;
      return flattenMessages(h.messages).find(
        (m) => m.method === "ui/reconcile-begin",
      );
    };
    expect((await begin())?.params).toEqual({ hold: true });
    expect((await begin(playing))?.params ?? {}).toEqual({});
  });
});

const FONTS: File[] = [
  {
    uri: "file://proj/fancy.ttf",
    type: "font",
    name: "Fancy",
    ext: "ttf",
    src: "/file:/proj/fancy.ttf?v=1",
  } as File,
];

const HUD_STORY = `style hud with
  font_family = "Fancy"
end

layout hud with
  stats {
    text
  }
end

${STORY.replace("  HERO: The first line.", "  [[open hud]]\n  HERO: The first line.")}`;

/** Answer the held font loads until none is left. */
async function releaseFonts(h: ReturnType<typeof createHarness>) {
  for (let i = 0; i < 5; i += 1) {
    h.releaseAssets();
    await flushMicrotasks(20);
  }
}

describe("a beat that opens a layout whose font is loading (#1820)", () => {
  test("puts the layout up in the same frame as the rest of the beat", async () => {
    const h = createHarness(HUD_STORY, 0, {
      assets: FONTS,
      holdAssets: true,
      autoOpenAll: false,
      beforeConnect: playing,
    });
    await h.ready;
    h.jumpToFlow("start");
    h.reset();
    const beat = h.nextBeat();
    expect(beat?.layout).toBeTruthy();
    const coordinator = new Coordinator(h.game, beat!);
    for (let i = 0; i < 10; i += 1) {
      await releaseFonts(h);
      coordinator.onUpdate(tick());
    }
    await releaseFonts(h);

    const { flat, opens, closes } = framesOf(h.messages);
    const hud = flat.findIndex(
      (m) => m.method === "ui/create" && m.params.name === "hud",
    );
    expect(hud).toBeGreaterThan(-1);
    expect(opens).toHaveLength(1);
    expect(closes).toHaveLength(1);
    expect(hud).toBeGreaterThan(opens[0]!);
    expect(hud).toBeLessThan(closes[0]!);
  });

  test("closes no frame of a newer connect once the font arrives", async () => {
    const h = createHarness(HUD_STORY, 0, {
      assets: FONTS,
      holdAssets: true,
      autoOpenAll: false,
      beforeConnect: playing,
    });
    await h.ready;
    h.jumpToFlow("start");
    const beat = h.nextBeat();
    const coordinator = new Coordinator(h.game, beat!);
    for (let i = 0; i < 10 && !framesOf(h.messages).opens.length; i += 1) {
      await flushMicrotasks(20);
      coordinator.onUpdate(tick());
    }
    expect(framesOf(h.messages).opens.length).toBeGreaterThan(0);
    // A newer connect begins while the beat's layout waits for its font.
    void h.reconnect();
    await flushMicrotasks(20);
    const mark = h.messages.length;
    await releaseFonts(h);

    const after = flattenMessages(h.messages.slice(mark));
    expect(
      after.filter((m) => m.method === "ui/frame" && m.params.open === false),
    ).toEqual([]);
  });
});
