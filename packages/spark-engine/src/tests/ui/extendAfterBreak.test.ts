// A `..` on each side of a `>` break waits for a click and then carries on in
// the same box. The continuation's beat shows the box's text again at once, then types
// only its own; it keeps the name and parenthetical unless it brings its own,
// keeps the portrait unless it shows another, and keeps the sound and voice the
// first part started. The box is part of the interpreter's saved state, so a
// checkpoint between the two parts, the preview of a continuation line and
// PLAY from one all show the whole box.

import { describe, expect, test, vi } from "vitest";
import { Coordinator } from "../../game/core/classes/Coordinator";
import type { Game } from "../../game/core/classes/Game";
import type { Instructions } from "../../game/core/types/Instructions";
import {
  createHarness,
  flattenMessages,
  flushMicrotasks,
  MAIN_URI,
  type UIHarness,
} from "./harness/uiTestHarness";

const DEFS = `define HERO as character with
  name = "HERO"
end

define ALICE as character with
  name = "ALICE"
end

define BOB as character with
  name = "BOB"
end

define a as image with
  src = "https://example.com/a.png"
end

define b as image with
  src = "https://example.com/b.png"
end

layout main with
  stage:
    portrait:
      image
  textbox:
    character_info:
      character_name:
        text
      character_parenthetical:
        text
    dialogue:
      text
    action:
      text
end
`;

function story(body: string) {
  return `${DEFS}\n-> start\n\nscene start\n${body}\nend\n`;
}

/** Every character a beat shows in its body, leaving out the cue. */
const shown = (beat: Instructions | undefined): string =>
  Object.entries(beat?.text ?? {})
    .filter(([target]) => !target.startsWith("character_"))
    .flatMap(([, events]) => events)
    .map((event) => event.text ?? "")
    .join("");

/** The text a beat shows on one target. */
const on = (beat: Instructions | undefined, target: string): string =>
  (beat?.text?.[target] ?? []).map((event) => event.text ?? "").join("");

async function beatsOf(body: string, count: number) {
  const harness = createHarness(story(body));
  await harness.ready;
  harness.jumpTo("start");
  const beats: (Instructions | undefined)[] = [];
  for (let i = 0; i < count; i++) beats.push(harness.nextBeat());
  return { harness, beats };
}

/** How many typing-sound tones a beat plays. */
const tones = (beat: Instructions | undefined): number =>
  (beat?.audio?.["typewriter"] ?? [])
    .flatMap((event) => event.assets ?? [])
    .reduce((count, key) => count + key.split("~t").length - 1, 0);

/** The `ui/write-text` messages sent to `target`. */
const writesTo = (harness: UIHarness, target: string) =>
  flattenMessages(harness.messages).filter(
    (m) => m.method === "ui/write-text" && m.params.target === target,
  );

describe("a `..` on each side of a break carries on in the box", () => {
  test("`First .. > .. second.` shows First, then First second.", async () => {
    const { beats } = await beatsOf(`  First .. > .. second.`, 2);
    expect(beats.map(shown)).toEqual(["First", "First second."]);
    expect(beats[0]?.extended).toBeUndefined();
    expect(beats[1]?.extended).toEqual({ action: "First ".length });
  });

  test("`Abso.. >` then `..lutely!` shows Absolutely!", async () => {
    const { beats } = await beatsOf(`  Abso.. >\n  ..lutely!`, 2);
    expect(beats.map(shown)).toEqual(["Abso", "Absolutely!"]);
  });

  test("a chain of three adds to the box at each click", async () => {
    const { beats } = await beatsOf(`  One .. > .. two .. > .. three.\n  After.`, 4);
    expect(beats.map(shown)).toEqual([
      "One",
      "One two",
      "One two three.",
      "After.",
    ]);
    expect(beats[3]?.extended).toBeUndefined();
  });

  test("a continuation with a cue names the new speaker over the whole box", async () => {
    const { beats } = await beatsOf(
      `  ???: Hello... .. >\n  ALICE: .. It's me.`,
      2,
    );
    expect(on(beats[0], "character_name")).toBe("???");
    expect(on(beats[0], "dialogue")).toBe("Hello...");
    expect(on(beats[1], "character_name")).toBe("ALICE");
    expect(on(beats[1], "dialogue")).toBe("Hello... It's me.");
    // The new name is shown with the beat, not kept from the box.
    expect(beats[1]?.extended?.["character_name"]).toBeUndefined();
  });

  test("a continuation without a cue keeps the name", async () => {
    const { beats } = await beatsOf(`  HERO: Hold .. >\n  .. on tight.`, 2);
    expect(on(beats[1], "character_name")).toBe("HERO");
    expect(on(beats[1], "dialogue")).toBe("Hold on tight.");
    expect(beats[1]?.extended).toEqual({
      dialogue: "Hold ".length,
      character_name: 1,
    });
  });

  test("a parenthetical on a line of its own replaces the one shown", async () => {
    const { beats } = await beatsOf(
      `  HERO:\n    Quiet .. >\n    .. (louder)\n    now!`,
      2,
    );
    expect(on(beats[0], "character_parenthetical")).toBe("");
    expect(on(beats[1], "character_parenthetical")).toBe("(louder)");
    expect(on(beats[1], "dialogue")).toBe("Quiet now!");
  });

  test("an action box extended by a cue gets the text and no name, typed as the speaker", async () => {
    const { beats } = await beatsOf(`  Knock .. >\n  BOB: .. Who's there?`, 2);
    expect(on(beats[1], "action")).toBe("Knock Who's there?");
    expect(beats[1]?.text?.["character_name"]).toBeUndefined();
    expect(beats[1]?.text?.["dialogue"]).toBeUndefined();
    // The typing sound is the one BOB's own line plays, not the action's.
    const synth = (beat: Instructions | undefined) =>
      beat?.audio?.["typewriter"]?.[0]?.assets?.[0]?.split("~")[0];
    const bob = await beatsOf(`  BOB: Who's there?`, 1);
    const action = await beatsOf(`  Who's there?`, 1);
    expect(synth(bob.beats[0])).not.toBe(synth(action.beats[0]));
    expect(synth(beats[1])).toBe(synth(bob.beats[0]));
  });

  test("a mark on one side only starts a new box", async () => {
    for (const body of [`  HERO: A .. >\n  BOB: B`, `  HERO: A >\n  BOB: .. B`]) {
      const { beats } = await beatsOf(body, 2);
      expect(on(beats[1], "character_name"), body).toBe("BOB");
      expect(on(beats[1], "dialogue"), body).toBe("B");
      expect(beats[1]?.extended, body).toBeUndefined();
    }
  });

  test("a picture on the continuation's line runs at the click", async () => {
    const { beats } = await beatsOf(`  A .. >\n  .. [[b]]B`, 2);
    expect(beats[0]?.image).toBeUndefined();
    expect(shown(beats[1])).toBe("A B");
    expect(Object.keys(beats[1]?.image ?? {})).toEqual(["portrait"]);
  });

  test("a line shown between the parts takes the box away", async () => {
    // A picture line's beat has no text, so the next beat folds into it.
    for (const between of ["Other.", "[[b]]"]) {
      const { beats } = await beatsOf(`  A .. >\n  ${between}\n  .. B`, 3);
      const last = beats.filter((beat) => shown(beat)).at(-1);
      expect(shown(last), between).toBe("B");
      expect(last?.extended, between).toBeUndefined();
    }
  });

  test("a branch that shows nothing leaves the line after its block to its own mark", async () => {
    const marked = await beatsOf(
      `  A .. >\n  if false then\n    B\n  end\n  .. C`,
      2,
    );
    expect(marked.beats.map(shown)).toEqual(["A", "A C"]);
    const unmarked = await beatsOf(
      `  A .. >\n  if false then\n    .. B\n  end\n  C`,
      2,
    );
    expect(unmarked.beats.map(shown)).toEqual(["A", "C"]);
    expect(unmarked.beats[1]?.extended).toBeUndefined();
    const taken = await beatsOf(
      `  A .. >\n  if true then\n    .. B\n  end\n  C`,
      3,
    );
    expect(taken.beats.map(shown)).toEqual(["A", "A B", "C"]);
    expect(taken.beats[2]?.extended).toBeUndefined();
    // A branch that ends with `.. >` offers its box to the line after the
    // block.
    const inside = await beatsOf(
      `  if true then\n    A .. >\n  end\n  .. C`,
      2,
    );
    expect(inside.beats.map(shown)).toEqual(["A", "A C"]);
  });

  test("a cue on a continuation of only pictures names the box's speaker", async () => {
    const { beats } = await beatsOf(
      `  HERO: A .. >\n  BOB: .. [[b]] ..\n  .. C`,
      2,
    );
    expect(on(beats[1], "character_name")).toBe("BOB");
    expect(on(beats[1], "dialogue")).toBe("A C");
    expect(Object.keys(beats[1]?.image ?? {})).toEqual(["portrait"]);
  });

  test("a parenthetical on the continuation's cue replaces the one shown", async () => {
    const replaced = await beatsOf(
      `  HERO (softly): Quiet .. >\n  HERO (loudly): .. now!`,
      2,
    );
    expect(on(replaced.beats[0], "character_parenthetical")).toBe("(softly)");
    expect(on(replaced.beats[1], "character_parenthetical")).toBe("(loudly)");
    expect(on(replaced.beats[1], "dialogue")).toBe("Quiet now!");
    expect(
      replaced.beats[1]?.extended?.["character_parenthetical"],
    ).toBeUndefined();
    const kept = await beatsOf(`  HERO (softly): Quiet .. >\n  .. now.`, 2);
    expect(on(kept.beats[1], "character_parenthetical")).toBe("(softly)");
    expect(kept.beats[1]?.extended?.["character_parenthetical"]).toBe(1);
  });

  test("a new program drops the box the replaced one left", async () => {
    const { harness, beats } = await beatsOf(`  A .. >\n  .. B`, 1);
    expect(shown(beats[0])).toBe("A");
    (harness.game.module.interpreter as any).onProgramUpdate();
    const next = harness.nextBeat();
    expect(shown(next)).toBe("B");
    expect(next?.extended).toBeUndefined();
  });

  test("a continuation may repeat the text before it", async () => {
    const { beats } = await beatsOf(`  A.. >\n  ..A`, 2);
    expect(shown(beats[1])).toBe("AA");
    expect(beats[1]?.extended).toEqual({ action: 1 });
  });

  test("choices after an extended box attach to it as to any box", async () => {
    const { beats } = await beatsOf(
      `  choose\n    HERO: Pick .. >\n    .. one.\n    * One\n    * Two\n  end`,
      2,
    );
    expect(shown(beats[0])).toBe("Pick");
    expect(on(beats[1], "dialogue")).toBe("Pick one.");
    expect(beats[1]?.choices).toHaveLength(2);
  });
});

describe("the extended beat on the page", () => {
  test("writes the box's text at once and reveals only the continuation", async () => {
    const { harness, beats } = await beatsOf(`  HERO: First .. > .. second.`, 2);
    harness.reset();
    await harness.display(beats[1]!, false);
    await flushMicrotasks();
    // One write per target: the box's text, marked `shown` so the page shows
    // it at once, then the continuation, revealed from the beat's time.
    const dialogue = writesTo(harness, "dialogue");
    expect(dialogue).toHaveLength(1);
    const [write] = dialogue;
    expect(write.params.instant).toBe(false);
    expect(write.params.time).toBeDefined();
    expect(write.params.shown).toBe("First ".length);
    const events: any[] = write.params.instructions;
    const kept = events.slice(0, write.params.shown);
    const typed = events.slice(write.params.shown);
    expect(kept.map((e) => e.text).join("")).toBe("First ");
    expect(kept.every((e) => e.after == null && e.over == null)).toBe(true);
    expect(typed.map((e) => e.text).join("")).toBe("second.");
    // The continuation types from the start of the beat.
    expect(typed[0].after ?? 0).toBe(0);
    expect(typed.at(-1).after).toBeGreaterThan(0);
    // The name the box shows is written again, all of it shown at once.
    const name = writesTo(harness, "character_name");
    expect(name).toHaveLength(1);
    expect(name[0].params.shown).toBe(name[0].params.instructions.length);
    expect(name[0].params.instructions.map((e: any) => e.text).join("")).toBe(
      "HERO",
    );
    // Only the continuation plays the typing sound: as many tones as the
    // same words typed in a box of their own.
    const alone = await beatsOf(`  HERO: second.`, 1);
    expect(tones(beats[1])).toBeGreaterThan(0);
    expect(tones(beats[1])).toBe(tones(alone.beats[0]));
  });

  test("keeps the portrait and the sound and voice the first part started", async () => {
    const { harness } = await beatsOf(
      `  HERO:\n    [[a]]\n    First .. >\n    .. second.`,
      0,
    );
    const played = coordinated(harness);
    const first = harness.nextBeat()!;
    await played.play(first);
    expect(played.stopped).toEqual(["sound", "voice", "typewriter"]);
    expect(played.clearedImages).toHaveLength(1);
    const second = harness.nextBeat()!;
    expect(second.image).toBeUndefined();
    await played.play(second);
    expect(played.stopped).toEqual(["typewriter"]);
    expect(played.clearedImages).toEqual([]);
  });

  test("a continuation of only pictures keeps the box, its pictures and its sound", async () => {
    const { harness } = await beatsOf(`  HERO: First .. >\n  .. [[b]]`, 0);
    const played = coordinated(harness);
    await played.play(harness.nextBeat()!);
    const second = harness.nextBeat()!;
    expect(second.text).toBeUndefined();
    expect(second.extended).toEqual({});
    expect(Object.keys(second.image ?? {})).toEqual(["portrait"]);
    await played.play(second);
    expect(played.stopped).toEqual(["typewriter"]);
    expect(played.clearedImages).toEqual([]);
    expect(played.clearedText).toEqual([]);
  });
});

/** Play beats through the real Coordinator, recording which audio channels
 *  it stops and which layers it clears. */
function coordinated(harness: UIHarness) {
  const game = harness.game as Game;
  game.context.system.previewing = undefined;
  const out = {
    stopped: [] as string[],
    clearedImages: [] as string[][],
    clearedText: [] as string[][],
    async play(beat: Instructions) {
      out.stopped.length = 0;
      out.clearedImages.length = 0;
      out.clearedText.length = 0;
      const coordinator = new Coordinator(game, beat);
      for (let i = 0; i < 20 && !(coordinator as any)._startedExecution; i++) {
        coordinator.onUpdate({ deltaMS: 16 } as any);
        await flushMicrotasks(10);
      }
      expect((coordinator as any)._startedExecution).toBe(true);
    },
  };
  vi.spyOn(game.module.audio, "stopChannel").mockImplementation(
    (channel: string) => {
      out.stopped.push(channel);
      return 0;
    },
  );
  vi.spyOn(game.module.ui.image, "clearAll").mockImplementation(
    async (targets: string[]) => {
      out.clearedImages.push(targets);
    },
  );
  const clearText = game.module.ui.text.clearAll.bind(game.module.ui.text);
  vi.spyOn(game.module.ui.text, "clearAll").mockImplementation(
    async (targets: string[]) => {
      out.clearedText.push(targets);
      await clearText(targets);
    },
  );
  return out;
}

// The scrub path: an unconnected game replays the route to the line, and its
// checkpoint is loaded into a connected game that previews it.
async function scrubTo(source: string, line: number) {
  const simulator = createHarness(source, line, { connect: false });
  const simulated: any = simulator.game;
  simulated.setStartFrom({ file: MAIN_URI, line }, "last");
  simulated.simulate();
  expect(simulated.simulation).toBe("success");
  const checkpoint: string = simulated.save();
  const player = createHarness(source, line, { loadCheckpoint: checkpoint });
  await player.ready;
  const portrait = () =>
    flattenMessages(player.messages)
      .filter(
        (m) => m.method === "ui/write-image" && m.params.target === "portrait",
      )
      .map((m) => JSON.stringify(m.params.instructions));
  const restored = portrait();
  player.reset();
  await player.preview(line);
  await flushMicrotasks();
  const text = (target: string) =>
    writesTo(player, target)
      .map((m) =>
        (m.params.instructions as any[]).map((e) => e.text ?? "").join(""),
      )
      .join("");
  const pictures = [...restored, ...portrait()];
  return {
    dialogue: text("dialogue"),
    name: text("character_name"),
    // The last picture the portrait layer was given.
    portrait: pictures.findLast((write) => write.includes(".png")) ?? "",
  };
}

describe("the preview, checkpoints and PLAY", () => {
  const SOURCE = story(
    `  CHARACTER:\n    [[a]]\n    First .. >\n    .. [[b]]\n    second.`,
  );
  const lineOf = (needle: string) =>
    SOURCE.split("\n").findIndex((l) => l.includes(needle));

  test.each([
    ["[[a]]", "a.png", "First"],
    ["First .. >", "a.png", "First"],
    ["[[b]]", "b.png", "First second."],
    ["second.", "b.png", "First second."],
  ])(
    "the cursor on the `%s` line shows %s and %s",
    async (needle, picture, text) => {
      const result = await scrubTo(SOURCE, lineOf(needle));
      expect(result.dialogue).toBe(text);
      expect(result.portrait).toContain(picture);
    },
  );

  test("a checkpoint taken at the continuation shows the whole box", async () => {
    const line = lineOf("second.");
    const simulator = createHarness(SOURCE, line, { connect: false });
    const simulated: any = simulator.game;
    simulated.setStartFrom({ file: MAIN_URI, line });
    simulated.simulate();
    expect(simulated.simulation).toBe("success");
    const player = createHarness(SOURCE, line, {
      loadCheckpoint: simulated.save(),
    });
    await player.ready;
    const beat = player.nextBeat();
    expect(on(beat, "dialogue")).toBe("First second.");
    // The earlier text is written at once, and the continuation typed.
    expect(beat?.extended?.["dialogue"]).toBe("First ".length);
  });

  test("PLAY from the continuation line shows the whole box, typing only the continuation", async () => {
    const line = lineOf("second.");
    const simulator = createHarness(SOURCE, line, { connect: false });
    const simulated: any = simulator.game;
    simulated.setStartFrom({ file: MAIN_URI, line }, "first");
    simulated.simulate();
    expect(simulated.simulation).toBe("success");
    const player = createHarness(SOURCE, line, {
      loadCheckpoint: simulated.save(),
      beforeConnect: (game) => {
        game.context.system.previewing = undefined;
      },
    });
    await player.ready;
    const beat = player.nextBeat()!;
    player.reset();
    await player.display(beat, false);
    await flushMicrotasks();
    const [write] = writesTo(player, "dialogue");
    const events = write?.params.instructions as any[];
    expect(write?.params.instant).toBe(false);
    expect(write?.params.shown).toBe("First ".length);
    expect(
      events.slice(0, write?.params.shown).map((e) => e.text).join(""),
    ).toBe("First ");
    expect(
      events.slice(write?.params.shown).map((e) => e.text).join(""),
    ).toBe("second.");
  });
});
