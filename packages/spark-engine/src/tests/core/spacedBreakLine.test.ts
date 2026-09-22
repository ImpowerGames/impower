// A line that a spaced `>` breaks holds two beats, each with its own path on
// that line. The preview of the line shows its last beat, and PLAY from the
// line starts at its first, so the player sees both.
//
// The preview is driven through the production scrub path: an UNCONNECTED
// game plans and replays the route to the line (what `workspace.worker`
// does), and its checkpoint is loaded into a CONNECTED game that previews the
// point (what the player does).

import { describe, expect, test } from "vitest";
import { findClosestPath } from "../../game/core/utils/findClosestPath";
import { pathLocation } from "@impower/sparkdown/src/compiler/utils/pathLocationTable";
import { createHarness, MAIN_URI } from "../ui/harness/uiTestHarness";

const SOURCE = `-> start

scene start
  HERO: Hi. > Bye.
  Next.
end
`;

const LINE = SOURCE.split("\n").findIndex((l) => l.includes("Hi. > Bye."));

/** Every character the engine wrote to the screen, across all targets. */
const writtenText = (harness: any): string =>
  harness
    .snapshotFiltered("ui/write-text")
    .map((m: any) =>
      (m?.params?.instructions ?? []).map((i: any) => i.text ?? "").join(""),
    )
    .join(" ");

describe("a line that `>` breaks", () => {
  test("holds two beats on the same line, the first for PLAY and the last for the preview", () => {
    const { game } = createHarness(SOURCE, LINE, { connect: false });
    const program = game.program;
    const scripts = Object.keys(program.scripts);
    const first = findClosestPath(
      { file: MAIN_URI, line: LINE },
      program.pathLocations,
      scripts,
      "first",
    );
    const last = findClosestPath(
      { file: MAIN_URI, line: LINE },
      program.pathLocations,
      scripts,
      "last",
    );
    expect(first).toBeTruthy();
    expect(last).toBeTruthy();
    expect(last).not.toBe(first);
    expect(pathLocation(program.pathLocations, first)?.[1]).toBe(LINE);
    expect(pathLocation(program.pathLocations, last)?.[1]).toBe(LINE);
  });

  test("the preview of the line shows its last beat", async () => {
    const simulator = createHarness(SOURCE, LINE, { connect: false });
    const simulated: any = simulator.game;
    simulated.setStartFrom({ file: MAIN_URI, line: LINE });
    simulated.simulate();
    expect(simulated.simulation).toBe("success");
    const checkpoint = simulated.save();

    const player = createHarness(SOURCE, LINE, { loadCheckpoint: checkpoint });
    await player.ready;
    player.reset();
    await player.preview(LINE);
    const text = writtenText(player);
    expect(text).toContain("Bye.");
    expect(text).not.toContain("Hi.");
  });

  test("PLAY from the line starts at its first beat", async () => {
    const harness = createHarness(SOURCE, LINE);
    await harness.ready;
    harness.game.setStartFrom({ file: MAIN_URI, line: LINE });
    const startPath = harness.game.startPath;
    expect(startPath).toBeTruthy();
    harness.jumpTo(startPath!);
    const body = (beat: any) =>
      ((beat?.text?.dialogue ?? []) as any[]).map((e) => e.text).join("");
    expect(body(harness.nextBeat())).toBe("Hi.");
    expect(body(harness.nextBeat())).toBe("Bye.");
  });
});
