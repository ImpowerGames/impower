// The engine composes each display and each played beat into one `ui/beat`
// (#1820): the page gets everything the beat changes on the screen in one
// message, and puts it up in one frame at the instant its text starts
// revealing. A host opts in with `composeBeats`, as the worker does.

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

const LAYOUT = `define HERO as character with
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
`;

const STORY = `${LAYOUT}
-> start

scene start
  HERO: The first line.

  HERO: The second line.
end
`;

const FONTS: File[] = [
  {
    uri: "file://proj/fancy.ttf",
    type: "font",
    name: "Fancy",
    ext: "ttf",
    src: "/file:/proj/fancy.ttf?v=1",
  } as File,
];

const hudStory = (directives: string) => `style hud with
  font_family = "Fancy"
end

layout hud with
  stats {
    text
  }
end

${LAYOUT}
-> start

scene start
  HERO:
    ${directives}
    The first line.
end
`;

const composing = (game: Game) => {
  game.context.system.composeBeats = true;
};

const playing = (game: Game) => {
  composing(game);
  game.context.system.previewing = undefined;
};

const tick = (deltaMS = 0) => ({ deltaMS }) as Clock;

const beats = (messages: any[]) =>
  messages.filter((m) => m.method === "ui/beat").map((m) => m.params);

/** Every op a beat carries, its batches opened. */
const opsOf = (beat: any) => flattenMessages(beat.messages);

const screenOps = (messages: any[]) =>
  flattenMessages(messages).filter(
    (m) => m.method?.startsWith("ui/") && m.method !== "ui/beat",
  );

async function play(h: ReturnType<typeof createHarness>, settle?: () => Promise<void>) {
  const beat = h.nextBeat();
  expect(beat).toBeTruthy();
  const coordinator = new Coordinator(h.game, beat!);
  for (let i = 0; i < 10; i += 1) {
    await (settle ? settle() : flushMicrotasks());
    coordinator.onUpdate(tick());
  }
  await (settle ? settle() : flushMicrotasks(10));
}

/** Answer the held font loads until none is left. */
async function releaseFonts(h: ReturnType<typeof createHarness>) {
  for (let i = 0; i < 5; i += 1) {
    h.releaseAssets();
    await flushMicrotasks(20);
  }
}

describe("a composed display (#1820)", () => {
  test("a preview's display reaches the page as one beat, at its sweep", async () => {
    const h = createHarness(STORY, 0, { beforeConnect: composing });
    await h.ready;
    // Connected, restored: nothing has reached the page's screen yet.
    expect(screenOps(h.messages)).toEqual([]);
    expect(beats(h.messages)).toEqual([]);

    h.game.module.ui.sweepReconcile();
    await flushMicrotasks(10);

    const [beat, ...more] = beats(h.messages);
    expect(more).toEqual([]);
    expect(beat.sweep).toBe(true);
    expect(beat.time).toBeUndefined();
    // The pass opens first, and the screen is built inside the beat.
    expect(beat.messages[0].method).toBe("ui/reconcile-begin");
    expect(opsOf(beat).some((m: any) => m.method === "ui/create")).toBe(true);
    // The targets the display leaves empty are explicit empties.
    const dialogue = beat.text.find((e: any) => e.target === "dialogue");
    expect(dialogue).toMatchObject({ target: "dialogue", replace: true, writes: [] });
    expect(screenOps(h.messages)).toEqual([]);
  });

  test("a played beat reaches the page as one beat, stamped with its start", async () => {
    const h = createHarness(STORY, 0, { beforeConnect: playing });
    await h.ready;
    h.jumpToFlow("start");
    h.reset();

    await play(h);

    const [beat, ...more] = beats(h.messages);
    expect(more).toEqual([]);
    expect(typeof beat.time).toBe("number");
    const byTarget: any = Object.fromEntries(beat.text.map((e: any) => [e.target, e]));
    expect(byTarget.dialogue.replace).toBe(true);
    expect(byTarget.dialogue.writes).toHaveLength(1);
    expect(byTarget.character_name.replace).toBe(true);
    expect(byTarget.character_name.writes).toHaveLength(1);
    // Nothing of the beat went to the page as it happened.
    expect(screenOps(h.messages)).toEqual([]);
  });

  test("a target cleared, written, cleared and written again holds only its last write", async () => {
    // Round 6, class 1: impossible by construction. The beat carries each
    // target's final content, so no clear is judged against what the target
    // showed before the beat.
    const h = createHarness(STORY, 0, { beforeConnect: composing });
    await h.ready;
    const ui = h.game.module.ui;
    void ui.text.clear("dialogue");
    void ui.text.write("dialogue", [{ text: "B" } as any], true);
    void ui.text.clear("dialogue");
    void ui.text.write("dialogue", [{ text: "A" } as any], true);
    ui.sweepReconcile();
    await flushMicrotasks(10);

    const [beat] = beats(h.messages);
    const dialogue = beat.text.find((e: any) => e.target === "dialogue");
    expect(dialogue.replace).toBe(true);
    expect(dialogue.writes.map((w: any) => w.instructions)).toEqual([
      [{ text: "A" }],
    ]);
  });

  test("a display a newer connect takes over never reaches the page, PLAY's included", async () => {
    // Round 7, class 2: impossible by construction. An abandoned display's
    // composition is dropped by the next connect, so PLAY's connect has
    // nothing of it to put up.
    const h = createHarness(STORY, 0, { beforeConnect: composing });
    await h.ready;
    void h.game.module.ui.text.write("dialogue", [{ text: "ABANDONED" } as any], true);
    await flushMicrotasks(10);

    h.game.context.system.previewing = undefined;
    await h.reconnect();
    await flushMicrotasks(20);

    expect(JSON.stringify(h.messages)).not.toContain("ABANDONED");
    // PLAY's connect builds its screen as it goes.
    expect(screenOps(h.messages).some((m) => m.method === "ui/create")).toBe(true);
  });
});

describe("a composed beat that opens a layout whose font is loading (#1820)", () => {
  test("waits for the layout's mount and carries it", async () => {
    // Round 6, class 3.
    const h = createHarness(hudStory("[[open hud]]"), 0, {
      assets: FONTS,
      holdAssets: true,
      autoOpenAll: false,
      beforeConnect: playing,
    });
    await h.ready;
    h.jumpToFlow("start");
    h.reset();

    await play(h, async () => {
      await flushMicrotasks(20);
    });
    expect(beats(h.messages)).toEqual([]);

    await releaseFonts(h);

    const [beat, ...more] = beats(h.messages);
    expect(more).toEqual([]);
    expect(opsOf(beat).some((m: any) => m.method === "ui/create" && m.params.name === "hud")).toBe(true);
    expect(beat.text.some((e: any) => e.target === "dialogue" && e.writes.length > 0)).toBe(true);
    expect(screenOps(h.messages)).toEqual([]);
  });

  test("waits for a mount a directive before it holds back", async () => {
    // Round 7, class 4: `[[close hud]]` runs first, and only then does the
    // open start waiting for the font.
    const h = createHarness(hudStory("[[close hud]] [[open hud]]"), 0, {
      assets: FONTS,
      holdAssets: true,
      autoOpenAll: false,
      beforeConnect: playing,
    });
    await h.ready;
    h.jumpToFlow("start");
    h.reset();

    await play(h, async () => {
      await flushMicrotasks(20);
    });
    await releaseFonts(h);

    const [beat] = beats(h.messages);
    expect(beat).toBeTruthy();
    expect(opsOf(beat).some((m: any) => m.method === "ui/create" && m.params.name === "hud")).toBe(true);
    expect(screenOps(h.messages).some((m) => m.params?.name === "hud")).toBe(false);
  });

  test("makes no mount once a newer connect has begun", async () => {
    // Round 7, class 5: the mount, superseded while it waited for its font,
    // must not write into the newer stream.
    const h = createHarness(hudStory("[[open hud]]"), 0, {
      assets: FONTS,
      holdAssets: true,
      autoOpenAll: false,
      beforeConnect: playing,
    });
    await h.ready;
    h.jumpToFlow("start");
    // A checkpoint from before the beat opens the layout.
    const before = h.game.save() as string;
    const beat = h.nextBeat();
    const coordinator = new Coordinator(h.game, beat!);
    for (let i = 0; i < 10; i += 1) {
      await flushMicrotasks(20);
      coordinator.onUpdate(tick());
    }
    // A newer connect to that checkpoint begins while the beat's layout
    // waits for its font.
    h.game.load(before);
    void h.reconnect();
    await flushMicrotasks(20);
    const mark = h.messages.length;
    await releaseFonts(h);

    const after = h.messages.slice(mark);
    const ops = [
      ...screenOps(after),
      ...beats(after).flatMap((b) => opsOf(b)),
    ];
    expect(ops.some((m) => m.method === "ui/create" && m.params?.name === "hud")).toBe(false);
  });
});

const SPRITE: File = {
  uri: "file://proj/sprite.png",
  type: "image",
  name: "SPRITE",
  ext: "png",
  src: "/file:/proj/sprite.png?v=1",
} as File;

describe("composition, round 1 of PR #1865", () => {
  test("a mount an abandoned display left waiting does not hold a newer display back", async () => {
    // A beat opens a layout whose font is held; a newer preview, connected
    // to a checkpoint from before it, sweeps a display with no layouts.
    const h = createHarness(hudStory("[[open hud]]"), 0, {
      assets: FONTS,
      holdAssets: true,
      autoOpenAll: false,
      beforeConnect: playing,
    });
    await h.ready;
    h.jumpToFlow("start");
    const before = h.game.save() as string;
    const beat = h.nextBeat();
    const coordinator = new Coordinator(h.game, beat!);
    for (let i = 0; i < 10; i += 1) {
      await flushMicrotasks(20);
      coordinator.onUpdate(tick());
    }
    h.game.load(before);
    h.game.context.system.previewing = true;
    void h.reconnect();
    await flushMicrotasks(40);
    const mark = h.messages.length;

    h.game.module.ui.sweepReconcile();
    await flushMicrotasks(40);

    // The newer display goes up although the old font is still held.
    expect(beats(h.messages.slice(mark)).filter((b) => b.sweep)).toHaveLength(1);
  });

  test("a played beat that starts while the last one waits on what it realizes gets a beat of its own", async () => {
    // The last beat waits on work that has not settled (a layout's font);
    // the next beat starts. The last goes as it is, and the next is sent on
    // its own, with its own writes.
    const h = createHarness(STORY, 0, { beforeConnect: playing });
    await h.ready;
    h.reset();
    const ui: any = h.game.module.ui;
    expect(ui.beginCompose()).toBe(true);
    void ui.text.write("dialogue", [{ text: "First" }], true);
    ui.composeWait(new Promise(() => {}));
    void ui.endCompose({ time: 100 });
    await flushMicrotasks(20);
    expect(beats(h.messages)).toEqual([]);

    expect(ui.beginCompose()).toBe(true);
    void ui.text.write("dialogue", [{ text: "Second" }], true);
    void ui.endCompose({ time: 200 });
    await flushMicrotasks(20);

    const sent = beats(h.messages);
    expect(sent.map((b: any) => b.time)).toEqual([100, 200]);
    const texts = sent.map((b: any) =>
      b.text.flatMap((e: any) => e.writes.flatMap((w: any) => w.instructions.map((i: any) => i.text))),
    );
    expect(texts).toEqual([["First"], ["Second"]]);
  });

  test("a played beat's pictures are let go only once its beat has gone to the page", async () => {
    const h = createHarness(
      `define SPRITE as image with\n  src = "${SPRITE.src}"\nend\n\n${STORY.replace("  HERO: The first line.", "  HERO:\n    [[show portrait SPRITE]]\n    The first line.")}`,
      0,
      { assets: [SPRITE], beforeConnect: playing },
    );
    await h.ready;
    h.jumpToFlow("start");
    h.reset();

    await play(h);

    const beatAt = h.messages.findIndex((m) => m.method === "ui/beat");
    const releases = h.messages
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.method === "assets/release" && (m.params?.pins ?? []).some((p: string) => p.startsWith("beat:")));
    expect(beatAt).toBeGreaterThan(-1);
    expect(releases.length).toBeGreaterThan(0);
    expect(releases.every(({ i }) => i > beatAt)).toBe(true);
  });

  test("a beat does not wait for an animation already playing on the page", async () => {
    // SEAM(#1820 layout transitions): a layout operation that only waits on
    // an exit animation playing on the page does not hold the beat.
    const h = createHarness(STORY, 0, { beforeConnect: playing });
    await h.ready;
    h.reset();
    const ui: any = h.game.module.ui;
    expect(ui.beginCompose()).toBe(true);
    void ui.text.write("dialogue", [{ text: "New" }], true);
    // Work that never settles, already waiting on an animation when the
    // beat ends.
    ui._animating = 1;
    ui.composeWait(new Promise(() => {}));
    void ui.endCompose({});
    await flushMicrotasks(20);
    ui._animating = 0;

    expect(beats(h.messages)).toHaveLength(1);
  });

  test("a beat that waits on nothing leaves no subscription behind", async () => {
    const h = createHarness(STORY, 0, { beforeConnect: playing });
    await h.ready;
    h.jumpToFlow("start");
    await play(h);
    await play(h);

    const ui: any = h.game.module.ui;
    // Neither a pending change signal nor a list of listeners is left.
    expect(ui._realizationChange).toBeUndefined();
    expect(ui._realizationListeners?.length ?? 0).toBe(0);
  });
});
