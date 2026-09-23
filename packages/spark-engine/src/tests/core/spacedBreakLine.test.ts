// A line that a spaced `>` breaks holds several beats, each with its own path
// on that line. The preview of the line shows its last beat, with everything
// the beats before it did, and PLAY from the line starts at its first, so the
// player sees them all.
//
// The preview is driven through the production scrub path: an UNCONNECTED
// game plans and replays the route to the line (what `workspace.worker`
// does, routing to the line's last beat), and its checkpoint is loaded into a
// CONNECTED game that previews the point (what the player does).

import { describe, expect, test } from "vitest";
import { findClosestPath } from "../../game/core/utils/findClosestPath";
import { pathLocation } from "@impower/sparkdown/src/compiler/utils/pathLocationTable";
import { createHarness, MAIN_URI } from "../ui/harness/uiTestHarness";

// The builtin `main` layout, whose backdrop is a persistent picture slot.
const SOURCE = `define BG as image with
  src = "https://example.com/bg.png"
end

-> start

scene start
  HERO: [[show backdrop BG]] One. > Two. > Three.
  HERO: A > > B
  HERO: Before > -> later
end

scene later
  HERO: Later.
  Next.
end
`;

const lineOf = (needle: string): number =>
  SOURCE.split("\n").findIndex((l) => l.includes(needle));
const THREE = lineOf("One. > Two. > Three.");
const EMPTY_MIDDLE = lineOf("A > > B");

/** Every character the engine wrote to the screen, across all targets. */
const writtenText = (harness: any): string =>
  harness
    .snapshotFiltered("ui/write-text")
    .map((m: any) =>
      (m?.params?.instructions ?? []).map((i: any) => i.text ?? "").join(""),
    )
    .join(" ");

/** The body text of a beat, leaving out the cue. */
const body = (beat: any): string =>
  Object.entries(beat?.text ?? {})
    .filter(([target]) => !target.startsWith("character_"))
    .flatMap(([, events]) => events as any[])
    .map((e: any) => e.text ?? "")
    .join("");

/** Preview `line` the way the editor does. */
async function scrubTo(line: number) {
  const simulator = createHarness(SOURCE, line, { connect: false });
  const simulated: any = simulator.game;
  simulated.setStartFrom({ file: MAIN_URI, line }, "last");
  simulated.simulate();
  expect(simulated.simulation).toBe("success");
  const checkpoint = simulated.save();

  const player = createHarness(SOURCE, line, { loadCheckpoint: checkpoint });
  await player.ready;
  // What the restore and the preview put on the backdrop, together.
  const backdrop = (): string[] =>
    flatten(player.messages)
      .filter(
        (m: any) =>
          m?.method === "ui/write-image" && m.params?.target === "backdrop",
      )
      .map((m: any) => JSON.stringify(m.params.instructions));
  const restored = backdrop();
  player.reset();
  await player.preview(line);
  return { text: writtenText(player), backdrop: [...restored, ...backdrop()] };
}

const flatten = (messages: any[]): any[] =>
  messages.flatMap((m: any) =>
    m?.method === "ui/batch" ? flatten(m.params?.messages ?? []) : [m],
  );

/** The beats PLAY from `line` shows, in order. */
async function playFrom(line: number, count: number) {
  const harness = createHarness(SOURCE, line);
  await harness.ready;
  harness.game.setStartFrom({ file: MAIN_URI, line });
  const startPath = harness.game.startPath;
  expect(startPath).toBeTruthy();
  harness.jumpTo(startPath!);
  const beats: string[] = [];
  for (let i = 0; i < count; i++) beats.push(body(harness.nextBeat()));
  return beats;
}

describe("a line that `>` breaks", () => {
  test("holds its beats on the same line, the first for PLAY and the last for the preview", () => {
    const { game } = createHarness(SOURCE, THREE, { connect: false });
    const program = game.program;
    const scripts = Object.keys(program.scripts);
    const at = (beat: "first" | "last") =>
      findClosestPath(
        { file: MAIN_URI, line: THREE },
        program.pathLocations,
        scripts,
        beat,
      );
    const first = at("first");
    const last = at("last");
    expect(first).toBeTruthy();
    expect(last).toBeTruthy();
    expect(last).not.toBe(first);
    expect(pathLocation(program.pathLocations, first)?.[1]).toBe(THREE);
    expect(pathLocation(program.pathLocations, last)?.[1]).toBe(THREE);
  });

  test("the preview of the line shows its last beat, with what the earlier beats did", async () => {
    const { text, backdrop } = await scrubTo(THREE);
    expect(text).toContain("Three.");
    expect(text).not.toContain("One.");
    expect(text).not.toContain("Two.");
    // The first beat showed the backdrop; the previewed beat still has it.
    expect(backdrop.some((write) => write.includes("bg.png"))).toBe(true);
  });

  test("PLAY from the line starts at its first beat", async () => {
    expect(await playFrom(THREE, 3)).toEqual(["One.", "Two.", "Three."]);
  });

  test("an empty beat between two breaks sorts after the beat before it", async () => {
    expect(await playFrom(EMPTY_MIDDLE, 3)).toEqual(["A", "", "B"]);
  });

  test("a break before a divert keeps the line's own beat first", async () => {
    // The range after the break holds only the divert, so its call shows no
    // text of its own; it still belongs where it stands on the line.
    const line = lineOf("Before > -> later");
    const { game } = createHarness(SOURCE, line, { connect: false });
    const scripts = Object.keys(game.program.scripts);
    const at = (beat: "first" | "last") =>
      findClosestPath(
        { file: MAIN_URI, line },
        game.program.pathLocations,
        scripts,
        beat,
      );
    expect(at("first")).not.toBe(at("last"));
    expect(await playFrom(line, 2)).toEqual(["Before", "Later."]);
  });
});
