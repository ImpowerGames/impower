// A `..` after a `>` break waits for a click and then carries on in the same
// box. The continuation's beat shows the box's text again at once, then types
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

describe("a `..` after a break carries on in the box", () => {
  test("`First > .. second.` shows First, then First second.", async () => {
    const { beats } = await beatsOf(`  First > .. second.`, 2);
    expect(beats.map(shown)).toEqual(["First", "First second."]);
    expect(beats[0]?.extended).toBeUndefined();
    expect(beats[1]?.extended).toEqual({ action: "First ".length });
  });

  test("`Abso >..` then `lutely!` shows Absolutely!", async () => {
    const { beats } = await beatsOf(`  Abso >..\n  lutely!`, 2);
    expect(beats.map(shown)).toEqual(["Abso", "Absolutely!"]);
  });

  test("a chain of three adds to the box at each click", async () => {
    const { beats } = await beatsOf(`  One > .. two > .. three.\n  After.`, 4);
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
      `  ???: Hello... > ..\n  ALICE: It's me.`,
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
    const { beats } = await beatsOf(`  HERO: Hold > ..\n  on tight.`, 2);
    expect(on(beats[1], "character_name")).toBe("HERO");
    expect(on(beats[1], "dialogue")).toBe("Hold on tight.");
    expect(beats[1]?.extended).toEqual({
      dialogue: "Hold ".length,
      character_name: 1,
    });
  });

  test("a parenthetical on a line of its own replaces the one shown", async () => {
    const { beats } = await beatsOf(
      `  HERO:\n    Quiet > ..\n    (louder)\n    now!`,
      2,
    );
    expect(on(beats[0], "character_parenthetical")).toBe("");
    expect(on(beats[1], "character_parenthetical")).toBe("(louder)");
    expect(on(beats[1], "dialogue")).toBe("Quiet now!");
  });

  test("an action box extended by a cue gets the text and no name", async () => {
    const { beats } = await beatsOf(`  Knock > ..\n  BOB: Who's there?`, 2);
    expect(on(beats[1], "action")).toBe("Knock Who's there?");
    expect(beats[1]?.text?.["character_name"]).toBeUndefined();
    expect(beats[1]?.text?.["dialogue"]).toBeUndefined();
  });

  test("`A .. >` followed by a cue keeps the first speaker in one beat", async () => {
    const { beats } = await beatsOf(`  HERO: A .. >\n  BOB: B\n  C`, 2);
    expect(on(beats[0], "character_name")).toBe("HERO");
    expect(on(beats[0], "dialogue")).toBe("A B");
    expect(beats[0]?.extended).toBeUndefined();
    expect(shown(beats[1])).toBe("C");
    expect(beats[1]?.extended).toBeUndefined();
  });

  test("an asset line between the parts runs at the click", async () => {
    const { beats } = await beatsOf(`  A > ..\n  [[b]]\n  B`, 2);
    expect(beats[0]?.image).toBeUndefined();
    expect(shown(beats[1])).toBe("A B");
    expect(Object.keys(beats[1]?.image ?? {})).toEqual(["portrait"]);
  });

  test("a display line between the break and a `..` extends nothing", async () => {
    const { beats } = await beatsOf(`  A >\n  Other ..\n  B`, 2);
    expect(beats.map(shown)).toEqual(["A", "Other B"]);
    expect(beats[1]?.extended).toBeUndefined();
  });

  test("choices after an extended box attach to it as to any box", async () => {
    const { beats } = await beatsOf(
      `  choose\n    HERO: Pick > ..\n    one.\n    * One\n    * Two\n  end`,
      2,
    );
    expect(shown(beats[0])).toBe("Pick");
    expect(on(beats[1], "dialogue")).toBe("Pick one.");
    expect(beats[1]?.choices).toHaveLength(2);
  });
});

describe("the extended beat on the page", () => {
  test("writes the box's text at once and reveals only the continuation", async () => {
    const { harness, beats } = await beatsOf(`  HERO: First > .. second.`, 2);
    harness.reset();
    await harness.display(beats[1]!, false);
    await flushMicrotasks();
    const dialogue = writesTo(harness, "dialogue");
    expect(dialogue).toHaveLength(2);
    const [kept, typed] = dialogue;
    expect(kept.params.instant).toBe(true);
    expect(kept.params.time).toBeUndefined();
    const keptEvents: any[] = kept.params.instructions;
    expect(keptEvents.map((e) => e.text).join("")).toBe("First ");
    expect(keptEvents.every((e) => e.after == null && e.over == null)).toBe(
      true,
    );
    expect(typed.params.instant).toBe(false);
    expect(typed.params.time).toBeDefined();
    const typedEvents: any[] = typed.params.instructions;
    expect(typedEvents.map((e) => e.text).join("")).toBe("second.");
    // The continuation types from the start of the beat.
    expect(typedEvents[0].after ?? 0).toBe(0);
    expect(typedEvents.at(-1).after).toBeGreaterThan(0);
    // The name the box shows is written again at once, as it stands.
    const name = writesTo(harness, "character_name");
    expect(name).toHaveLength(1);
    expect(name[0].params.instant).toBe(true);
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
      `  HERO:\n    [[a]]\n    First > ..\n    second.`,
      0,
    );
    const game = harness.game as Game;
    game.context.system.previewing = undefined;
    const stopped: string[] = [];
    const cleared: string[][] = [];
    vi.spyOn(game.module.audio, "stopChannel").mockImplementation(
      (channel: string) => {
        stopped.push(channel);
        return 0;
      },
    );
    vi.spyOn(game.module.ui.image, "clearAll").mockImplementation(
      async (targets: string[]) => {
        cleared.push(targets);
      },
    );
    const play = async (beat: Instructions) => {
      stopped.length = 0;
      cleared.length = 0;
      const coordinator = new Coordinator(game, beat);
      for (let i = 0; i < 20 && !(coordinator as any)._startedExecution; i++) {
        coordinator.onUpdate({ deltaMS: 16 } as any);
        await flushMicrotasks(10);
      }
      expect((coordinator as any)._startedExecution).toBe(true);
    };
    const first = harness.nextBeat()!;
    await play(first);
    expect(stopped).toEqual(["sound", "voice", "typewriter"]);
    expect(cleared).toHaveLength(1);
    const second = harness.nextBeat()!;
    expect(second.image).toBeUndefined();
    await play(second);
    expect(stopped).toEqual(["typewriter"]);
    expect(cleared).toEqual([]);
  });
});

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
    `  CHARACTER:\n    [[a]]\n    First > ..\n    [[b]]\n    second.`,
  );
  const lineOf = (needle: string) =>
    SOURCE.split("\n").findIndex((l) => l.includes(needle));

  test.each([
    ["[[a]]", "a.png", "First"],
    ["First > ..", "a.png", "First"],
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
    const [kept, typed] = writesTo(player, "dialogue");
    expect(kept?.params.instant).toBe(true);
    expect(
      (kept?.params.instructions as any[]).map((e) => e.text).join(""),
    ).toBe("First ");
    expect(
      (typed?.params.instructions as any[]).map((e) => e.text).join(""),
    ).toBe("second.");
  });
});
