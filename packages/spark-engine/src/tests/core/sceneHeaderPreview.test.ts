// Previewing a scene's header line, or a line above the scene's first content
// line, displays the scene's first beat (#1096).
//
// Driven through the production scrub path: an UNCONNECTED game plans and
// replays the route (what `workspace.worker` does) and its checkpoint is loaded
// into a fresh CONNECTED game that previews the point (what the player does).

import { describe, expect, test } from "vitest";
import { programLocator } from "@impower/sparkdown/src/compiler/utils/programLocator";
import { createHarness, MAIN_URI } from "../ui/harness/uiTestHarness";

// The reproduction from the issue, verbatim.
const SOURCE = `-> START

scene START

  The door opens.

  The door closes.
end
`;

const lineOf = (needle: string): number => {
  const line = SOURCE.split("\n").findIndex((l) => l.includes(needle));
  if (line < 0) {
    throw new Error(`fixture has no line containing ${JSON.stringify(needle)}`);
  }
  return line;
};

/** Every character the engine wrote to the screen, across all targets. */
const writtenText = (harness: any): string =>
  harness
    .snapshotFiltered("ui/write-text")
    .map((m: any) =>
      (m?.params?.instructions ?? []).map((i: any) => i.text ?? "").join(""),
    )
    .join(" ");

/** Scrub to `line` the way the editor does, and return what got written. */
async function scrubTo(line: number) {
  const simulator = createHarness(SOURCE, 0, { connect: false });
  const simulated: any = simulator.game;
  simulated.setStartFrom({ file: MAIN_URI, line });
  simulated.simulate();
  const simulation = simulated.simulation;
  const checkpoint = simulated.save();

  const player = createHarness(SOURCE, line, { loadCheckpoint: checkpoint });
  await player.ready;
  player.reset();
  await player.preview(line);
  return { simulation, text: writtenText(player) };
}

describe("previewing a scene's header (#1096)", () => {
  test("the header line resolves to the scene's first beat", () => {
    const harness = createHarness(SOURCE, 0, { connect: false });
    const locator = programLocator(harness.game.program);
    const header = locator.addressAt(MAIN_URI, lineOf("scene START"), {
      beat: "last",
    });
    const first = locator.addressAt(MAIN_URI, lineOf("The door opens."), {
      beat: "last",
    });
    expect(first).toBeDefined();
    expect(header).toBe(first);
  });

  test("the scene header line previews the scene's first beat", async () => {
    const { simulation, text } = await scrubTo(lineOf("scene START"));
    expect(simulation).toBe("success");
    expect(text).toContain("The door opens.");
    expect(text).not.toContain("The door closes.");
  });

  test("the divert above the scene previews the scene's first beat", async () => {
    const { simulation, text } = await scrubTo(lineOf("-> START"));
    expect(simulation).toBe("success");
    expect(text).toContain("The door opens.");
    expect(text).not.toContain("The door closes.");
  });

  test("a line inside the scene still previews its own beat", async () => {
    const { simulation, text } = await scrubTo(lineOf("The door closes."));
    expect(simulation).toBe("success");
    expect(text).toContain("The door closes.");
  });
});
